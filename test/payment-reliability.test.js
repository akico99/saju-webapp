'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-payment-reliability-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');
process.env.TOSS_SECRET_KEY = 'test_sk_dummy';
const db = require('../src/db');
const users = require('../src/db/users');
const points = require('../src/db/points');
const orders = require('../src/db/orders');
const payments = require('../src/db/cardPayments');
const consents = require('../src/db/consents');
const { recoverPaidPayments } = require('../src/jobs/recoverPendingOrders');

let seq = 0;
function createPayment({ form = { name: '테스트' }, productKey = 'deep_love', userId } = {}) {
  seq++;
  const user = userId ? users.findById(userId) : users.createUser({ email: `reliable${seq}@example.com`, passwordHash: 'x' });
  const row = payments.create({ userId: user.id, amountKrw: points.PRICES[productKey], orderName: '테스트 상품', testMode: true, productKey, form, attribution: { first: { utm_source: 'test' } } });
  return { user, row };
}

test.after(() => { db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

test('payment confirmation reconciles a lost response only when Toss fields match', async () => {
  const toss = require('../src/server/tossPayments');
  assert.equal(typeof toss.lookupPayment, 'function');
  const { row } = createPayment();
  const { matchesConfirmedPayment } = require('../src/server/routes/pay');
  const providerPayment = { status: 'DONE', orderId: row.order_id, paymentKey: 'pk-1', totalAmount: row.amount_krw };
  assert.equal(matchesConfirmedPayment(row, 'pk-1', providerPayment), true);
  assert.equal(matchesConfirmedPayment(row, 'pk-other', providerPayment), false);
  assert.equal(matchesConfirmedPayment(row, 'pk-1', { ...providerPayment, totalAmount: row.amount_krw + 1 }), false);
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'DONE', orderId: 'order-1', paymentKey: 'pk-1', totalAmount: 3900 }) });
  try { assert.deepEqual(await toss.lookupPayment('order-1'), { ok: true, status: 200, data: { status: 'DONE', orderId: 'order-1', paymentKey: 'pk-1', totalAmount: 3900 } }); }
  finally { global.fetch = oldFetch; }
});

test('mismatched Toss lookup stays uncredited and retryable', () => {
  const { user, row } = createPayment();
  assert.equal(typeof payments.claimConfirmation, 'function');
  assert.equal(payments.claimConfirmation(row, 'pk-once').status, 'confirming');
  assert.equal(payments.releaseConfirmation(row, 'provider mismatch'), true);
  assert.equal(payments.findByOrderId(row.order_id).status, 'ready');
  assert.equal(users.findById(user.id).point_balance, 0);
});

test('concurrent confirmation credits and starts once', () => {
  const { user, row } = createPayment();
  assert.equal(typeof payments.claimConfirmation, 'function');
  assert.equal(payments.claimConfirmation(row, 'pk-once').status, 'confirming');
  assert.equal(payments.claimConfirmation(row, 'pk-twice'), null);
  assert.equal(payments.markPaidAndCredit(row, { paymentKey: 'pk-once' }).status, 'paid');
  assert.equal(payments.markPaidAndCredit(row, { paymentKey: 'pk-twice' }), null);
  const paid = payments.findByOrderId(row.order_id);
  assert.equal(payments.claimPaidStart(paid), true);
  assert.equal(payments.claimPaidStart(paid), false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM point_transactions WHERE ref_type='card_payment' AND ref_id=?").get(row.id).n, 1);
  assert.equal(users.findById(user.id).point_balance, row.amount_krw);
});

test('paid payment without job link reconnects to existing active order', async () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-reconnect' });
  assert.equal(payments.claimPaidStart(paid), true);
  const jobId = `reconnect-${row.id}`;
  points.chargeForProductAndCreateOrder(user.id, row.product_key, { label: 'existing', jobId });
  assert.equal(typeof payments.recoverPaidWithoutJob, 'function');
  const result = await payments.recoverPaidWithoutJob(payments.findByOrderId(row.order_id), orders);
  assert.equal(result.job_id, jobId);
  assert.equal(payments.findByOrderId(row.order_id).job_id, jobId);
});

test('paid payment does not reconnect an unrelated active order', () => {
  const first = createPayment();
  const priorPaid = payments.markPaidAndCredit(first.row, { paymentKey: 'pk-prior' });
  const jobId = `unrelated-${first.row.id}`;
  points.chargeForProductAndCreateOrder(first.user.id, first.row.product_key, { label: 'prior', jobId });
  payments.setJob(priorPaid, jobId);
  const duplicate = createPayment({ userId: first.user.id });
  const duplicatePaid = payments.markPaidAndCredit(duplicate.row, { paymentKey: 'pk-duplicate' });
  const result = payments.recoverPaidWithoutJob(duplicatePaid, orders);
  assert.equal(result.job_id, null);
  assert.equal(payments.findByOrderId(duplicate.row.order_id).job_id, null);
});

test('startup recovers a start claim left behind before order creation', async () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-crash' });
  assert.equal(payments.claimPaidStart(paid), true);
  db.prepare("UPDATE card_payments SET start_claimed_at=datetime('now','-6 minutes') WHERE id=?").run(row.id);
  let starts = 0;
  const { recoverPaidPayments } = require('../src/jobs/recoverPendingOrders');
  await recoverPaidPayments(() => ({ start: async (userId, form) => {
    starts++;
    const jobId = `recovered-${row.id}`;
    points.chargeForProductAndCreateOrder(userId, row.product_key, { label: 'recovered', jobId });
    return { jobId };
  } }), [payments.findByOrderId(row.order_id)]);
  assert.equal(starts, 1);
  assert.equal(payments.findByOrderId(row.order_id).job_id, `recovered-${row.id}`);
});

test('startup keeps a partial cancellation actionable', async () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-partial-startup' });
  const canceling = payments.claimCancellation(paid);
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ status: 'PARTIAL_CANCELED', balanceAmount: row.amount_krw - 100 }) });
  try {
    const { recoverPaidPayments } = require('../src/jobs/recoverPendingOrders');
    await recoverPaidPayments();
    assert.equal(payments.findByOrderId(row.order_id).status, 'cancel_failed');
    assert.match(payments.findByOrderId(row.order_id).error, /부분 취소/);
  } finally { global.fetch = oldFetch; }
});

test('uncertain confirmation shows a retry path without calling the payment successful', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/pay-success.html'), 'utf8');
  assert.match(html, /확인.*진행/);
  assert.match(html, /retryConfirm|다시 확인|다시 시도/);
  assert.match(html, /confirmation_pending/);
});

test('ready payment form expires after thirty minutes and linked jobs clear form and attribution', () => {
  const { row } = createPayment();
  assert.equal(typeof payments.expireReady, 'function');
  db.prepare("UPDATE card_payments SET created_at=datetime('now','-31 minutes') WHERE id=?").run(row.id);
  assert.equal(payments.expireReady(), 1);
  assert.equal(payments.findByOrderId(row.order_id).status, 'failed');
  const linked = createPayment().row;
  payments.setJob(linked, 'job-cleanup');
  const persisted = payments.findByOrderId(linked.order_id);
  assert.equal(persisted.form_json, null);
  assert.equal(persisted.attribution, null);
});
