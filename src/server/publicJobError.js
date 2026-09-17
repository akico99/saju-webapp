'use strict';

// 주문에는 진단용 원문을 남기되, 고객용 상태 API에는 외부 서비스 오류를 노출하지 않는다.
function publicJobError(error, productKey) {
  if (!error) return null;
  const refunded = productKey && productKey !== 'free';
  const refundNote = refunded ? '차감된 포인트는 자동 환불됩니다. ' : '';
  const message = String(error);
  if (/credit balance|insufficient credits|plans?\s*&\s*billing|purchase credits|billing/i.test(message)) {
    return `현재 리딩 생성 서비스가 일시적으로 중단되었습니다. ${refundNote}복구 후 다시 이용해 주세요.`;
  }
  return `결과를 만드는 중 문제가 발생했습니다. ${refundNote}잠시 후 다시 확인해 주세요.`;
}

module.exports = { publicJobError };
