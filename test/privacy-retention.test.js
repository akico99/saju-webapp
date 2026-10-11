'use strict';
/* 보존 기한 만료와 파일 경로 안전 — 만료된 거래 기록은 지워지고, OUTPUT_ROOT 밖의 파일은 어떤 경우에도 건드리지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fx = require('./helpers/account-fixtures');
const tmpDir = fx.makeTempEnv('saju-privacy-ret-');
const m = fx.load();
const accountDeletion = require('../src/db/accountDeletion');
const { runPrivacyMaintenance } = require('../src/jobs/privacyMaintenance');

test.after(() => {
  m.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const insertRetained = (ref, until) => m.db.prepare(
  "INSERT INTO retained_transactions (order_ref, product_key, amount_krw, payment_status, supply_status, payment_ref_digest, transaction_at, approved_at, retention_until, retention_basis) " +
  "VALUES (?, 'full', 14900, 'paid', 'delivered', 'digest', '2021-01-01 00:00:00', '2021-01-01 00:00:00', ?, 'ecommerce_decree_art6_payment_supply_5y')"
).run(ref, until);

test('retained transactions expire at their configured legal deadline', () => {
  m.db.exec('DELETE FROM retained_transactions');
  insertRetained('past', "2020-01-01 00:00:00");
  insertRetained('boundary', '2026-06-01 12:00:00');
  insertRetained('future', '2099-01-01 00:00:00');

  assert.equal(accountDeletion.expireRetained(new Date('2026-06-01T11:59:59Z')), 1, 'only the past deadline expires before the boundary');
  assert.equal(accountDeletion.expireRetained(new Date('2026-06-01T12:00:00Z')), 1, 'a row expires at its deadline');
  assert.deepEqual(m.db.prepare('SELECT order_ref FROM retained_transactions').all().map((r) => r.order_ref), ['future']);

  insertRetained('past-again', '2019-01-01 00:00:00');
  const swept = runPrivacyMaintenance();
  assert.equal(swept.expired, 1, 'the scheduled maintenance function expires rows with the real clock');
  assert.deepEqual(m.db.prepare('SELECT order_ref FROM retained_transactions').all().map((r) => r.order_ref), ['future']);
});

test('retention deadline is five years after the transaction time', () => {
  assert.equal(accountDeletion.retentionUntil('2026-03-04T05:06:07+09:00'), '2031-03-03 20:06:07');
  assert.equal(accountDeletion.retentionUntil('2026-03-03 20:06:07'), '2031-03-03 20:06:07');
  assert.equal(accountDeletion.retentionUntil('2024-02-29 00:00:00'), '2029-03-01 00:00:00');
});

test('expiry runs at startup and on the existing maintenance cadence', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /privacyMaintenance/);
  const startup = server.indexOf('runPrivacyMaintenance()');
  assert.ok(startup > -1 && startup < server.indexOf('paymentRecoveryTimer = setInterval'), 'runs before the first interval tick, at startup');
  const timer = server.slice(server.indexOf('paymentRecoveryTimer = setInterval'), server.indexOf('paymentRecoveryTimer.unref'));
  assert.match(timer, /runPrivacyMaintenance\(\)/, 'also runs inside the existing 60-second timer');
});

test('stored paths cannot escape OUTPUT_ROOT', () => {
  const root = m.OUTPUT_ROOT;
  const outside = path.join(tmpDir, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');

  for (const bad of ['..', '../outside', '..\\outside', 'a/../../outside', '', '.', '/etc', 'C:\\Windows', outside, 'a/b', 'a\0b', null, undefined]) {
    assert.equal(accountDeletion.resolveGeneratedDir(bad).ok, false, 'rejects ' + String(bad));
  }
  fs.mkdirSync(path.join(root, 'good-job'));
  const good = accountDeletion.resolveGeneratedDir('good-job');
  assert.equal(good.ok, true);
  assert.equal(path.dirname(good.dir), fs.realpathSync(root));

  // 심볼릭 링크(윈도에서는 junction)로 밖을 가리키는 작업 폴더
  const link = path.join(root, 'linked-job');
  fs.symlinkSync(outside, link, 'junction');
  const viaLink = accountDeletion.resolveGeneratedDir('linked-job');
  assert.equal(viaLink.ok, false);
  assert.equal(viaLink.reason, 'symlink');
});

test('deletion never touches files outside OUTPUT_ROOT even when stored records point there', () => {
  const root = m.OUTPUT_ROOT;
  const outside = path.join(tmpDir, 'outside2');
  fs.mkdirSync(outside, { recursive: true });
  const victim = path.join(outside, 'victim.pdf');
  fs.writeFileSync(victim, 'victim');

  const acct = fx.seedAccount(m);
  // 저장된 결과 경로를 밖으로 돌리고, 두 번째 주문은 경로 이탈 job_id와 링크 폴더를 쓴다.
  m.db.prepare('UPDATE orders SET result_path = ?, card_path = ? WHERE job_id = ?').run(victim, path.join(outside, '..', 'outside2', 'victim.pdf'), acct.jobId);
  const evil = fx.seedPurchase(m, acct.user, { tag: acct.tag, suffix: 'e' });
  m.db.prepare('UPDATE orders SET job_id = ? WHERE job_id = ?').run('../outside2', evil.jobId);
  m.db.prepare('UPDATE card_payments SET job_id = ? WHERE job_id = ?').run('../outside2', evil.jobId);
  const linked = fx.seedPurchase(m, acct.user, { tag: acct.tag, suffix: 'l' });
  fs.rmSync(linked.jobDir, { recursive: true, force: true });
  fs.symlinkSync(outside, linked.jobDir, 'junction');

  const result = accountDeletion.deleteAccount(acct.user.id);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.rejected >= 2, 'unsafe targets are counted as rejected');
  assert.equal(fs.readFileSync(victim, 'utf8'), 'victim', 'outside files survive');
  assert.ok(fs.existsSync(outside));
  assert.equal(fs.existsSync(path.join(root, acct.jobId)), false, 'the safe job directory is still removed');
  assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 0, 'unsafe entries are never queued');
  assert.equal(m.users.findById(acct.user.id), undefined);
});

test('a link inside a job directory is removed without following it', () => {
  const outside = path.join(tmpDir, 'outside4');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  const acct = fx.seedAccount(m);
  fs.symlinkSync(outside, path.join(acct.jobDir, 'escape-link'), 'junction');
  assert.equal(accountDeletion.deleteAccount(acct.user.id).ok, true);
  assert.equal(fs.existsSync(acct.jobDir), false);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep', 'the link target is not emptied');
});

test('a hand-edited purge queue entry is re-validated and dropped without deleting anything', () => {
  const outside = path.join(tmpDir, 'outside3');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  m.db.prepare('INSERT INTO file_purge_queue (rel_dir) VALUES (?)').run('../outside3');
  const swept = accountDeletion.processPurgeQueue();
  assert.equal(swept.rejected, 1);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 0);
});

test('a temporarily unreadable output root keeps the queue entry and retries later', () => {
  const acct = fx.seedAccount(m);
  const exceptionsBefore = m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_exceptions').get().n;
  const away = m.OUTPUT_ROOT + '-away';
  fs.renameSync(m.OUTPUT_ROOT, away);
  try {
    const result = accountDeletion.deleteAccount(acct.user.id);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.rejected, 0, 'a disk that is briefly missing is not a safety violation');
    assert.equal(result.files.pending, 1, 'the folder is waiting for a retry');
    assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 1);
    assert.equal(accountDeletion.processPurgeQueue().failed, 1, 'a later sweep still cannot reach it and keeps the entry');
    assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 1);
  } finally {
    fs.renameSync(away, m.OUTPUT_ROOT);
  }
  assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_exceptions').get().n, exceptionsBefore, 'no exception was recorded');
  const swept = accountDeletion.processPurgeQueue();
  assert.equal(swept.removed, 1);
  assert.equal(fs.existsSync(acct.jobDir), false);
  assert.equal(m.db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n, 0);
});

test('a safety violation in the queue is dropped and recorded as a bare reason without paths or accounts', () => {
  const outside = path.join(tmpDir, 'outside5');
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
  fs.symlinkSync(outside, path.join(m.OUTPUT_ROOT, 'queued-link'), 'junction');
  m.db.exec('DELETE FROM file_purge_exceptions');
  m.db.prepare('INSERT INTO file_purge_queue (rel_dir) VALUES (?)').run('../outside5');
  m.db.prepare('INSERT INTO file_purge_queue (rel_dir) VALUES (?)').run('queued-link');
  const swept = accountDeletion.processPurgeQueue();
  assert.equal(swept.rejected, 2);
  assert.equal(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
  const rows = m.db.prepare('SELECT * FROM file_purge_exceptions ORDER BY id').all();
  assert.deepEqual(rows.map((r) => r.reason), ['invalid_name', 'symlink']);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['id', 'noted_at', 'reason']);
  assert.equal(accountDeletion.purgeStatus().exceptions, 2);
  fs.rmSync(path.join(m.OUTPUT_ROOT, 'queued-link'), { force: true, recursive: true });
});

test('retention clock: paid counts from approval, canceled from the cancellation, legacy cancellations from deletion', () => {
  m.db.exec('DELETE FROM retained_transactions');
  const acct = fx.seedAccount(m, { noPayment: true });
  const legacy = fx.seedCanceledPayment(m, acct.user, 'legacy');
  assert.ok(legacy.canceled_at, 'a normal cancellation records its own timestamp');
  m.db.prepare('UPDATE card_payments SET canceled_at = NULL WHERE id = ?').run(legacy.id);
  const fresh = fx.seedCanceledPayment(m, acct.user, 'fresh');
  m.db.prepare('UPDATE card_payments SET canceled_at = ? WHERE id = ?').run('2026-08-09 10:11:12', fresh.id);
  const paid = fx.seedPurchase(m, acct.user, { approvedAt: '2026-02-03T04:05:06Z' });

  const result = accountDeletion.deleteAccount(acct.user.id, { now: new Date('2027-01-02T03:04:05Z') });
  assert.equal(result.ok, true);
  const row = (ref) => m.db.prepare('SELECT * FROM retained_transactions WHERE order_ref = ?').get(ref);
  assert.equal(row(paid.payment.order_id).retention_until, '2031-02-03 04:05:06');
  assert.equal(row(fresh.order_id).retention_until, '2031-08-09 10:11:12');
  assert.equal(row(fresh.order_id).canceled_at, '2026-08-09 10:11:12');
  assert.equal(row(legacy.order_id).canceled_at, null);
  assert.equal(row(legacy.order_id).retention_until, '2032-01-02 03:04:05', 'unknown cancellation time: five years from deletion');
});

