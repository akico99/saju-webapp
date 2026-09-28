'use strict';
/* 유료 상품 생성이 실패했을 때 쓰는 단 하나의 환불 경로.

   카드로 결제한 주문이면 토스에 결제 취소를 요청해 카드로 돌려준다. 사이트 안에 잔액을 남기지 않는다 —
   실패할 때마다 잔액이 생기면 선불 충전과 다를 바 없어진다(PG 심사, 약관 제6·7조).
   카드 결제를 찾지 못한 주문(예전 잔액으로 산 주문)만 예전처럼 잔액으로 되돌린다.

   카드 결제 원장의 크레딧(+가격)과 상품 차감(-가격)은 이미 서로 상쇄됐으므로, 카드 취소 때는 잔액을
   건드리지 않는다. 같은 주문에 두 번 불려도(실패 콜백 + 재시작 복구) 한 번만 처리한다.
   절대 던지지 않는다 — 호출하는 곳은 대부분 이미 에러 처리 중이다. */
const orders = require('../db/orders');
const points = require('../db/points');
const cardPayments = require('../db/cardPayments');
const { cancelPayment } = require('./tossPayments');
const { notifyCardCancelFailure } = require('../email/cardCancelAlert');

async function refundPurchase(userId, amount, reason, jobId) {
  try {
    const order = jobId ? orders.findByJobId(jobId) : null;
    const card = cardPayments.claimForRefund({ userId, jobId, productKey: order ? order.product_key : null });
    if (!card) {
      points.refund(userId, amount, reason, jobId);
      return { method: 'balance' };
    }
    points.recordCardRefund(userId, reason, jobId);
    const result = await cancelPayment(card.payment_key, reason);
    const detail = result.ok ? reason : `${reason} / 취소 실패 — 수동 환불 필요: ${(result.data && result.data.message) || result.status}`;
    cardPayments.finishRefund(card, result.ok, detail);
    if (!result.ok) {
      console.error('[환불] 카드 결제 취소 실패 — 수동 환불 필요:', card.order_id, result.data);
      notifyCardCancelFailure(card, detail);
    }
    return { method: 'card', ok: result.ok };
  } catch (e) {
    console.error('[환불] 처리 중 오류 — 수동 확인 필요:', jobId, e);
    return { method: 'error', ok: false };
  }
}

module.exports = { refundPurchase };
