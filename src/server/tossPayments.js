'use strict';
/* 토스페이먼츠 API 호출을 한 곳에 모은다 — 결제 승인(pay.js)과 결제 취소(refundPurchase.js)가 같이 쓴다.
   키는 .env의 TOSS_CLIENT_KEY / TOSS_SECRET_KEY. 시크릿이 live_로 시작하지 않으면 테스트 모드다. */
const CLIENT_KEY = process.env.TOSS_CLIENT_KEY || process.env.TOSS_TEST_CLIENT_KEY || 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
const SECRET_KEY = process.env.TOSS_SECRET_KEY || process.env.TOSS_TEST_SECRET_KEY || '';
const API = 'https://api.tosspayments.com/v1/payments';
const TEST_MODE = !SECRET_KEY.startsWith('live_');

const authHeader = () => `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`;

async function tossPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { Authorization: authHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function confirmPayment({ paymentKey, orderId, amount }) {
  return tossPost(`${API}/confirm`, { paymentKey, orderId, amount });
}

/** 결제 전액 취소. 네트워크 오류도 던지지 않고 { ok:false }로 돌려준다. */
function cancelPayment(paymentKey, reason) {
  if (!SECRET_KEY) return Promise.resolve({ ok: false, status: 0, data: { message: 'TOSS_SECRET_KEY 없음' } });
  return tossPost(`${API}/${encodeURIComponent(paymentKey)}/cancel`, { cancelReason: String(reason || '리포트 생성 실패').slice(0, 200) })
    .catch((err) => ({ ok: false, status: 0, data: { message: err.message } }));
}

module.exports = { CLIENT_KEY, SECRET_KEY, TEST_MODE, confirmPayment, cancelPayment };
