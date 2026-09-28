'use strict';
/* 카드 결제(토스페이먼츠 결제위젯 v2) — 상품 1건을 그 가격으로 단건 결제한다. 선불 충전 없음.

   흐름: 상품 폼 제출 → 잔액 부족(402) → POST /pay/prepare(상품·폼을 서버에 보관, 가격은 서버가 정함)
        → pay.html 결제위젯 → successUrl → POST /pay/confirm(토스 승인) → 같은 금액을 크레딧으로 올리고
        → 즉시 상품 start()가 차감·주문 생성·생성 시작 → 결과 페이지로.
   승인은 됐는데 상품을 시작하지 못하면(입력 오류·중복 주문 등) 크레딧을 회수하고 토스에 결제 취소를 요청한다.

   키는 .env의 TOSS_CLIENT_KEY / TOSS_SECRET_KEY. 시크릿이 live_로 시작하지 않으면 테스트 모드 —
   결제창·승인은 실제와 같지만 청구가 없다. 테스트 모드에서도 상품은 실제로 생성한다(심사자가 결제 후
   제공까지 봐야 하므로). 테스트 결제도 실제 리포트를 만들어 비용이 드니, 계정당 24시간에 TEST_LIMIT_PER_USER건까지만
   상품을 시작한다(결제 기록은 지우지 않고, 하루가 지나면 다시 쓸 수 있다). 건수는 TEST_LIMIT_PER_DAY 환경변수로 바꿀 수 있다. */
const express = require('express');
const users = require('../../db/users');
const cardPayments = require('../../db/cardPayments');
const consents = require('../../db/consents');
const { resolveProduct } = require('../products');
const { HttpError } = require('../httpError');
const { requireAuth } = require('../middleware/auth');
const { CLIENT_KEY, SECRET_KEY, TEST_MODE, confirmPayment, cancelPayment } = require('../tossPayments');

const router = express.Router();

const TEST_LIMIT_PER_USER = Number(process.env.TEST_LIMIT_PER_DAY) || 3;

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

// 결제창을 열기 직전 — 이용자가 결제 화면에서 직접 체크한 동의를 기록한다. 아직 현재 약관에 동의하지 않은
// 회원은 같은 화면에서 이용약관·개인정보·만 14세 동의도 함께 받는다(동의 페이지를 따로 거치지 않는다).
router.post('/pay/agree', requireAuth, (req, res) => {
  const { orderId, agreeOrder } = req.body || {};
  const row = orderId ? cardPayments.findByOrderId(orderId) : null;
  if (!row || row.user_id !== req.session.userId) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  if (row.status !== 'ready') return res.status(409).json({ error: '이미 처리된 주문입니다.', code: row.status });
  const needsSignup = !consents.hasSignupConsent(req.session.userId);
  if (agreeOrder !== true || (needsSignup && !consents.signupAgreed(req.body))) {
    return res.status(400).json({ error: '필수 항목에 모두 동의해 주세요.', code: 'consent_required' });
  }
  if (needsSignup) consents.recordSignupConsents(req.session.userId, req);
  consents.recordOrderConsent(req.session.userId, orderId, req);
  res.json({ ok: true });
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
  // 가입 동의·주문 동의 기록이 없는 결제는 승인하지 않는다(토스 승인 전이라 청구되지 않는다).
  if (!consents.hasSignupConsent(row.user_id) || !consents.hasOrderConsent(row.user_id, orderId)) {
    cardPayments.markFailed(row, '주문 동의 기록 없음');
    return res.status(400).json({ error: '주문 내용 확인 및 결제 동의가 확인되지 않아 결제를 진행하지 않았어요. 다시 시도해 주세요.', code: 'consent_required' });
  }
  if (Number(amount) !== row.amount_krw) {
    cardPayments.markFailed(row, `금액 불일치: 요청 ${amount}, 주문 ${row.amount_krw}`);
    return res.status(400).json({ error: '결제 금액이 주문 금액과 다릅니다. 결제가 승인되지 않았습니다.' });
  }
  if (!SECRET_KEY) return res.status(503).json({ error: '결제 서버 설정이 아직 완료되지 않았습니다(TOSS_SECRET_KEY 없음).' });
  if (row.test_mode && cardPayments.countPaidTest(row.user_id) >= TEST_LIMIT_PER_USER) {
    cardPayments.markFailed(row, '테스트 결제 한도 초과');
    return res.status(429).json({ error: `테스트 모드에서는 계정당 24시간에 ${TEST_LIMIT_PER_USER}건까지만 결제할 수 있어요. 내일 다시 시도해 주세요.` });
  }

  // 1) 토스 승인
  let approved;
  try {
    approved = await confirmPayment({ paymentKey, orderId, amount: row.amount_krw });
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
    // 승인은 됐지만 상품을 시작하지 못했다. 상품이 이미 차감까지 한 뒤 실패했다면 그쪽에서
    // refundPurchase가 이 결제를 선점해 카드 취소를 진행 중이다 — 그때는 두 번 취소하지 않는다.
    const reason = (e.body && e.body.error) || e.message || '상품 시작 실패';
    const status = e instanceof HttpError ? e.status : 500;
    const current = cardPayments.findById(paid.id);
    if (current.status !== 'paid') {
      return res.status(status).json({ error: `${reason} 결제는 자동으로 취소돼요.`, code: e.body && e.body.code, canceled: true });
    }
    // 차감 전에 실패했다 — 크레딧 회수 + 토스 결제 취소. 사용자에겐 이유를 그대로 보여준다.
    cardPayments.revertCredit(paid, reason);
    const cancel = await cancelPayment(paymentKey, reason);
    if (!cancel.ok) console.error('[pay] 결제 취소 실패 — 수동 취소 필요:', orderId, cancel.data);
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
