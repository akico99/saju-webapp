'use strict';
/* 계정 탈퇴 — 본인 확인, 진행 중 주문 차단, 서비스 데이터 파기, 최소 거래 기록 보존을 실제 HTTP 요청으로 확인한다.
   임시 DB·임시 출력 폴더를 쓰고, 이메일 발송(Resend)은 fetch를 가로채 본문만 잡는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

process.env.RESEND_API_KEY = 'test-resend-key';
const fx = require('./helpers/account-fixtures');
const tmpDir = fx.makeTempEnv('saju-acct-del-');
const m = fx.load();

const express = require('express');
const session = require('express-session');

const realFetch = global.fetch;
const sentMails = [];
global.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com')) {
    sentMails.push(JSON.parse(init.body));
    return new Response('{"id":"mail_1"}', { status: 200 });
  }
  return realFetch(url, init);
};

let server;
let baseUrl;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  // 테스트 전용 로그인 — 소셜 로그인 콜백을 거치지 않고 세션만 만든다.
  app.post('/test-login/:id', (req, res) => { req.session.userId = Number(req.params.id); res.json({ ok: true }); });
  app.use('/api', require('../src/server/routes/auth'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  global.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
  m.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const REQUEST = '/api/auth/account/delete/request';
const CONFIRM = '/api/auth/account/delete/confirm';

async function loginAs(acct) {
  const call = fx.client(baseUrl);
  await call('POST', '/test-login/' + acct.user.id);
  return call;
}
const userExists = (id) => !!m.users.findById(id);
const latestCode = () => {
  const mail = sentMails[sentMails.length - 1];
  const hit = mail && /\b(\d{8})\b/.exec(mail.html);
  return hit ? hit[1] : null;
};

/** 실행 중 콘솔(log/warn/error)로 나간 모든 글자를 모은다. */
async function captureConsole(fn) {
  const lines = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => lines.push(a.map(String).join(' '));
  try { await fn(); } finally { Object.assign(console, orig); }
  return lines.join('\n');
}

test('local account deletion requires the current password', async () => {
  const acct = fx.seedAccount(m);
  const anonymous = fx.client(baseUrl);
  assert.equal((await anonymous('POST', CONFIRM, { password: acct.password })).status, 401);
  assert.equal((await anonymous('POST', REQUEST, {})).status, 401);

  const call = await loginAs(acct);
  const before = JSON.stringify(fx.dumpDb(m.db));
  const logs = await captureConsole(async () => {
    const wrong = await call('POST', CONFIRM, { password: 'not-the-password' });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.data.code, 'invalid_credentials');
    const missing = await call('POST', CONFIRM, {});
    assert.ok([400, 403].includes(missing.status));
    const codeOnly = await call('POST', CONFIRM, { code: '12345678' });
    assert.ok([400, 403].includes(codeOnly.status), 'a local account cannot delete with an email code');
    const local = await call('POST', REQUEST, {});
    assert.equal(local.status, 400);
    assert.equal(local.data.code, 'password_required');
  });
  assert.equal(JSON.stringify(fx.dumpDb(m.db)), before, 'failed attempts must not touch any data');
  assert.ok(fs.existsSync(acct.jobDir));
  assert.ok(!logs.includes('not-the-password') && !logs.includes(acct.password) && !logs.includes(acct.email));

  const ok = await call('POST', CONFIRM, { password: acct.password });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  assert.equal(userExists(acct.user.id), false);
  assert.equal((await call('GET', '/api/auth/me')).data.user, null, 'the session ends with the account');
});

test('social account deletion requires an unexpired one-time verified-email token', async () => {
  const unverified = fx.seedAccount(m, { provider: 'naver', emailVerified: false, email: 'naver_1@social.sajusudal.local' });
  const callUnverified = await loginAs(unverified);
  const blocked = await callUnverified('POST', REQUEST, {});
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, 'email_not_verified');
  assert.equal(sentMails.length, 0, 'no mail goes to an unverified address');

  const acct = fx.seedAccount(m, { provider: 'google' });
  const call = await loginAs(acct);
  assert.equal((await call('POST', CONFIRM, { password: 'anything-at-all' })).status >= 400, true, 'a password cannot delete a social account');

  const logs = await captureConsole(async () => {
    const asked = await call('POST', REQUEST, {});
    assert.equal(asked.status, 200);
    assert.equal(sentMails.length, 1);
    assert.deepEqual(sentMails[0].to, acct.email);
    const code = latestCode();
    assert.match(code, /^\d{8}$/);
    assert.ok(!JSON.stringify(asked.data).includes(code), 'the code is never returned to the browser');
    assert.ok(!JSON.stringify(fx.dumpDb(m.db)).includes(code), 'only a hash of the code is stored');
    assert.ok(!/delete[^"]*[?&]code=/.test(sentMails[0].html), 'the code is entered in mypage, never placed in a URL');

    const snapshot = JSON.stringify(Object.fromEntries(Object.entries(fx.dumpDb(m.db)).filter(([k]) => k !== 'account_deletion_codes')));
    const wrong = await call('POST', CONFIRM, { code: code === '00000000' ? '11111111' : '00000000' });
    assert.equal(wrong.status, 403);
    assert.equal(wrong.data.code, 'invalid_code');
    assert.equal(JSON.stringify(Object.fromEntries(Object.entries(fx.dumpDb(m.db)).filter(([k]) => k !== 'account_deletion_codes'))), snapshot);

    // 만료된 코드
    m.db.prepare("UPDATE account_deletion_codes SET expires_at = datetime('now','-1 minute') WHERE user_id = ?").run(acct.user.id);
    const expired = await call('POST', CONFIRM, { code });
    assert.equal(expired.status, 403);
    assert.equal(expired.data.code, 'code_expired');
    assert.equal(userExists(acct.user.id), true);

    // 새 코드를 받으면 이전 코드는 쓸 수 없다
    await call('POST', REQUEST, {});
    const fresh = latestCode();
    assert.notEqual(fresh, code);
    const stale = await call('POST', CONFIRM, { code });
    assert.equal(stale.status, 403);
    assert.equal(userExists(acct.user.id), true);

    // 여러 번 틀리면 잠긴다 — 이후엔 맞는 코드도 거절한다
    for (let i = 0; i < 5; i += 1) await call('POST', CONFIRM, { code: '99999999' === fresh ? '88888888' : '99999999' });
    const locked = await call('POST', CONFIRM, { code: fresh });
    assert.equal(locked.status, 403);
    assert.equal(userExists(acct.user.id), true);

    // 잠긴 뒤 새로 받은 코드로는 삭제된다
    await call('POST', REQUEST, {});
    const good = latestCode();
    const done = await call('POST', CONFIRM, { code: good });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(userExists(acct.user.id), false);
    assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM account_deletion_codes').get().n, 0);
  });
  assert.ok(!logs.includes(acct.email) && !/\b\d{8}\b/.test(logs), 'codes and emails never reach the logs');
});

const BLOCKING = [
  { name: 'an active report order', seed: { orderStatus: 'active' }, setup: () => {}, status: 'generating', type: 'order',
    fix: (a) => m.orders.markDone(a.jobId, { resultPath: a.resultPath, cardPath: a.cardPath, resultText: 'x' }) },
  ...['confirming', 'reconcile_pending', 'refunding', 'canceling', 'cancel_failed'].map((s) => ({
    name: 'a ' + s + ' payment', seed: {}, type: 'payment', status: s,
    setup: (a) => m.db.prepare('UPDATE card_payments SET status = ? WHERE id = ?').run(s, a.paymentId),
    fix: (a) => m.db.prepare("UPDATE card_payments SET status = 'canceled' WHERE id = ?").run(a.paymentId)
  })),
  { name: 'a paid payment whose report job is not linked', seed: {}, type: 'payment', status: 'paid',
    setup: (a) => m.db.prepare('UPDATE card_payments SET job_id = NULL WHERE id = ?').run(a.paymentId),
    fix: (a) => m.db.prepare('UPDATE card_payments SET job_id = ? WHERE id = ?').run(a.jobId, a.paymentId) },
  { name: 'a pending point request', seed: {}, type: 'point_request', status: 'pending',
    setup: (a) => m.db.prepare("UPDATE point_requests SET status = 'pending' WHERE user_id = ?").run(a.user.id),
    fix: (a) => m.db.prepare("UPDATE point_requests SET status = 'rejected' WHERE user_id = ?").run(a.user.id) }
];

for (const sc of BLOCKING) {
  test('active orders or unresolved payments block deletion without partial changes: ' + sc.name, async () => {
    const acct = fx.seedAccount(m, sc.seed);
    sc.setup(acct);
    const call = await loginAs(acct);
    const before = JSON.stringify(fx.dumpDb(m.db));
    const res = await call('POST', CONFIRM, { password: acct.password });
    assert.equal(res.status, 409);
    assert.equal(res.data.code, 'deletion_blocked');
    assert.ok(res.data.blockers.some((b) => b.type === sc.type && b.status === sc.status), JSON.stringify(res.data.blockers));
    assert.match(res.data.error, /다시|완료|끝/, 'the message explains how to retry later');
    assert.equal(JSON.stringify(fx.dumpDb(m.db)), before, 'a blocked deletion changes nothing');
    assert.ok(fs.existsSync(acct.jobDir) && fs.existsSync(acct.resultPath));

    sc.fix(acct);
    const retry = await call('POST', CONFIRM, { password: acct.password });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.equal(userExists(acct.user.id), false);
  });
}

test('a payment still waiting for card entry blocks deletion, but a stale unpaid one does not', async () => {
  const acct = fx.seedAccount(m, { noPayment: true });
  const row = m.cardPayments.create({ userId: acct.user.id, amountKrw: 3900, orderName: '심층', testMode: false, productKey: 'deep_love', form: { name: 'StaleForm' }, attribution: null });
  const call = await loginAs(acct);
  const blocked = await call('POST', CONFIRM, { password: acct.password });
  assert.equal(blocked.status, 409);
  assert.ok(blocked.data.blockers.some((b) => b.type === 'payment' && b.status === 'ready'));
  m.db.prepare("UPDATE card_payments SET created_at = datetime('now','-2 hours') WHERE id = ?").run(row.id);
  const ok = await call('POST', CONFIRM, { password: acct.password });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok(!JSON.stringify(fx.dumpDb(m.db)).includes('StaleForm'));
});

test('successful deletion removes all account-linked data and report files', async () => {
  const acct = fx.seedAccount(m);
  const second = fx.seedPurchase(m, acct.user, { tag: acct.tag, suffix: 'b' });
  const control = fx.seedAccount(m);
  const controlBefore = fx.rowsForUser(m.db, control.user.id);
  assert.ok(Object.keys(fx.rowsForUser(m.db, acct.user.id)).length >= 8, 'fixture covers every account-linked table');

  const call = await loginAs(acct);
  const res = await call('POST', CONFIRM, { password: acct.password });
  assert.equal(res.status, 200, JSON.stringify(res.data));

  assert.deepEqual(fx.rowsForUser(m.db, acct.user.id), {}, 'no table keeps a row for the user');
  const everything = JSON.stringify(fx.dumpDb(m.db));
  for (const secret of [acct.email, acct.tag, acct.reportText, acct.formName, acct.paymentKey, second.paymentKey, second.reportText,
    acct.jobId, second.jobId, 'pid-' + acct.tag]) {
    assert.ok(!everything.includes(secret), 'database still contains ' + secret.slice(0, 6));
  }
  assert.equal(m.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE sid = ?").get('sid-' + acct.user.id).n, 0);
  for (const dir of [acct.jobDir, second.jobDir]) assert.equal(fs.existsSync(dir), false, 'generated files are removed');
  assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 0, 'the queue is empty once files are gone');

  assert.deepEqual(fx.rowsForUser(m.db, control.user.id), controlBefore, 'other accounts are untouched');
  assert.ok(fs.existsSync(control.resultPath));
  assert.equal((await call('POST', CONFIRM, { password: acct.password })).status, 401, 'the session cannot be reused');
});

const RETAINED_COLUMNS = ['amount_krw', 'approved_at', 'id', 'order_ref', 'payment_ref_digest', 'payment_status', 'product_key',
  'retained_at', 'retention_basis', 'retention_until', 'supply_status', 'transaction_at'];
const utc = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
const plusYears = (s, y) => { const d = new Date(s.replace(' ', 'T') + 'Z'); d.setUTCFullYear(d.getUTCFullYear() + y); return utc(d); };

test('retained payment facts contain no direct account or report data', async () => {
  m.db.exec('DELETE FROM retained_transactions');
  m.db.exec('DELETE FROM retained_transactions');
  const acct = fx.seedAccount(m, { approvedAt: '2026-03-04T05:06:07+09:00' });
  const second = fx.seedPurchase(m, acct.user, { tag: acct.tag, suffix: 'b', approvedAt: '2026-04-01T10:00:00+09:00' });
  const testPay = fx.seedPurchase(m, acct.user, { tag: acct.tag, suffix: 't', testMode: true });
  const canceled = fx.seedCanceledPayment(m, acct.user, acct.tag);
  const revenue = m.users.adminStats().totalRevenue;

  const call = await loginAs(acct);
  assert.equal((await call('POST', CONFIRM, { password: acct.password })).status, 200);
  assert.equal(m.users.adminStats().totalRevenue, revenue, 'retained paid facts still count toward revenue');

  const rows = m.db.prepare('SELECT * FROM retained_transactions ORDER BY id').all();
  assert.equal(rows.length, 3, 'two completed purchases and one canceled payment are kept; the test-mode charge is not');
  rows.forEach((r) => assert.deepEqual(Object.keys(r).sort(), RETAINED_COLUMNS, 'no account or report column exists'));

  const first = rows.find((r) => r.order_ref === acct.payment.order_id);
  assert.equal(first.product_key, 'full');
  assert.equal(first.amount_krw, 14900);
  assert.equal(first.payment_status, 'paid');
  assert.equal(first.supply_status, 'delivered');
  assert.equal(first.approved_at, '2026-03-03 20:06:07');
  assert.equal(first.retention_until, plusYears('2026-03-03 20:06:07', 5), 'contract/payment/supply records: 5 years from the transaction');
  assert.equal(first.retention_basis, 'ecommerce_decree_art6_payment_supply_5y');
  assert.equal(first.payment_ref_digest, crypto.createHash('sha256').update(acct.paymentKey).digest('hex'));
  assert.ok(rows.find((r) => r.order_ref === second.payment.order_id && r.retention_until === plusYears('2026-04-01 01:00:00', 5)));
  const canc = rows.find((r) => r.order_ref === canceled.order_id);
  assert.equal(canc.payment_status, 'canceled');
  // 취소 시각이 따로 없어 삭제 시점과 거래 시각 중 늦은 쪽부터 5년을 센다 — 거래 시각 기준보다 짧아질 수 없다.
  assert.ok(canc.retention_until >= plusYears('2026-05-05 22:08:09', 5));
  assert.ok(canc.retention_until >= plusYears(utc(new Date(Date.now() - 60000)), 5));
  assert.ok(!rows.some((r) => r.order_ref === testPay.payment.order_id), 'test-mode charges move no money and are not kept');
  assert.ok(rows.every((r) => r.retention_basis === 'ecommerce_decree_art6_payment_supply_5y'), 'no 3-year complaint record exists, so none is claimed');

  const text = JSON.stringify(rows);
  for (const secret of [acct.email, acct.tag, acct.user.id + '"', acct.paymentKey, acct.reportText, acct.formName, acct.jobId, second.jobId, 'person', 'Name']) {
    assert.ok(!text.includes(secret), 'retained rows leak ' + secret);
  }
});

test('file removal failure after the database commit leaves only an identity-free retry entry', async () => {
  const acct = fx.seedAccount(m);
  const accountDeletion = require('../src/db/accountDeletion');
  const failing = () => { throw new Error('disk busy'); };
  const result = accountDeletion.deleteAccount(acct.user.id, { removeDir: failing });
  assert.equal(result.ok, true);
  assert.equal(userExists(acct.user.id), false);
  assert.ok(fs.existsSync(acct.jobDir), 'the file survived the failed removal');
  const queue = m.db.prepare('SELECT * FROM file_purge_queue').all();
  assert.equal(queue.length, 1);
  assert.deepEqual(Object.keys(queue[0]).sort(), ['id', 'queued_at', 'rel_dir']);
  assert.equal(queue[0].rel_dir, acct.jobId);

  const swept = accountDeletion.processPurgeQueue();
  assert.equal(swept.removed, 1);
  assert.equal(fs.existsSync(acct.jobDir), false);
  assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 0);
});

test('a failure inside the deletion transaction rolls everything back', async () => {
  const acct = fx.seedAccount(m);
  const accountDeletion = require('../src/db/accountDeletion');
  const before = JSON.stringify(fx.dumpDb(m.db));
  m.db.exec("CREATE TRIGGER block_user_delete BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'forced failure'); END");
  try {
    assert.throws(() => accountDeletion.deleteAccount(acct.user.id), /forced failure/);
  } finally {
    m.db.exec('DROP TRIGGER block_user_delete');
  }
  assert.equal(JSON.stringify(fx.dumpDb(m.db)), before, 'no retained row, queue entry, or deleted record remains');
  assert.ok(fs.existsSync(acct.jobDir));
});

