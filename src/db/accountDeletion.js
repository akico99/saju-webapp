'use strict';
/* 계정 탈퇴 — 본인 확인 코드, 진행 중 거래 차단, 트랜잭션 파기, 최소 거래 기록 분리 보존, 생성 파일 삭제.

   원자성 선택: DB 변경은 SQLite 트랜잭션 하나로 끝낸다(차단 검사 → 코드 소모 → 거래 사실 복사 → 삭제 큐 적기 →
   계정 연결 행 삭제). 파일은 그 뒤에 지운다. 파일 삭제를 트랜잭션 앞에 두면 DB가 실패했을 때 되살릴 수 없으므로
   "DB 커밋과 함께 삭제 큐(폴더 이름만, 계정 정보 없음)를 적고, 커밋 뒤에 지우되 실패하면 시작 시·정기 점검에서
   다시 지운다"로 정했다. 커밋 직후 프로세스가 죽어도 큐가 남아 있으므로 사용자 연결 파일이 무기한 남지 않는다.

   큐 처리 규칙: 일시 실패(no_root·unreadable·삭제 중 오류)는 항목을 남겨 다시 시도한다. 확정된 안전 위반(invalid_name·
   outside_root·symlink·not_directory)은 지우지 않고 큐에서 버리되, 사유만 file_purge_exceptions에 남겨 운영자가 볼 수 있게 한다.
   (경로·계정 정보는 남기지 않는다.)

   로그에는 토큰·비밀번호·이메일·입력·결과 내용을 쓰지 않는다. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./index');
const { OUTPUT_ROOT } = require('../config/outputDir');

const RETENTION_YEARS = 5;
const RETENTION_BASIS = 'ecommerce_decree_art6_payment_supply_5y';
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;
const READY_WINDOW_MINUTES = 30; // card_payments.expireReady와 같은 기준

/* ---------- 시각 ---------- */
const pad = (n) => String(n).padStart(2, '0');
function toUtcString(date) {
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()) + ' ' +
    pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds());
}
/** SQLite 'YYYY-MM-DD HH:MM:SS'(UTC) 또는 오프셋이 있는 ISO 문자열을 UTC Date로 바꾼다. 해석 못 하면 null. */
function parseTime(value) {
  if (!value) return null;
  const s = String(value).trim();
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? new Date(s.replace(' ', 'T') + 'Z') : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** 기산 시각에서 법정 보존 5년 뒤(UTC 문자열). */
function retentionUntil(startTime) {
  const d = parseTime(startTime);
  if (!d) throw new Error('거래 시각을 해석할 수 없습니다.');
  d.setUTCFullYear(d.getUTCFullYear() + RETENTION_YEARS);
  return toUtcString(d);
}

/* ---------- 생성 파일 경로 안전 ---------- */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const sameFile = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
// 디스크가 잠시 안 보이거나 읽기 오류인 경우 — 나중에 다시 시도하면 되는 사유
const TRANSIENT_REASONS = new Set(['no_root', 'unreadable']);

/** OUTPUT_ROOT 바로 아래 작업 폴더 이름 하나를 검증해 실제 경로를 돌려준다. 이름 하나만 허용하므로 '..'·구분자·
    절대경로는 모두 거절되고, 폴더가 링크(symlink/junction)이거나 실제 경로가 root 바로 아래가 아니면 거절한다. */
function resolveGeneratedDir(name, root = OUTPUT_ROOT) {
  if (typeof name !== 'string' || !SAFE_NAME.test(name)) return { ok: false, reason: 'invalid_name' };
  let realRoot;
  try { realRoot = fs.realpathSync(root); } catch (e) { return { ok: false, reason: 'no_root' }; }
  const dir = path.join(realRoot, name);
  if (!sameFile(path.dirname(dir), realRoot)) return { ok: false, reason: 'outside_root' };
  let stat;
  try { stat = fs.lstatSync(dir); } catch (e) {
    if (e.code === 'ENOENT') return { ok: true, dir, exists: false }; // root는 있고 폴더만 없음 — 이미 지워진 것
    return { ok: false, reason: 'unreadable' };
  }
  if (stat.isSymbolicLink()) return { ok: false, reason: 'symlink' };
  if (!stat.isDirectory()) return { ok: false, reason: 'not_directory' };
  let real;
  try { real = fs.realpathSync(dir); } catch (e) { return { ok: false, reason: 'unreadable' }; }
  if (!sameFile(real, dir)) return { ok: false, reason: 'symlink' };
  return { ok: true, dir, exists: true };
}

/** 저장된 파일 경로(result_path·card_path)가 OUTPUT_ROOT 아래 작업 폴더 안의 파일이면 그 폴더 이름을 돌려준다. */
function jobNameOfStoredPath(stored, root = OUTPUT_ROOT) {
  if (typeof stored !== 'string' || !stored || stored.includes('\0')) return null;
  const rel = path.relative(path.resolve(root), path.resolve(stored));
  if (!rel || path.isAbsolute(rel)) return null;
  const parts = rel.split(path.sep);
  if (parts.length < 2 || parts.includes('..') || parts.includes('')) return null;
  return parts[0];
}

function defaultRemoveDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true }); // 폴더 안의 링크는 따라가지 않고 링크만 지운다
}

/** 자동으로 지울 수 없는 생성 파일이 있다는 사실만 남긴다(사유 코드와 시각, 경로·계정 정보 없음). */
function recordException(reason) {
  db.prepare('INSERT INTO file_purge_exceptions (reason) VALUES (?)').run(String(reason).slice(0, 40));
}

/** 삭제 큐를 처리한다. 항목마다 경로를 다시 검증하므로 큐를 손으로 고쳐도 root 밖은 지우지 않는다.
    failed = 일시 실패로 큐에 남겨 다음 점검에서 다시 시도하는 항목, rejected = 확정 위반으로 버린 항목. */
function processPurgeQueue({ removeDir = defaultRemoveDir } = {}) {
  const out = { removed: 0, rejected: 0, failed: 0 };
  const rows = db.prepare('SELECT id, rel_dir FROM file_purge_queue ORDER BY id').all();
  const drop = db.prepare('DELETE FROM file_purge_queue WHERE id = ?');
  for (const row of rows) {
    const target = resolveGeneratedDir(row.rel_dir);
    if (!target.ok) {
      if (TRANSIENT_REASONS.has(target.reason)) { out.failed += 1; continue; }
      out.rejected += 1;
      recordException(target.reason);
      drop.run(row.id);
      continue;
    }
    if (target.exists) {
      try { removeDir(target.dir); } catch (e) { out.failed += 1; continue; }
    }
    out.removed += 1;
    drop.run(row.id);
  }
  return out;
}

/** 운영자가 볼 수 있는 현황: 대기 중인 삭제, 하루 넘게 못 지운 삭제, 자동 삭제 불가로 기록된 건수. */
function purgeStatus() {
  return {
    pending: db.prepare('SELECT COUNT(*) AS n FROM file_purge_queue').get().n,
    stale: db.prepare("SELECT COUNT(*) AS n FROM file_purge_queue WHERE queued_at <= datetime('now', '-1 day')").get().n,
    exceptions: db.prepare('SELECT COUNT(*) AS n FROM file_purge_exceptions').get().n
  };
}

/* ---------- 1회용 확인 코드(소셜 계정) ---------- */
const hashCode = (salt, userId, code) => crypto.createHmac('sha256', salt).update(userId + ':' + code).digest('hex');

/** 새 8자리 코드를 만들어 해시만 저장하고 평문을 돌려준다(메일로만 보낸다). 이전 코드는 모두 무효가 된다. */
function issueDeletionCode(userId) {
  const code = String(crypto.randomInt(0, 100000000)).padStart(8, '0');
  const salt = crypto.randomBytes(16).toString('hex');
  db.transaction(() => {
    db.prepare('DELETE FROM account_deletion_codes WHERE user_id = ?').run(userId);
    db.prepare("INSERT INTO account_deletion_codes (user_id, code_hash, salt, expires_at) VALUES (?, ?, ?, datetime('now', ?))")
      .run(userId, hashCode(salt, userId, code), salt, '+' + CODE_TTL_MINUTES + ' minutes');
  })();
  return code;
}

function revokeDeletionCodes(userId) {
  db.prepare('DELETE FROM account_deletion_codes WHERE user_id = ?').run(userId);
}

/** 코드를 확인한다(소모는 deleteAccount가 트랜잭션 안에서 한다). 틀리면 시도 횟수만 올린다. */
function verifyDeletionCode(userId, code) {
  const row = db.prepare('SELECT * FROM account_deletion_codes WHERE user_id = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(userId);
  if (!row || typeof code !== 'string' || !/^\d{8}$/.test(code) || row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, code: 'invalid_code' };
  if (!db.prepare("SELECT 1 FROM account_deletion_codes WHERE id = ? AND expires_at > datetime('now')").get(row.id)) return { ok: false, code: 'code_expired' };
  const expected = Buffer.from(row.code_hash, 'hex');
  const given = Buffer.from(hashCode(row.salt, userId, code), 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    db.prepare('UPDATE account_deletion_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return { ok: false, code: 'invalid_code' };
  }
  return { ok: true, codeId: row.id };
}

/* ---------- 차단 조건 ---------- */
const FINISHED_ORDER_STATUSES = ['done', 'error']; // 이 둘만 끝난 주문 — 그 밖의 상태는 새 상태여도 기본으로 막는다
const SETTLED_PAYMENT_STATUSES = ['failed', 'canceled']; // paid·ready는 아래에서 따로 본다

/** 탈퇴 전에 끝나야 하는 주문·결제 목록. 비어 있으면 탈퇴할 수 있다. 읽기만 한다. */
function findBlockers(userId) {
  const blockers = [];
  for (const o of db.prepare('SELECT id, status FROM orders WHERE user_id = ?').all(userId)) {
    if (!FINISHED_ORDER_STATUSES.includes(o.status)) blockers.push({ type: 'order', status: o.status, ref: '#' + o.id });
  }
  const payments = db.prepare("SELECT id, order_id, status, job_id, (created_at >= datetime('now', ?)) AS recent FROM card_payments WHERE user_id = ?")
    .all('-' + READY_WINDOW_MINUTES + ' minutes', userId);
  for (const p of payments) {
    if (SETTLED_PAYMENT_STATUSES.includes(p.status)) continue;
    if (p.status === 'ready') {
      if (p.recent) blockers.push({ type: 'payment', status: 'ready', ref: p.order_id });
      continue; // 30분 지난 입력 대기는 만료될 행이라 막지 않는다
    }
    if (p.status === 'paid') {
      const order = p.job_id ? db.prepare('SELECT status FROM orders WHERE job_id = ?').get(p.job_id) : null;
      if (!order || order.status === 'error') blockers.push({ type: 'payment', status: 'paid', ref: p.order_id });
      continue; // 끝나지 않은 주문은 위에서 이미 잡았고, done이면 보내도 된다
    }
    blockers.push({ type: 'payment', status: p.status, ref: p.order_id });
  }
  for (const r of db.prepare("SELECT id FROM point_requests WHERE user_id = ? AND status = 'pending'").all(userId)) {
    blockers.push({ type: 'point_request', status: 'pending', ref: '#' + r.id });
  }
  return blockers;
}

/* ---------- 트랜잭션 파기 ---------- */
const INSERT_RETAINED_SQL =
  'INSERT OR IGNORE INTO retained_transactions ' +
  '(order_ref, product_key, amount_krw, payment_status, supply_status, payment_ref_digest, transaction_at, approved_at, canceled_at, retention_until, retention_basis) ' +
  'VALUES (@orderRef, @productKey, @amountKrw, @paymentStatus, @supplyStatus, @digest, @transactionAt, @approvedAt, @canceledAt, @retentionUntil, @basis)';

/* 보존 기산점(명시적 선택):
   - paid: 승인 시각(approved_at, 없으면 created_at)부터 5년 — 계약·대금결제·공급 기록.
   - canceled: 취소 시각(card_payments.canceled_at)부터 5년 — 청약철회 기록. 취소 시각은 승인 시각보다 이를 수 없다.
     canceled_at 열이 생기기 전에 취소된 예전 건은 취소 시각을 알 수 없으므로 삭제 시점부터 센다(보존이 모자라지 않는 쪽). */
function retainTransactions(userId, now) {
  const insert = db.prepare(INSERT_RETAINED_SQL);
  let kept = 0;
  const nowText = toUtcString(now);
  // 실제 결제가 승인된 카드 거래(승인 후 정상 이용·취소 모두). 테스트 결제는 돈이 오가지 않아 법정 보존 대상이 아니다.
  for (const p of db.prepare("SELECT * FROM card_payments WHERE user_id = ? AND test_mode = 0 AND status IN ('paid','canceled')").all(userId)) {
    const approved = parseTime(p.approved_at);
    const base = approved || parseTime(p.created_at);
    if (!base) throw new Error('거래 시각을 해석할 수 없습니다.');
    const transactionAt = toUtcString(base);
    const canceled = p.status === 'canceled' ? parseTime(p.canceled_at) : null;
    const canceledAt = canceled ? toUtcString(canceled) : null;
    let clockStart = transactionAt;
    if (p.status === 'canceled') {
      const cancelClock = canceledAt || nowText;
      clockStart = cancelClock > transactionAt ? cancelClock : transactionAt;
    }
    const order = db.prepare('SELECT status FROM orders WHERE card_payment_id = ? OR (job_id IS NOT NULL AND job_id = ?)').get(p.id, p.job_id || '');
    kept += insert.run({
      orderRef: p.order_id, productKey: p.product_key || null, amountKrw: p.amount_krw, paymentStatus: p.status,
      supplyStatus: order ? (order.status === 'done' ? 'delivered' : 'failed') : 'none',
      digest: p.payment_key ? crypto.createHash('sha256').update(p.payment_key).digest('hex') : null,
      transactionAt, approvedAt: approved ? transactionAt : null, canceledAt,
      retentionUntil: retentionUntil(clockStart), basis: RETENTION_BASIS
    }).changes;
  }
  // 예전 무통장 충전 중 승인된 건(대금결제 기록). 입금자명·관리자 메모는 가져오지 않는다.
  for (const r of db.prepare("SELECT * FROM point_requests WHERE user_id = ? AND status = 'approved'").all(userId)) {
    const base = parseTime(r.resolved_at) || parseTime(r.created_at);
    if (!base) throw new Error('거래 시각을 해석할 수 없습니다.');
    kept += insert.run({
      orderRef: 'bank_' + r.id, productKey: null, amountKrw: r.amount_krw, paymentStatus: 'approved', supplyStatus: 'none', digest: null,
      transactionAt: toUtcString(base), approvedAt: toUtcString(base), canceledAt: null,
      retentionUntil: retentionUntil(toUtcString(base)), basis: RETENTION_BASIS
    }).changes;
  }
  return kept;
}

/** 이 계정의 생성 파일 폴더를 모아 검증하고 삭제 큐에 적는다.
    확정 위반(root 밖 경로, 링크 등)은 큐에 넣지 않고 사유만 기록하며 rejected로 센다.
    일시 실패(디스크가 잠시 안 보임 등)는 이름이 안전하면 큐에 넣어 나중에 다시 시도한다(deferred). */
function queueGeneratedFiles(userId) {
  const names = new Set();
  let rejected = 0;
  for (const o of db.prepare('SELECT job_id, result_path, card_path FROM orders WHERE user_id = ?').all(userId)) {
    names.add(o.job_id);
    const seen = new Set();
    for (const stored of [o.result_path, o.card_path]) {
      if (!stored || seen.has(stored)) continue;
      seen.add(stored);
      const name = jobNameOfStoredPath(stored);
      if (name === null) { rejected += 1; recordException('stored_path_outside_root'); } else names.add(name);
    }
  }
  for (const p of db.prepare('SELECT job_id FROM card_payments WHERE user_id = ? AND job_id IS NOT NULL').all(userId)) names.add(p.job_id);

  const enqueue = db.prepare('INSERT OR IGNORE INTO file_purge_queue (rel_dir) VALUES (?)');
  let queued = 0;
  let deferred = 0;
  for (const name of names) {
    const target = resolveGeneratedDir(name);
    if (target.ok) {
      if (target.exists) queued += enqueue.run(name).changes;
    } else if (TRANSIENT_REASONS.has(target.reason)) {
      queued += enqueue.run(name).changes;
      deferred += 1;
    } else {
      rejected += 1;
      recordException(target.reason);
    }
  }
  return { queued, deferred, rejected };
}

const hasTable = (name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

/** 계정을 지운다. 진행 중 거래가 있으면 아무것도 바꾸지 않고 { ok:false, code:'deletion_blocked', blockers }를 돌려준다.
    codeId를 주면(소셜 계정) 같은 트랜잭션 안에서 코드를 소모한다 — 차단되면 코드는 그대로 남는다.
    성공하면 files.pending(재시도 대기 중인 폴더)과 rejected(자동 삭제할 수 없어 운영자 확인이 필요한 대상)를 함께 알려준다. */
function deleteAccount(userId, { codeId = null, removeDir, now = new Date() } = {}) {
  const outcome = db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return { ok: false, code: 'user_not_found' };
    const blockers = findBlockers(userId);
    if (blockers.length) return { ok: false, code: 'deletion_blocked', blockers };
    if (codeId != null) {
      const used = db.prepare("UPDATE account_deletion_codes SET used_at = datetime('now') WHERE id = ? AND user_id = ? AND used_at IS NULL AND attempts < ? AND expires_at > datetime('now')")
        .run(codeId, userId, MAX_CODE_ATTEMPTS);
      if (used.changes !== 1) return { ok: false, code: 'invalid_code' };
    }
    const retained = retainTransactions(userId, now);
    const files = queueGeneratedFiles(userId);
    // 자식 표부터 지운다(외래 키).
    for (const table of ['consents', 'saved_profiles', 'point_transactions', 'point_requests', 'email_verifications', 'password_resets',
      'account_deletion_codes', 'orders', 'card_payments']) {
      db.prepare('DELETE FROM ' + table + ' WHERE user_id = ?').run(userId);
    }
    if (hasTable('sessions')) db.prepare("DELETE FROM sessions WHERE json_extract(sess, '$.userId') = ?").run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return { ok: true, retained, rejected: files.rejected, queued: files.queued };
  })();
  if (!outcome.ok) return outcome;
  const swept = processPurgeQueue({ removeDir });
  return { ...outcome, files: { removed: swept.removed, pending: swept.failed } };
}

/* ---------- 보존 기한 만료 ---------- */
function expireRetained(now = new Date()) {
  return db.prepare('DELETE FROM retained_transactions WHERE retention_until <= ?').run(toUtcString(now)).changes;
}
function purgeExpiredCodes() {
  return db.prepare("DELETE FROM account_deletion_codes WHERE expires_at <= datetime('now', '-1 day') OR used_at IS NOT NULL").run().changes;
}

module.exports = {
  RETENTION_YEARS, RETENTION_BASIS, CODE_TTL_MINUTES, MAX_CODE_ATTEMPTS,
  retentionUntil, resolveGeneratedDir, jobNameOfStoredPath, processPurgeQueue, purgeStatus,
  issueDeletionCode, revokeDeletionCodes, verifyDeletionCode, findBlockers, deleteAccount, expireRetained, purgeExpiredCodes
};
