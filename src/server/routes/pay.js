'use strict';
/* 카드 결제(토스페이먼츠 결제위젯 v2) — 상품 1건을 그 가격으로 단건 결제한다. 선불 충전 없음.

   흐름: 상품 폼 제출 → 잔액 부족(402) → POST /pay/prepare(상품·폼을 서버에 보관, 가격은 서버가 정함)
        → pay.html 결제위젯 → successUrl → POST /pay/confirm(토스 승인) → 같은 금액을 크레딧으로 올리고
        → 즉시 상품 start()가 차감·주문 생성·생성 시작 → 결과 페이지로.
   승인은 됐는데 상품을 시작하지 못하면(입력 오류·중복 주문 등) 크레딧을 회수하고 토스에 결제 취소를 요청한다.

   키는 .env의 TOSS_CLIENT_KEY / TOSS_SECRET_KEY. 시크릿이 live_로 시작하지 않으면 테스트 모드 —
   결제창·승인은 실제와 같지만 청구가 없다. 테스트 모드에서도 상품은 실제로 생성한다(심사자가 결제 후
   제공까지 봐야 하므로). 남용을 막기 위해 계정당 테스트 결제는 TEST_LIMIT_PER_USER건까지만 상품을 시작한다. */
const express = require('express');
const users = require('../../db/users');
const cardPayments = require('../../db/cardPayments');
const { resolveProduct } = require('../products');
const { HttpError } = require('../httpError');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CLIENT_KEY = process.env.TOSS_CLIENT_KEY || process.env.TOSS_TEST_CLIENT_KEY || 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
const SECRET_KEY = process.env.TOSS_SECRET_KEY || process.env.TOSS_TEST_SECRET_KEY || '';
const API = 'https://api.tosspayments.com/v1/payments';
const TEST_MODE = !SECRET_KEY.startsWith('live_');
const TEST_LIMIT_PER_USER = 3;

const authHeader = () => `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`;

async function tossPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

router.get('/pay/config', requireAuth, (req, res) => {
  res.json({ clientKey: CLIENT_KEY, testMode: TEST_MODE });
});

// 결제창을 열기 전에 주문을 만든다 — 상품과 폼 입력을 보관하고 가격은 서버(points.PRICES)가 정한다.
router.post('/pay/prepare', requireAuth, (req, res) => {
  const { product, form } = req.body || {};
  const resolved = resolveProduct(product, form);
  if (!resolved) return res.status(400).json({ error: '알 수 없는 상품입니다.' });
  const user = users.findById(req.session.userId);
  const row = cardPayments.create({
    userId: user.id, amountKrw: resolved.price, orderName: resolved.label, testMode: TEST_MODE,
    productKey: resolved.productKey, form
  });
  res.json({
    orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw, page: resolved.page,
    customerEmail: user.email, customerName: user.name || '고객', testMode: TEST_MODE
  });
});

// successUrl에서 돌아온 뒤 — 승인하고, 바로 상품을 시작한다.
router.post('/pay/confirm', requireAuth, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body;
  if (!paymentKey || !orderId || !amount) return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });

  const row = cardPayments.findByOrderId(orderId);
  if (!row || row.user_id !== req.session.userId) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  // 새로고침 등으로 두 번 와도 두 번 시작하지 않는다.
  if (row.status === 'paid') return res.json({ payment: summarize(row), jobId: row.job_id, page: pageOf(row), alreadyConfirmed: true });
  if (row.status !== 'ready') return res.status(409).json({ error: '이미 처리된 주문입니다.', code: row.status });
  if (Number(amount) !== row.amount_krw) {
    cardPayments.markFailed(row, `금액 불일치: 요청 ${amount}, 주문 ${row.amount_krw}`);
    return res.status(400).json({ error: '결제 금액이 주문 금액과 다릅니다. 결제가 승인되지 않았습니다.' });
  }
  if (!SECRET_KEY) return res.status(503).json({ error: '결제 서버 설정이 아직 완료되지 않았습니다(TOSS_SECRET_KEY 없음).' });
  if (row.test_mode && cardPayments.countPaidTest(row.user_id) >= TEST_LIMIT_PER_USER) {
    cardPayments.markFailed(row, '테스트 결제 한도 초과');
    return res.status(429).json({ error: `테스트 모드에서는 계정당 ${TEST_LIMIT_PER_USER}건까지만 결제할 수 있어요.` });
  }

  // 1) 토스 승인
  let approved;
  try {
    approved = await tossPost(`${API}/confirm`, { paymentKey, orderId, amount: row.amount_krw });
  } catch (e) {
    cardPayments.markFailed(row, e.message);
    return res.status(500).json({ error: '결제 승인 서버 호출 중 오류: ' + e.message });
  }
  if (!approved.ok) {
    cardPayments.markFailed(row, `${approved.data.code || approved.status} ${approved.data.message || ''}`);
    return res.status(approved.status).json({ error: approved.data.message || '결제 승인에 실패했습니다.', code: approved.data.code });
  }

  // 2) 결제 금액만큼 크레딧 → 3) 즉시 상품 시작(같은 금액 차감). 정상이면 잔액 변동 0.
  const paid = cardPayments.markPaidAndCredit(row, { paymentKey, method: approved.data.method, approvedAt: approved.data.approvedAt });
  const form = JSON.parse(row.form_json || '{}');
  const resolved = resolveProduct(productOf(row.product_key), form);
  try {
    if (!resolved) throw new HttpError(400, { error: '알 수 없는 상품입니다.' });
    const payload = await resolved.start(row.user_id, form);
    cardPayments.setJob(paid, payload.jobId);
    return res.json({ payment: summarize(paid), jobId: payload.jobId, page: resolved.page, payload });
  } catch (e) {
    // 승인은 됐지만 상품을 시작하지 못했다 — 크레딧 회수 + 토스 결제 취소. 사용자에겐 이유를 그대로 보여준다.
    const reason = (e.body && e.body.error) || e.message || '상품 시작 실패';
    cardPayments.revertCredit(paid, reason);
    const cancel = await tossPost(`${API}/${encodeURIComponent(paymentKey)}/cancel`, { cancelReason: reason.slice(0, 200) }).catch((err) => ({ ok: false, data: { message: err.message } }));
    if (!cancel.ok) console.error('[pay] 결제 취소 실패 — 수동 취소 필요:', orderId, cancel.data);
    const status = e instanceof HttpError ? e.status : 500;
    return res.status(status).json({
      error: `${reason} 결제는 ${cancel.ok ? '자동으로 취소되었습니다' : '취소 요청 중 문제가 생겨 운영자가 확인 후 환불합니다'}.`,
      code: e.body && e.body.code, canceled: cancel.ok
    });
  }
});

router.get('/pay/mine', requireAuth, (req, res) => {
  res.json({ payments: cardPayments.listByUser(req.session.userId).map(summarize) });
});

// product_key → resolveProduct의 product 종류 (폼은 원장에 보관된 것을 그대로 쓴다)
function productOf(productKey) {
  if (productKey === 'full') return 'full';
  if (productKey === 'compat') return 'compat';
  if (productKey.startsWith('deep_')) return 'deep';
  if (productKey.startsWith('date_select_')) return 'date_select';
  return null;
}
function pageOf(row) {
  const r = resolveProduct(productOf(row.product_key || ''), JSON.parse(row.form_json || '{}'));
  return r ? r.page : '/mypage.html';
}
function summarize(row) {
  return {
    orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw, status: row.status,
    method: row.method, testMode: !!row.test_mode, approvedAt: row.approved_at, createdAt: row.created_at, jobId: row.job_id
  };
}

module.exports = router;
