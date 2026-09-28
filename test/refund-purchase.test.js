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

const PRODUCT = 'deep_love';
const PRICE = points.PRICES[PRODUCT];
let seq = 0;
let cancelCalls = [];
let cancelOk = true;
const realFetch = global.fetch;

test.before(() => {
  global.fetch = async (url) => {
    cancelCalls.push(String(url));
    return { ok: cancelOk, status: cancelOk ? 200 : 500, json: async () => (cancelOk ? {} : { message: '토스 오류' }) };
  };
});
test.after(() => {
  global.fetch = realFetch;
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
test.beforeEach(() => { cancelCalls = []; cancelOk = true; });

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

