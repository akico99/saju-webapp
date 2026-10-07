'use strict';
/* 상품 가격표 + 내부 결제 원장(1포인트 = 1원).
   사이트에서 잔액을 사고팔지 않는다. 카드 결제 1건이 승인되면 그 금액이 원장에 들어왔다가(cardPayments)
   곧바로 상품 차감으로 나가서 잔액은 늘 0이다. 예전의 무통장 충전 신청·관리자 수동 지급은 없앴다. */
const db = require('./index');
const { adjustPointBalance, findById } = require('./users');
const orders = require('./orders');
const newYearConfig = require('../config/newYear');

// 상품 가격은 서버가 유일한 기준이다 — 클라이언트가 보내는 price 쿼리파라미터는
// 화면 표시용일 뿐 절대 신뢰하지 않는다(가격 위조 방지).
/* 가격표 — 2026-09 990원 티어를 없앴다. 990원 상품은 평생사주 18장 중 1장을 900자로
   눌러 짠 것이라 "그래서 언제, 뭘 하라는 건지"가 빠져 값어치가 안 나왔다. 단일 주제는
   3,900원 심층 리딩(챕터 풀 분량 + 지금 대운·앞으로 3년 + 할 것/피할 것)으로 올린다.

   LEGACY_PRICES는 새로 팔지 않는다. 남겨두는 이유는 재시작 복구(recoverPendingOrders)와
   환불이 order.product_key로 가격을 찾기 때문 — 지우면 옛 키로 남은 주문을 환불 못 한다. */
const PRICES = {
  // 주제별 심층 리딩
  deep_intro: 3900, deep_wealth: 3900, deep_career: 3900, deep_love: 3900, deep_relationship: 3900, deep_health: 3900,
  // 택일 리포트 (LLM + PDF)
  date_select_moving: 3900, date_select_opening: 3900, date_select_wedding: 3900, date_select_birth: 3900,
  // 관계 · 전체
  compat: 4900, full: 14900,
  // 가격 조회와 기존 주문 복구를 위해 둔다. 신규 주문은 환경변수 게이트로 따로 제어한다.
  new_year_2027: newYearConfig.priceKrw
};
const LEGACY_PRICES = {
  quick: 990, life_topic_wealth: 990, life_topic_health: 990, life_topic_compat: 2900,
  // 이직 시기·재회·출산택일은 LLM도 PDF도 없는 점수표라 값을 올릴 수 없었다.
  // 이직 시기 → 직업·적성 심층 리딩(5년 타임라인 포함), 재회 → 궁합(재회 관점 문단),
  // 출산택일 → 택일 리포트(임신·출산)로 흡수.
  career_timing: 990, reunion: 990, birth_timing: 2900
};
Object.assign(PRICES, LEGACY_PRICES);
const SELLABLE = new Set(Object.keys(PRICES).filter((k) => !(k in LEGACY_PRICES)));
if (!newYearConfig.enabled) SELLABLE.delete(newYearConfig.productKey);

const stmts = {
  insertTx: db.prepare(`
    INSERT INTO point_transactions (user_id, delta, reason, ref_type, ref_id)
    VALUES (@userId, @delta, @reason, @refType, @refId)
  `),
  findRefundByRefId: db.prepare(
    "SELECT id FROM point_transactions WHERE ref_type='refund' AND ref_id=? LIMIT 1"
  )
};

/** 상품 구매 시 포인트를 차감한다. 잔액 부족이면 code='insufficient_points'인 Error를 던진다.
    refId를 넘기면(예: jobId) 이 차감 거래와 나중의 환불·주문을 같은 값으로 묶어 추적할 수 있다. */
function chargeForProduct(userId, productKey, refId) {
  const price = PRICES[productKey];
  if (!price) throw new Error('알 수 없는 상품입니다: ' + productKey);
  // 판매 종료된 키로는 새 결제를 만들지 않는다 — 환불·복구 조회는 PRICES로 계속 된다.
  if (!SELLABLE.has(productKey)) throw new Error('판매가 종료된 상품입니다: ' + productKey);

  const user = findById(userId);
  if (!user || user.point_balance < price) {
    // 잔액은 늘 0이므로 카드 결제 없이 부른 경우는 모두 여기로 온다 — 402를 받은 화면이 결제창을 연다.
    const err = new Error('결제가 필요합니다.');
    err.code = 'insufficient_points';
    err.required = price;
    err.balance = user ? user.point_balance : 0;
    throw err;
  }

  const tx = db.transaction(() => {
    stmts.insertTx.run({ userId, delta: -price, reason: `상품 구매: ${productKey}`, refType: 'product_purchase', refId: refId || null });
    adjustPointBalance(userId, -price);
  });
  tx();
  return price;
}

/** 포인트 차감 + 주문 생성을 하나의 트랜잭션으로 묶는다 — 둘 중 하나라도 실패하면(디스크
    오류 등) 전부 롤백되어 "차감만 되고 주문 기록이 없는" 반쪽 상태 자체가 생기지 않는다.
    그래서 이 함수가 실패하면 별도로 환불할 필요가 없다 — 애초에 차감이 커밋되지 않았다. */
function chargeForProductAndCreateOrder(userId, productKey, { label, jobId }) {
  let price;
  const tx = db.transaction(() => {
    price = chargeForProduct(userId, productKey, jobId);
    orders.createOrder({ userId, productKey, label, jobId });
  });
  tx();
  return price;
}

/** 카드 결제가 아닌 주문의 생성 실패 환불 — 차감했던 금액을 원장에 되돌린다. 직접 부르지 말고
    server/refundPurchase.js를 거친다(카드 결제면 거기서 카드 취소로 처리한다). */
function refund(userId, amount, reason, refId) {
  // refId(jobId)가 있으면 멱등하게 처리한다 — 같은 작업에 대해 두 번 호출돼도(예: 재시작
  // 복구와 실패 콜백이 겹치는 극단적인 경우) 두 번째 호출은 조용히 무시한다.
  if (refId && stmts.findRefundByRefId.get(refId)) return;

  const tx = db.transaction(() => {
    stmts.insertTx.run({ userId, delta: amount, reason, refType: 'refund', refId: refId || null });
    adjustPointBalance(userId, amount);
  });
  tx();
}

/** 카드 결제 주문의 환불을 원장에 기록만 한다(잔액 변동 0 — 돈은 카드 취소로 돌아간다).
    같은 jobId로 나중에 refund()가 또 불려도 이 기록 때문에 잔액이 늘지 않는다. */
function recordCardRefund(userId, reason, refId) {
  if (refId && stmts.findRefundByRefId.get(refId)) return;
  stmts.insertTx.run({ userId, delta: 0, reason: `카드 결제 취소: ${reason}`.slice(0, 200), refType: 'refund', refId: refId || null });
}

module.exports = {
  PRICES, LEGACY_PRICES, SELLABLE, chargeForProduct, chargeForProductAndCreateOrder, refund, recordCardRefund
};
