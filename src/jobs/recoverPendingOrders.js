'use strict';
/* 서버 재시작 시 중단된 작업 복구 — jobManager는 메모리라 서버가 재시작되면 생성 중이던
   작업의 진행 상태가 전부 사라진다. 하지만 orders 테이블은 SQLite라 남아있으므로,
   재시작 직후 'pending'으로 남은 주문은 100% "이전 프로세스가 죽을 때 끝내지 못한 작업"이다
   (이 함수가 실행되는 시점엔 이번 프로세스가 아직 어떤 요청도 처리하지 않았으므로).
   그런 주문은 다시 이어서 생성할 방법이 없으므로(LLM 호출 과정이 메모리에만 있었다),
   포인트를 환불하고 주문을 'error'로 종료한다. */
const orders = require('../db/orders');
const points = require('../db/points');

function recoverPendingOrders() {
  const pending = orders.listAllPending();
  if (pending.length === 0) return;

  let refunded = 0;
  for (const order of pending) {
    const price = points.PRICES[order.product_key];
    if (!price) {
      console.warn(`[재시작 복구] 알 수 없는 상품(${order.product_key}), 주문 ${order.job_id} 환불 건너뜀 — 수동 확인 필요`);
      continue;
    }
    points.refund(order.user_id, price, `서버 재시작으로 중단된 작업 자동 환불: ${order.product_key}`, order.job_id);
    orders.markError(order.job_id, '서버 재시작으로 인해 완료되지 못해 자동 환불 처리됨');
    refunded++;
  }
  console.log(`[재시작 복구] 중단된 주문 ${pending.length}건 발견, ${refunded}건 자동 환불 처리`);
}

module.exports = { recoverPendingOrders };
