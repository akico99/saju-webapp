'use strict';
/* 서버 재시작 시 중단된 작업 복구 — LLM 호출·PDF 렌더링 과정 자체는 메모리에만 있어서
   서버가 재시작되면 이어서 진행할 방법이 없다. 하지만 orders 테이블(상태 포함)은
   SQLite라 남아있으므로, 재시작 직후 'pending'/'generating'/'rendering' 중 하나로 남은
   주문은 100% "이전 프로세스가 죽을 때 끝내지 못한 작업"이다(이 함수가 실행되는 시점엔
   이번 프로세스가 아직 어떤 요청도 처리하지 않았으므로). 그런 주문은 포인트를 환불하고
   'error'로 종료한다. */
const orders = require('../db/orders');
const points = require('../db/points');

function recoverPendingOrders() {
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
    points.refund(order.user_id, price, `서버 재시작으로 중단된 작업 자동 환불: ${order.product_key}`, order.job_id);
    orders.markError(order.job_id, '서버 재시작으로 인해 완료되지 못해 자동 환불 처리됨');
    refunded++;
  }
  console.log(`[재시작 복구] 중단된 주문 ${pending.length}건 발견, ${refunded}건 자동 환불 처리`);
}

module.exports = { recoverPendingOrders };
