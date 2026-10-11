'use strict';
/* 서버 재시작 시 중단된 작업 복구 — LLM 호출·PDF 렌더링 과정 자체는 메모리에만 있어서
   서버가 재시작되면 이어서 진행할 방법이 없다. 하지만 orders 테이블(상태 포함)은
   SQLite라 남아있으므로, 재시작 직후 'pending'/'generating'/'rendering' 중 하나로 남은
   주문은 100% "이전 프로세스가 죽을 때 끝내지 못한 작업"이다(이 함수가 실행되는 시점엔
   이번 프로세스가 아직 어떤 요청도 처리하지 않았으므로). 그런 주문은 포인트를 환불하고
   'error'로 종료한다. */
const orders = require('../db/orders');
const points = require('../db/points');
const { refundPurchase } = require('../server/refundPurchase');
const cardPayments = require('../db/cardPayments');
const { lookupPayment } = require('../server/tossPayments');
const { cancelPayment } = require('../server/tossPayments');
const { resolveProduct } = require('../server/products');
const newYearConfig = require('../config/newYear');

function recoverPendingOrders() {
  cardPayments.expireReady();
  const pending = orders.listAllPending();
  if (pending.length === 0) return;

  let refunded = 0;
  for (const order of pending) {
    // 여러 프로세스가 동시에 뜨는 극단적인 상황(예: 배포 중 순간적으로 신·구 인스턴스가
    // 겹치는 경우)에도 한 프로세스만 이 주문을 처리하도록 먼저 선점한다 — 선점 못 하면
    // 이미 다른 프로세스가 처리 중이라는 뜻이므로 건너뛴다.
    if (!orders.claimForRecovery(order.job_id)) continue;

    const price = points.PRICES[order.product_key];
    if (!price) {
      console.warn(`[재시작 복구] 알 수 없는 상품(${order.product_key}), 주문 ${order.job_id} 환불 건너뜀 — 수동 확인 필요`);
      orders.markError(order.job_id, '서버 재시작으로 인해 완료되지 못함(상품 정보 불명, 수동 환불 필요)');
      continue;
    }
    refundPurchase(order.user_id, price, `서버 재시작으로 중단된 작업 자동 환불: ${order.product_key}`, order.job_id);
    orders.markError(order.job_id, '서버 재시작으로 인해 완료되지 못해 자동 환불 처리됨');
    refunded++;
  }
  console.log(`[재시작 복구] 중단된 주문 ${pending.length}건 발견, ${refunded}건 자동 환불 처리`);
}

function paymentProduct(productKey) {
  if (productKey === 'full' || productKey === 'compat') return productKey;
  if (productKey.startsWith('deep_')) return 'deep';
  if (productKey.startsWith('date_select_')) return 'date_select';
  if (productKey === newYearConfig.productKey) return 'newyear';
  return null;
}

async function recoverPaidPayments(startProduct = resolveProduct, recoverablePayments = cardPayments.listRecoverable()) {
  for (let row of recoverablePayments) {
    if (row.status === 'canceling') {
      const check = await lookupPayment(row.order_id);
      if (!check.ok) continue;
      if (check.data.status === 'PARTIAL_CANCELED') {
        cardPayments.finishPartialCancellation(row, check.data.balanceAmount);
      } else if (check.data.status === 'CANCELED') {
        cardPayments.finishRefund(row, true, '토스 결제 조회 결과 이미 취소됨');
      } else if (check.data.status === 'DONE') {
        const result = await cancelPayment(row.payment_key, row.error || '재시작 후 결제 취소 복구', row.cancel_idempotency_key);
        cardPayments.finishRefund(row, result.ok, result.ok ? '재시작 후 취소 복구 완료' : (result.data && result.data.message) || result.status);
      }
      continue;
    }
    if (row.status === 'confirming') {
      const check = await lookupPayment(row.order_id);
      const d = check.data || {};
      if (!check.ok || d.status !== 'DONE' || d.orderId !== row.order_id || Number(d.totalAmount) !== row.amount_krw || d.paymentKey !== row.payment_key) {
        cardPayments.releaseConfirmation(row, '재시작 후 결제 승인 확인 실패');
        continue;
      }
      row = cardPayments.markPaidAndCredit(row, { paymentKey: row.payment_key, method: d.method, approvedAt: d.approvedAt });
      if (!row) continue;
    }
    row = cardPayments.recoverPaidWithoutJob(row, orders);
    if (row.job_id) continue;
    if (!cardPayments.claimPaidStart(row)) continue;
    try {
      const form = JSON.parse(row.form_json || '{}');
      const product = startProduct(paymentProduct(row.product_key), form);
      if (!product) throw new Error('상품을 찾을 수 없습니다.');
      const started = await product.start(row.user_id, form);
      cardPayments.setJob(row, started.jobId);
    } catch (err) {
      const detail = `결제 복구 중 상품 시작 실패: ${err.message}`;
      cardPayments.revertCredit(row, detail);
      const cancel = cardPayments.claimCancellation(cardPayments.findById(row.id));
      if (cancel) {
        const result = await cancelPayment(cancel.payment_key, detail, cancel.cancel_idempotency_key);
        cardPayments.finishRefund(cancel, result.ok, result.ok ? detail : `${detail} / ${(result.data && result.data.message) || result.status}`);
      }
    }
  }
}

module.exports = { recoverPendingOrders, recoverPaidPayments };
