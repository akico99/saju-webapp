'use strict';
/* 생성 실패 환불 — 카드로 결제한 주문은 카드 취소로 돌려주고 사이트 잔액을 남기지 않는지 확인한다.
   임시 DB를 쓰고 토스 API(fetch)는 가짜로 바꾼다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-refund-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');
process.env.TOSS_SECRET_KEY = 'test_sk_dummy';

const users = require('../src/db/users');
const points = require('../src/db/points');
const cardPayments = require('../src/db/cardPayments');
const db = require('../src/db/index');
const { refundPurchase } = require('../src/server/refundPurchase');

const PRODUCT = 'date_select_moving'; // 판매 중인 3,900원 상품(주제별 심층 리딩은 2026-10 판매 종료)
const PRICE = points.PRICES[PRODUCT];
let seq = 0;
let cancelCalls = [];
let cancelHeaders = [];
let cancelOk = true;
const realFetch = global.fetch;

test.before(() => {
  global.fetch = async (url, options = {}) => {
    cancelCalls.push(String(url));
    cancelHeaders.push(options.headers || {});
    if (String(url).includes('/orders/')) return { ok: true, status: 200, json: async () => ({ status: 'DONE' }) };
    return { ok: cancelOk, status: cancelOk ? 200 : 500, json: async () => (cancelOk ? {} : { message: '토스 오류' }) };
  };
});
test.after(() => {
  global.fetch = realFetch;
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
test.beforeEach(() => { cancelCalls = []; cancelHeaders = []; cancelOk = true; });

function newUser() {
  seq += 1;
  return users.createUser({ email: `refund${seq}@example.com`, passwordHash: 'x' }).id;
}
const balanceOf = (userId) => users.findById(userId).point_balance;

/** pay.js와 같은 순서: 카드 승인 → 금액 크레딧 → 상품 차감·주문 생성 → (선택) 결제 행에 주문 번호 기록 */
function cardPurchase(userId, { linkJob = true } = {}) {
  seq += 1;
  const jobId = `job-${seq}`;
  const row = cardPayments.create({ userId, amountKrw: PRICE, orderName: '애정운 심층 리딩', testMode: true, productKey: PRODUCT, form: {} });
  const paid = cardPayments.markPaidAndCredit(row, { paymentKey: `pk_${seq}` });
  points.chargeForProductAndCreateOrder(userId, PRODUCT, { label: 'test', jobId });
  if (linkJob) cardPayments.setJob(paid, jobId);
  return { jobId, orderId: row.order_id, paymentKey: `pk_${seq}` };
}

test('card-paid order failing after start is refunded by canceling the card', async () => {
  const userId = newUser();
  const { jobId, orderId, paymentKey } = cardPurchase(userId);
  assert.equal(balanceOf(userId), 0);

  const result = await refundPurchase(userId, PRICE, '생성 실패', jobId);

  assert.deepEqual(result, { method: 'card', ok: true });
  assert.equal(cancelCalls.length, 1);
  assert.ok(cancelCalls[0].endsWith(`/${paymentKey}/cancel`));
  assert.equal(cardPayments.findByOrderId(orderId).status, 'canceled');
  assert.equal(balanceOf(userId), 0, 'no site balance is left behind');
});

test('a second refund for the same order neither cancels twice nor creates a balance', async () => {
  const userId = newUser();
  const { jobId } = cardPurchase(userId);
  await refundPurchase(userId, PRICE, '생성 실패', jobId);
  await refundPurchase(userId, PRICE, '재시작 복구', jobId);

  assert.equal(cancelCalls.length, 1);
  assert.equal(balanceOf(userId), 0);
});

test('failure before the payment row knows its job still finds and cancels that card payment', async () => {
  const userId = newUser();
  const { jobId, orderId } = cardPurchase(userId, { linkJob: false });

  const result = await refundPurchase(userId, PRICE, '생성 준비 실패', jobId);

  assert.deepEqual(result, { method: 'card', ok: true });
  const row = cardPayments.findByOrderId(orderId);
  assert.equal(row.status, 'canceled');
  assert.equal(row.job_id, jobId);
  assert.equal(balanceOf(userId), 0);
});

test('a failed Toss cancel is marked for manual refund and still leaves no balance', async () => {
  const userId = newUser();
  const { jobId, orderId } = cardPurchase(userId);
  cancelOk = false;

  const result = await refundPurchase(userId, PRICE, '생성 실패', jobId);

  assert.deepEqual(result, { method: 'card', ok: false });
  const row = cardPayments.findByOrderId(orderId);
  assert.equal(row.status, 'cancel_failed');
  assert.match(row.error, /수동 환불 필요/);
  assert.equal(balanceOf(userId), 0);
});

test('failed cancellation remains cancel_failed and a retry reuses its idempotency key', async () => {
  const userId = newUser();
  const { jobId, orderId, paymentKey } = cardPurchase(userId);
  cancelOk = false;
  await refundPurchase(userId, PRICE, '생성 실패', jobId);
  const firstUrl = cancelCalls[0];
  const firstKey = cancelHeaders[0]['Idempotency-Key'];
  assert.match(firstUrl, /cancel/);
  assert.ok(firstKey);
  assert.equal(cardPayments.findByOrderId(orderId).status, 'cancel_failed');
  cancelOk = true;
  const { retryCancellation } = require('../src/server/refundPurchase');
  const retry = await retryCancellation(cardPayments.findByOrderId(orderId));
  assert.equal(retry.ok, true);
  assert.equal(cancelCalls.length, 3); // initial cancel, provider lookup, retry cancel
  assert.equal(cancelCalls[2], firstUrl);
  assert.equal(cancelHeaders[2]['Idempotency-Key'], firstKey);
  assert.equal(cardPayments.findByOrderId(orderId).status, 'canceled');
  assert.ok(paymentKey);
});

test('administrator can retry only after checking provider cancellation state', async () => {
  const toss = require('../src/server/tossPayments');
  assert.equal(typeof toss.lookupPayment, 'function');
  const oldFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => ({ status: 'CANCELED' }) };
  };
  try {
    const result = await toss.lookupPayment('admin-order');
    assert.equal(result.data.status, 'CANCELED');
    assert.match(calls[0], /admin-order/);
  } finally { global.fetch = oldFetch; }
});

test('partial provider cancellation remains visible for outstanding balance review', async () => {
  const userId = newUser();
  const { orderId } = cardPurchase(userId);
  const row = cardPayments.findByOrderId(orderId);
  db.prepare("UPDATE card_payments SET status='cancel_failed' WHERE id=?").run(row.id);
  const oldFetch = global.fetch;
  global.fetch = async (url) => ({ ok: true, status: 200, json: async () => String(url).includes('/orders/') ? { status: 'PARTIAL_CANCELED', balanceAmount: 1800 } : {} });
  try {
    const { retryCancellation } = require('../src/server/refundPurchase');
    const result = await retryCancellation(cardPayments.findByOrderId(orderId));

    assert.equal(result.ok, false);
    assert.equal(cardPayments.findByOrderId(orderId).status, 'cancel_failed');
    assert.match(cardPayments.findByOrderId(orderId).error, /부분 취소.*1800/);
  } finally { global.fetch = oldFetch; }
});

test('restart refund and the payment recovery loop racing on one card end canceled, not cancel_failed', async () => {
  // 2026-11-06 실제 사례: 재시작 직후 환불이 토스 취소를 보내는 동안 결제 복구 작업이 같은 결제를
  // '취소 중'으로 보고 같은 멱등 키로 다시 취소했고, 토스의 "처리 중" 응답이 cancel_failed로 남았다.
  const userId = newUser();
  const { jobId, orderId } = cardPurchase(userId);
  const { recoverPaidPayments } = require('../src/jobs/recoverPendingOrders');
  const oldFetch = global.fetch;
  let releaseFirst;
  const calls = [];
  global.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/orders/')) return { ok: true, status: 200, json: async () => ({ status: 'DONE' }) };
    if (calls.filter((c) => c.endsWith('/cancel')).length === 1) {
      await new Promise((r) => { releaseFirst = r; });
      return { ok: true, status: 200, json: async () => ({ cancels: [{ canceledAt: '2026-11-06T22:23:56+09:00' }] }) };
    }
    return { ok: false, status: 409, json: async () => ({ code: 'IDEMPOTENT_REQUEST_PROCESSING', message: '이전 멱등 요청이 처리중입니다.' }) };
  };
  try {
    const refund = refundPurchase(userId, PRICE, '재시작 복구', jobId);
    await new Promise((r) => setImmediate(r));
    await recoverPaidPayments(undefined, [cardPayments.findByOrderId(orderId)]);
    assert.equal(cardPayments.findByOrderId(orderId).status, 'canceling', 'recovery leaves an in-flight cancel alone');
    // 다른 프로세스가 보낸 취소라 이 프로세스가 모르는 경우에도 "처리 중" 응답은 실패로 적지 않는다.
    const { refundInFlight } = require('../src/server/refundPurchase');
    refundInFlight.clear();
    await recoverPaidPayments(undefined, [cardPayments.findByOrderId(orderId)]);
    assert.equal(cardPayments.findByOrderId(orderId).status, 'canceling', 'a processing answer is not a failure');
    releaseFirst();
    await refund;
    const row = cardPayments.findByOrderId(orderId);
    assert.equal(row.status, 'canceled');
    assert.ok(row.canceled_at);
  } finally { global.fetch = oldFetch; }
});

test('an order paid without a card is returned to the ledger as before', async () => {
  const userId = newUser();
  users.adjustPointBalance(userId, PRICE);
  seq += 1;
  const jobId = `job-${seq}`;
  points.chargeForProductAndCreateOrder(userId, PRODUCT, { label: 'test', jobId });

  const result = await refundPurchase(userId, PRICE, '생성 실패', jobId);

  assert.deepEqual(result, { method: 'balance' });
  assert.equal(cancelCalls.length, 0);
  assert.equal(balanceOf(userId), PRICE);
});

