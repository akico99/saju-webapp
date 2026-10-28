'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const session = require('express-session');

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
const payRouter = require('../src/server/routes/pay');
const nativeFetch = global.fetch;

let server;
let baseUrl;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'payment-reliability-test', resave: false, saveUninitialized: false }));
  app.post('/test-login/:id', (req, res) => { req.session.userId = Number(req.params.id); res.json({ ok: true }); });
  app.use('/api', payRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

let seq = 0;
function createPayment({ form = { name: '테스트' }, productKey = 'date_select_moving', userId } = {}) {
  seq++;
  const user = userId ? users.findById(userId) : users.createUser({ email: `reliable${seq}@example.com`, passwordHash: 'x' });
  const row = payments.create({ userId: user.id, amountKrw: points.PRICES[productKey], orderName: '테스트 상품', testMode: true, productKey, form, attribution: { first: { utm_source: 'test' } } });
  return { user, row };
}

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function authenticatedCall(userId) {
  const login = await nativeFetch(baseUrl + '/test-login/' + userId, { method: 'POST' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  return async (body) => {
    const response = await nativeFetch(baseUrl + '/api/pay/confirm', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  };
}

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

test('an uncertain browser retry only looks up the original provider payment', async () => {
  const { user, row } = createPayment();
  for (const kind of ['terms', 'privacy', 'age14']) {
    db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?, ?, ?)').run(user.id, kind, consents.CONSENT_VERSION);
  }
  consents.recordOrderConsent(user.id, row.order_id, null);
  const call = await authenticatedCall(user.id);
  let confirms = 0;
  let lookups = 0;
  const oldFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/confirm')) { confirms++; return { ok: false, status: 503, json: async () => ({ message: 'uncertain' }) }; }
    if (String(url).includes('/orders/')) { lookups++; return { ok: false, status: 503, json: async () => ({ message: 'unavailable' }) }; }
    return nativeFetch(url, init);
  };
  try {
    const first = await call({ paymentKey: 'pk-route-reconcile', orderId: row.order_id, amount: row.amount_krw });
    assert.equal(first.status, 202);
    assert.equal(first.data.code, 'confirmation_pending');
    const second = await call({ paymentKey: 'pk-route-reconcile', orderId: row.order_id, amount: row.amount_krw });
    assert.equal(second.status, 202);
    assert.equal(second.data.code, 'confirmation_pending');
  } finally { global.fetch = oldFetch; }
  assert.equal(confirms, 1, 'the same approval request is not submitted twice after an uncertain response');
  assert.equal(lookups, 2, 'the user retry performs provider status lookups');
  assert.equal(payments.findByOrderId(row.order_id).status, 'reconcile_pending');
  assert.ok(payments.findByOrderId(row.order_id).form_json);
});

test('an uncertain retry cancels the reconciled provider payment when product startup fails', async () => {
  const { user, row } = createPayment();
  payments.claimConfirmation(row, 'pk-stored-payment');
  payments.deferConfirmation(row, 'ambiguous response');
  db.prepare('UPDATE card_payments SET product_key=? WHERE id=?').run('unknown-product', row.id);
  const call = await authenticatedCall(user.id);
  const oldFetch = global.fetch;
  const cancelUrls = [];
  global.fetch = async (url, init = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes('/orders/')) return { ok: true, status: 200, json: async () => ({
      status: 'DONE', orderId: row.order_id, paymentKey: 'pk-stored-payment', totalAmount: row.amount_krw, method: '카드'
    }) };
    cancelUrls.push(requestUrl);
    return { ok: true, status: 200, json: async () => ({ status: 'CANCELED', cancels: [{ canceledAt: '2026-10-12T00:00:00+09:00' }] }) };
  };
  let response;
  try {
    response = await call({ paymentKey: 'pk-stale-callback', orderId: row.order_id, amount: '' });
  } finally { global.fetch = oldFetch; }

  assert.equal(response.status, 400);
  assert.equal(response.data.canceled, true);
  assert.equal(cancelUrls.length, 1);
  assert.ok(cancelUrls[0].includes('/pk-stored-payment/cancel'), 'cancellation uses the payment key verified by Toss lookup');
  assert.equal(payments.findById(row.id).status, 'canceled');
  assert.equal(users.findById(user.id).point_balance, 0);
});

test('an incorrect amount on an uncertain retry leaves payment reconciliation recoverable', async () => {
  const { user, row } = createPayment();
  for (const kind of ['terms', 'privacy', 'age14']) {
    db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?, ?, ?)').run(user.id, kind, consents.CONSENT_VERSION);
  }
  consents.recordOrderConsent(user.id, row.order_id, null);
  payments.claimConfirmation(row, 'pk-amount-retry');
  payments.deferConfirmation(row, 'ambiguous response');
  const call = await authenticatedCall(user.id);
  const oldFetch = global.fetch;
  let lookups = 0;
  global.fetch = async () => { lookups++; return { ok: false, status: 503, json: async () => ({ message: 'unavailable' }) }; };
  let response;
  try {
    for (const retryFields of [
      { paymentKey: 'pk-amount-retry', amount: row.amount_krw + 1 },
      { paymentKey: 'pk-other-callback', amount: undefined },
      { paymentKey: undefined, amount: '' }
    ]) {
      response = await call({ ...retryFields, orderId: row.order_id });
      assert.equal(response.status, 202);
      assert.equal(response.data.code, 'confirmation_pending');
    }
  } finally { global.fetch = oldFetch; }
  const current = payments.findById(row.id);
  assert.equal(lookups, 3, 'the server reconciles with its stored payment key and amount, not retry payload fields');
  assert.equal(current.status, 'reconcile_pending');
  assert.ok(current.form_json);
});

test('test payment limit does not block lookup for an uncertain confirmation', async () => {
  const { user, row } = createPayment();
  for (const kind of ['terms', 'privacy', 'age14']) {
    db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?, ?, ?)').run(user.id, kind, consents.CONSENT_VERSION);
  }
  consents.recordOrderConsent(user.id, row.order_id, null);
  for (let index = 0; index < 3; index++) {
    const prior = createPayment({ userId: user.id }).row;
    payments.markPaidAndCredit(prior, { paymentKey: `pk-limit-${index}` });
  }
  payments.claimConfirmation(row, 'pk-limit-retry');
  payments.deferConfirmation(row, 'ambiguous response');
  const call = await authenticatedCall(user.id);
  const oldFetch = global.fetch;
  let lookups = 0;
  global.fetch = async () => { lookups++; return { ok: false, status: 503, json: async () => ({ message: 'unavailable' }) }; };
  let response;
  try { response = await call({ paymentKey: 'pk-limit-retry', orderId: row.order_id, amount: row.amount_krw }); }
  finally { global.fetch = oldFetch; }
  assert.equal(response.status, 202);
  assert.equal(lookups, 1);
  assert.equal(payments.findById(row.id).status, 'reconcile_pending');
});

test('uncertain confirmation stays recoverable and blocks expiry and account deletion', async () => {
  const { user, row } = createPayment();
  payments.claimConfirmation(row, 'pk-uncertain');
  assert.equal(payments.deferConfirmation(row, 'lookup temporarily unavailable'), true);
  assert.equal(payments.findByOrderId(row.order_id).status, 'reconcile_pending');

  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({ message: 'temporarily unavailable' }) });
  try {
    await recoverPaidPayments(undefined, [payments.findByOrderId(row.order_id)]);
  } finally { global.fetch = oldFetch; }

  const current = payments.findByOrderId(row.order_id);
  assert.equal(current.status, 'reconcile_pending');
  assert.ok(current.form_json, 'the input needed to complete the paid product is retained');
  assert.equal(payments.expireReady(), 0);
  assert.ok(require('../src/db/accountDeletion').findBlockers(user.id).some((b) => b.type === 'payment' && b.status === 'reconcile_pending'));
});

test('background reconciliation credits a confirmed payment and starts its saved product', async () => {
  const { user, row } = createPayment();
  payments.claimConfirmation(row, 'pk-recovered');
  payments.deferConfirmation(row, 'lost confirmation response');
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    status: 'DONE', orderId: row.order_id, paymentKey: 'pk-recovered', totalAmount: row.amount_krw,
    method: '카드', approvedAt: '2026-10-11T10:00:00+09:00'
  }) });
  let started = 0;
  try {
    await recoverPaidPayments(() => ({ start: async (userId, form, { cardPaymentId }) => {
      started++;
      assert.equal(userId, user.id);
      assert.equal(form.name, '테스트');
      assert.equal(cardPaymentId, row.id);
      return { jobId: `reconciled-${row.id}` };
    } }), [payments.findByOrderId(row.order_id)]);
  } finally { global.fetch = oldFetch; }
  const current = payments.findByOrderId(row.order_id);
  assert.equal(current.status, 'paid');
  assert.equal(current.job_id, `reconciled-${row.id}`);
  assert.equal(current.form_json, null);
  assert.equal(started, 1);
  assert.equal(users.findById(user.id).point_balance, row.amount_krw);
});

test('credit reversal and cancellation claim are one atomic, one-time operation', async () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-reversal' });
  const claim = payments.claimCancellationWithCreditReversal(paid, '상품 시작 실패');
  assert.equal(claim.status, 'canceling');
  assert.equal(payments.claimCancellationWithCreditReversal(payments.findById(row.id), '중복 호출'), null);
  assert.equal(users.findById(user.id).point_balance, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM point_transactions WHERE ref_type='card_payment_reversal' AND ref_id=?").get(row.id).n, 1);

  const oldFetch = global.fetch;
  global.fetch = async (url) => String(url).includes('/orders/')
    ? ({ ok: true, status: 200, json: async () => ({ status: 'DONE', orderId: row.order_id, paymentKey: row.payment_key }) })
    : ({ ok: true, status: 200, json: async () => ({ status: 'CANCELED', cancels: [{ canceledAt: '2026-10-11T10:05:00+09:00' }] }) });
  try { await recoverPaidPayments(); }
  finally { global.fetch = oldFetch; }
  assert.equal(users.findById(user.id).point_balance, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM point_transactions WHERE ref_type='card_payment_reversal' AND ref_id=?").get(row.id).n, 1);
});

test('provider cancellation time is kept for retained transaction timing', () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-cancel-time' });
  const claim = payments.claimCancellationWithCreditReversal(paid, '상품 시작 실패');
  const providerCanceledAt = '2026-10-11T12:34:56+09:00';
  const { latestCanceledAt } = require('../src/server/tossPayments');
  const returnedPayment = { cancels: [
    { canceledAt: providerCanceledAt },
    { canceledAt: '2026-10-11T10:34:56+09:00' },
    { canceledAt: 'not-a-timestamp' }
  ] };
  assert.equal(latestCanceledAt(returnedPayment), providerCanceledAt);
  payments.finishRefund(claim, true, '취소 완료', latestCanceledAt(returnedPayment));
  assert.equal(payments.findById(row.id).canceled_at, providerCanceledAt);
  assert.equal(users.findById(user.id).point_balance, 0);
});

test('legacy negative card payment transaction prevents a second cancellation debit', () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-legacy-reversal' });
  db.prepare("INSERT INTO point_transactions (user_id, delta, reason, ref_type, ref_id) VALUES (?, ?, ?, 'card_payment', ?)")
    .run(user.id, -row.amount_krw, 'legacy cancellation reversal', row.id);
  users.adjustPointBalance(user.id, -row.amount_krw);
  assert.equal(users.findById(user.id).point_balance, 0);

  const claim = payments.claimCancellationWithCreditReversal(paid, 'recovered legacy cancellation');
  assert.equal(claim.status, 'canceling');
  assert.equal(users.findById(user.id).point_balance, 0, 'legacy reversal already changed the balance');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM point_transactions WHERE ref_type='card_payment_reversal' AND ref_id=?").get(row.id).n, 0);
});

test('matching terminal Toss statuses fail an uncertain confirmation and clear the saved form', async () => {
  for (const status of ['ABORTED', 'EXPIRED']) {
    const { user, row } = createPayment();
    for (const kind of ['terms', 'privacy', 'age14']) {
      db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?, ?, ?)').run(user.id, kind, consents.CONSENT_VERSION);
    }
    consents.recordOrderConsent(user.id, row.order_id, null);
    const call = await authenticatedCall(user.id);
    const oldFetch = global.fetch;
    let confirms = 0;
    global.fetch = async (url) => {
      if (String(url).endsWith('/confirm')) {
        confirms++;
        return { ok: false, status: 503, json: async () => ({ message: 'response unavailable' }) };
      }
      return { ok: true, status: 200, json: async () => ({
        status, orderId: row.order_id, paymentKey: `pk-terminal-${status}`, totalAmount: row.amount_krw
      }) };
    };
    let response;
    try {
      response = await call({ paymentKey: `pk-terminal-${status}`, orderId: row.order_id, amount: row.amount_krw });
    } finally { global.fetch = oldFetch; }
    const current = payments.findById(row.id);
    assert.equal(response.status, 409);
    assert.equal(response.data.code, 'payment_not_approved');
    assert.equal(confirms, 1);
    assert.equal(current.status, 'failed');
    assert.equal(current.form_json, null);
    assert.equal(current.attribution, null);
  }
});

test('matching terminal Toss status closes an uncertain retry despite stale callback fields', async () => {
  const { user, row } = createPayment();
  for (const kind of ['terms', 'privacy', 'age14']) {
    db.prepare('INSERT INTO consents (user_id, kind, version) VALUES (?, ?, ?)').run(user.id, kind, consents.CONSENT_VERSION);
  }
  consents.recordOrderConsent(user.id, row.order_id, null);
  payments.claimConfirmation(row, 'pk-terminal-retry');
  payments.deferConfirmation(row, 'ambiguous response');
  const call = await authenticatedCall(user.id);
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    status: 'ABORTED', orderId: row.order_id, paymentKey: 'pk-terminal-retry', totalAmount: row.amount_krw
  }) });
  let response;
  try { response = await call({ paymentKey: 'pk-stale-callback', orderId: row.order_id, amount: 1 }); }
  finally { global.fetch = oldFetch; }
  assert.equal(response.status, 409);
  assert.equal(payments.findById(row.id).status, 'failed');
  assert.equal(payments.findById(row.id).form_json, null);
});

test('background reconciliation closes a matching terminal Toss status', async () => {
  const { user, row } = createPayment();
  payments.claimConfirmation(row, 'pk-terminal-background');
  payments.deferConfirmation(row, 'ambiguous response');
  const oldFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    status: 'EXPIRED', orderId: row.order_id, paymentKey: 'pk-terminal-background', totalAmount: row.amount_krw
  }) });
  try { await recoverPaidPayments(undefined, [payments.findById(row.id)]); }
  finally { global.fetch = oldFetch; }
  const current = payments.findById(row.id);
  assert.equal(current.status, 'failed');
  assert.equal(current.form_json, null);
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
  points.chargeForProductAndCreateOrder(user.id, row.product_key, { label: 'existing', jobId, cardPaymentId: paid.id });
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

test('paid payment does not reconnect an unrelated order created after its start watermark', () => {
  const first = createPayment();
  const paid = payments.markPaidAndCredit(first.row, { paymentKey: 'pk-after-watermark' });
  assert.equal(payments.claimPaidStart(paid), true);
  const jobId = `concurrent-route-${first.row.id}`;
  points.chargeForProductAndCreateOrder(first.user.id, first.row.product_key, { label: 'concurrent route', jobId });
  const result = payments.recoverPaidWithoutJob(payments.findByOrderId(first.row.order_id), orders);
  assert.equal(result.job_id, null);
  assert.equal(payments.findByOrderId(first.row.order_id).job_id, null);
});

test('startup recovers a start claim left behind before order creation', async () => {
  const { user, row } = createPayment();
  const paid = payments.markPaidAndCredit(row, { paymentKey: 'pk-crash' });
  assert.equal(payments.claimPaidStart(paid), true);
  db.prepare("UPDATE card_payments SET start_claimed_at=datetime('now','-6 minutes') WHERE id=?").run(row.id);
  let starts = 0;
  const { recoverPaidPayments } = require('../src/jobs/recoverPendingOrders');
  await recoverPaidPayments(() => ({ start: async (userId, form, { cardPaymentId }) => {
    starts++;
    const jobId = `recovered-${row.id}`;
    points.chargeForProductAndCreateOrder(userId, row.product_key, { label: 'recovered', jobId, cardPaymentId });
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

test('legacy uncertain ready payments are migrated before expiration or account deletion', () => {
  const { user, row } = createPayment();
  db.prepare("UPDATE card_payments SET status='ready', payment_key='pk-legacy-uncertain', error='승인 결과 미확인', created_at=datetime('now','-31 minutes') WHERE id=?").run(row.id);
  assert.ok(require('../src/db/accountDeletion').findBlockers(user.id).some((b) => b.status === 'reconcile_pending'));
  assert.equal(payments.expireReady(), 0, 'uncertain old rows are excluded from normal ready-order expiry');
  const current = payments.findById(row.id);
  assert.equal(current.status, 'reconcile_pending');
  assert.ok(current.form_json);
  assert.ok(require('../src/db/accountDeletion').findBlockers(user.id).some((b) => b.status === 'reconcile_pending'));
});
