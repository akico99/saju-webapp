'use strict';
/* 카드 결제(토스페이먼츠 결제위젯 v2) — 포인트를 카드로 충전하는 경로.
   흐름: 충전 페이지(금액 선택) → POST /pay/prepare(주문 생성) → pay.html에서 결제위젯 →
   successUrl(pay-success.html) → POST /pay/confirm(서버 승인) → 포인트 지급.

   키는 .env의 TOSS_CLIENT_KEY / TOSS_SECRET_KEY. 시크릿이 test_로 시작하면 테스트 모드다:
   결제창·승인 API는 실제와 똑같이 돌지만 카드에 청구되지 않으므로 포인트도 지급하지 않는다
   (그렇지 않으면 심사 기간에 누구나 공짜 포인트를 만들 수 있다). PG 계약이 끝나 live_ 키를
   넣으면 코드 변경 없이 실결제·자동 지급으로 바뀐다. */
const express = require('express');
const users = require('../../db/users');
const cardPayments = require('../../db/cardPayments');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// 토스 문서의 공용 테스트 클라이언트 키 — 계정 키가 없을 때의 폴백(브라우저에 노출되는 용도의 키).
const CLIENT_KEY = process.env.TOSS_CLIENT_KEY || process.env.TOSS_TEST_CLIENT_KEY || 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
const SECRET_KEY = process.env.TOSS_SECRET_KEY || process.env.TOSS_TEST_SECRET_KEY || '';
const CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';
const TEST_MODE = !SECRET_KEY.startsWith('live_');

const MIN_KRW = 1000, MAX_KRW = 500000;

router.get('/pay/config', requireAuth, (req, res) => {
  res.json({ clientKey: CLIENT_KEY, testMode: TEST_MODE, minKrw: MIN_KRW, maxKrw: MAX_KRW });
});

// 결제창을 열기 전에 주문을 만든다 — 금액은 여기서 확정되고 confirm에서 대조한다.
router.post('/pay/prepare', requireAuth, (req, res) => {
  const amountKrw = Number(req.body.amountKrw);
  if (!Number.isInteger(amountKrw) || amountKrw < MIN_KRW || amountKrw > MAX_KRW || amountKrw % 100 !== 0) {
    return res.status(400).json({ error: `충전 금액은 ${MIN_KRW.toLocaleString('ko-KR')}원 이상 ${MAX_KRW.toLocaleString('ko-KR')}원 이하, 100원 단위여야 합니다.` });
  }
  const user = users.findById(req.session.userId);
  const orderName = `포인트 충전 ${amountKrw.toLocaleString('ko-KR')}P`;
  const row = cardPayments.create({ userId: user.id, amountKrw, orderName, testMode: TEST_MODE });
  res.json({
    orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw,
    customerEmail: user.email, customerName: user.name || '고객', testMode: TEST_MODE
  });
});

// successUrl에서 돌아온 뒤 — paymentKey/orderId/amount로 승인을 완료하고 포인트를 지급한다.
router.post('/pay/confirm', requireAuth, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body;
  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });
  }
  const row = cardPayments.findByOrderId(orderId);
  if (!row || row.user_id !== req.session.userId) {
    return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  }
  // 새로고침 등으로 두 번 호출돼도 두 번 지급하지 않는다.
  if (row.status === 'paid') {
    return res.json({ payment: summarize(row), alreadyConfirmed: true });
  }
  if (Number(amount) !== row.amount_krw) {
    cardPayments.markFailed(row, `금액 불일치: 요청 ${amount}, 주문 ${row.amount_krw}`);
    return res.status(400).json({ error: '결제 금액이 주문 금액과 다릅니다. 결제가 승인되지 않았습니다.' });
  }
  if (!SECRET_KEY) {
    return res.status(503).json({ error: '결제 서버 설정이 아직 완료되지 않았습니다(TOSS_SECRET_KEY 없음).' });
  }

  const basicAuth = Buffer.from(`${SECRET_KEY}:`).toString('base64');
  try {
    const tossRes = await fetch(CONFIRM_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: row.amount_krw })
    });
    const data = await tossRes.json();
    if (!tossRes.ok) {
      cardPayments.markFailed(row, `${data.code || tossRes.status} ${data.message || ''}`);
      return res.status(tossRes.status).json({ error: data.message || '결제 승인에 실패했습니다.', code: data.code });
    }
    const paid = cardPayments.markPaid(row, { paymentKey, method: data.method, approvedAt: data.approvedAt });
    const user = users.findById(req.session.userId);
    res.json({ payment: summarize(paid), pointBalance: user.point_balance });
  } catch (e) {
    cardPayments.markFailed(row, e.message);
    res.status(500).json({ error: '결제 승인 서버 호출 중 오류: ' + e.message });
  }
});

router.get('/pay/mine', requireAuth, (req, res) => {
  res.json({ payments: cardPayments.listByUser(req.session.userId).map(summarize) });
});

function summarize(row) {
  return {
    orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw, status: row.status,
    method: row.method, testMode: !!row.test_mode, approvedAt: row.approved_at, createdAt: row.created_at
  };
}

module.exports = router;
