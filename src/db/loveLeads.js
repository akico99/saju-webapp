'use strict';
/* 연애 무료 분석의 이메일 수신자(love_leads). 결과 메일·후속 광고 메일·'메일 링크로 결과 다시 보기'에 쓴다.

   - 시각은 모두 UTC ISO 문자열(예: 2026-11-16T01:00:00.000Z)로 저장한다. 문자열 비교가 곧 시간 비교다.
   - token은 다시 보기와 수신 거부를 겸하는 무작위 값이라 응답·로그에 남기지 않는다(메일 링크로만 나간다).
   - top1_ym(1위 달)은 메일 발송 시점 계산에만 쓰고 어떤 응답에도 싣지 않는다.
   - delete_after가 지나면 privacyMaintenance가 행을 지운다. 광고 수신 동의자는 마지막 알림(1위 달 1일) 뒤 30일,
     최대 첫 저장 후 13개월까지, 나머지는 입력 후 30일이다. 수신 거부하면 지금부터 30일 이내로 줄인다. */
const crypto = require('crypto');
const db = require('./index');

db.exec(`
  CREATE TABLE IF NOT EXISTS love_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    birth_json TEXT NOT NULL,
    situation TEXT NOT NULL,
    start_ym TEXT,
    top1_ym TEXT,
    input_key TEXT NOT NULL,
    agree_privacy_at TEXT NOT NULL,
    agree_marketing_at TEXT,
    unsubscribed_at TEXT,
    result_mail_sent_at TEXT,
    result_mail_skip INTEGER NOT NULL DEFAULT 0,
    followup1_sent_at TEXT,
    followup3_sent_at TEXT,
    top1_alert_sent_at TEXT,
    purchased_at TEXT,
    mail_fail_count INTEGER NOT NULL DEFAULT 0,
    mail_claim_at TEXT,
    created_at TEXT NOT NULL,
    delete_after TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_love_leads_input ON love_leads(email, input_key);
  CREATE INDEX IF NOT EXISTS idx_love_leads_delete ON love_leads(delete_after);
`);

const DAY = 86400000;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
// 같은 이메일로 하루에 새로 저장할 수 있는 행 수, 같은 입력을 다시 낼 때 결과 메일을 다시 보내는 최소 간격
const DAILY_NEW_ROWS = 3;
const RESEND_RESULT_AFTER_MS = 6 * 3600000;
const MAX_FAILS = 5;

const iso = (ms) => new Date(ms).toISOString();
function addMonthsIso(isoText, n) {
  const d = new Date(isoText);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString();
}
// 'YYYY-MM' 달 1일 0시(KST)의 시각(ms)
function monthStartMs(ym) {
  const t = Date.parse(String(ym) + '-01T00:00:00+09:00');
  return Number.isNaN(t) ? null : t;
}

function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || /[\u0000-\u001f\u007f]/.test(email) || !EMAIL_RE.test(email)) return null;
  return email;
}

function inputKey(birth, situation) {
  const b = birth || {};
  const canon = [situation, b.gender, b.year, b.month, b.day, b.hour == null ? '' : b.hour, b.minute || 0, b.isLunar ? 1 : 0, b.isLeap ? 1 : 0].join('|');
  return crypto.createHash('sha256').update(canon).digest('hex').slice(0, 32);
}

const newToken = () => crypto.randomBytes(24).toString('base64url');

function deleteAfterFor({ createdAt, anchorAt, marketing, top1Ym }) {
  const base = Date.parse(anchorAt) + 30 * DAY;
  if (!marketing) return iso(base);
  let end = base;
  const top1 = top1Ym ? monthStartMs(top1Ym) : null;
  if (top1 != null) end = Math.max(end, top1 + 30 * DAY);
  return iso(Math.min(end, Date.parse(addMonthsIso(createdAt, 13))));
}

/* 저장 또는 갱신. email은 normalizeEmail을 거친 값, birth는 parseBody의 birth 객체.
   같은 이메일+같은 입력이면 행을 갱신하고, 같은 이메일로 하루 3행을 넘으면 결과 메일과 광고 동의 없이 행만 남긴다. */
function upsert({ email, name, birth, situation, startYm, top1Ym, marketing }, now = new Date()) {
  const nowIso = now.toISOString();
  const key = inputKey(birth, situation);
  const wantsMarketing = marketing === true;
  return db.transaction(() => {
    let row = db.prepare('SELECT * FROM love_leads WHERE email=? AND input_key=?').get(email, key);
    if (row && row.delete_after <= nowIso) {
      db.prepare('DELETE FROM love_leads WHERE id=?').run(row.id);
      row = undefined;
    }
    if (!row) {
      const recent = db.prepare('SELECT COUNT(*) AS n FROM love_leads WHERE email=? AND created_at > ?').get(email, iso(now.getTime() - DAY)).n;
      const capped = recent >= DAILY_NEW_ROWS;
      const useMarketing = wantsMarketing && !capped;
      const info = db.prepare(`INSERT INTO love_leads
        (token, email, name, birth_json, situation, start_ym, top1_ym, input_key, agree_privacy_at, agree_marketing_at, result_mail_skip, created_at, delete_after)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        newToken(), email, name || '', JSON.stringify(birth), situation, startYm || null, top1Ym || null, key, nowIso,
        useMarketing ? nowIso : null, capped ? 1 : 0, nowIso,
        deleteAfterFor({ createdAt: nowIso, anchorAt: nowIso, marketing: useMarketing, top1Ym })
      );
      return { id: Number(info.lastInsertRowid), created: true, resultQueued: !capped, marketing: useMarketing };
    }
    // 같은 입력을 다시 낸 경우 — 최신 선택을 따른다. 광고 동의를 해제하면 철회로 본다.
    let agreeMarketing = null;
    let unsubscribed = row.unsubscribed_at;
    if (wantsMarketing) {
      agreeMarketing = row.agree_marketing_at && !row.unsubscribed_at ? row.agree_marketing_at : nowIso;
      unsubscribed = null;
    }
    const sentMs = row.result_mail_sent_at ? Date.parse(row.result_mail_sent_at) : null;
    const requeue = sentMs != null && now.getTime() - sentMs >= RESEND_RESULT_AFTER_MS && !row.result_mail_skip;
    const resultQueued = !row.result_mail_sent_at ? !row.result_mail_skip : requeue;
    db.prepare(`UPDATE love_leads SET name=?, situation=?, start_ym=?, top1_ym=?, agree_privacy_at=?, agree_marketing_at=?, unsubscribed_at=?,
      result_mail_sent_at=?, mail_fail_count=0, mail_claim_at=NULL, delete_after=? WHERE id=?`).run(
      name || '', situation, startYm || null, top1Ym || null, nowIso, agreeMarketing, unsubscribed,
      requeue ? null : row.result_mail_sent_at,
      deleteAfterFor({ createdAt: row.created_at, anchorAt: nowIso, marketing: !!agreeMarketing && !unsubscribed, top1Ym }), row.id
    );
    return { id: row.id, created: false, resultQueued, marketing: !!agreeMarketing && !unsubscribed };
  })();
}

const get = (id) => db.prepare('SELECT * FROM love_leads WHERE id=?').get(id);

function findByToken(token, now = new Date()) {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
  const row = db.prepare('SELECT * FROM love_leads WHERE token=?').get(token);
  return row && row.delete_after > now.toISOString() ? row : null;
}

/* 수신 거부 — 같은 이메일의 모든 행에 적용하고 보관 기한을 지금부터 30일 이내로 줄인다. 처리했으면 true. */
function unsubscribe(token, now = new Date()) {
  const row = findByToken(token, now);
  if (!row) return false;
  const nowIso = now.toISOString();
  const cut = iso(now.getTime() + 30 * DAY);
  db.prepare('UPDATE love_leads SET unsubscribed_at=COALESCE(unsubscribed_at, ?), delete_after=MIN(delete_after, ?) WHERE email=?').run(nowIso, cut, row.email);
  return true;
}

/* 구매자 표시 — 같은 이메일로 연애 시기 리포트를 결제하면 판매 메일을 멈춘다. 결제 직후(startLove)에 부른다. */
function markPurchasedByEmail(email, now = new Date()) {
  const e = normalizeEmail(email);
  if (!e) return 0;
  return db.prepare('UPDATE love_leads SET purchased_at=? WHERE email=? AND purchased_at IS NULL').run(now.toISOString(), e).changes;
}

/* 안전망 — 구매 기록에서 이메일을 찾아 아직 표시되지 않은 행을 표시한다. 대조 위치:
   1) report_delivery.email(PDF 수신 이메일, 주문 job_id로 연결, 입력 후 30일 보관)
   2) card_payments.form_json의 deliveryEmail(승인된 love_timing 결제, 30일 지나면 지워짐)
   3) 주문한 회원 계정 이메일(users.email) */
function sweepPurchases(now = new Date()) {
  require('./reportDelivery');
  const nowIso = now.toISOString();
  const sources = [
    `SELECT lower(trim(d.email)) FROM report_delivery d JOIN orders o ON o.job_id=d.job_id WHERE o.product_key='love_timing' AND o.status<>'error'`,
    `SELECT lower(trim(json_extract(form_json,'$.deliveryEmail'))) FROM card_payments WHERE product_key='love_timing' AND status='paid' AND json_valid(form_json)`,
    `SELECT lower(trim(u.email)) FROM orders o JOIN users u ON u.id=o.user_id WHERE o.product_key='love_timing' AND o.status<>'error'`
  ];
  let n = 0;
  for (const s of sources) {
    n += db.prepare('UPDATE love_leads SET purchased_at=? WHERE purchased_at IS NULL AND email IN (' + s + ')').run(nowIso).changes;
  }
  return n;
}

// 발송 대상 후보 — 결과 메일이 남았거나, 광고 동의·수신 중·미구매이면서 보낼 광고 메일이 남은 행.
function mailCandidates(now = new Date()) {
  return db.prepare(`SELECT * FROM love_leads WHERE delete_after > ? AND mail_fail_count < ? AND (
    (result_mail_sent_at IS NULL AND result_mail_skip=0) OR
    (agree_marketing_at IS NOT NULL AND unsubscribed_at IS NULL AND purchased_at IS NULL
      AND (followup1_sent_at IS NULL OR followup3_sent_at IS NULL OR top1_alert_sent_at IS NULL)))
    ORDER BY id LIMIT 200`).all(now.toISOString(), MAX_FAILS);
}

function claim(id, now = new Date()) {
  return db.prepare('UPDATE love_leads SET mail_claim_at=? WHERE id=? AND (mail_claim_at IS NULL OR mail_claim_at < ?)')
    .run(now.toISOString(), id, iso(now.getTime() - 5 * 60000)).changes === 1;
}
const SENT_COLUMNS = { result: 'result_mail_sent_at', d1: 'followup1_sent_at', d3: 'followup3_sent_at', top1: 'top1_alert_sent_at' };
function markSent(id, kind, now = new Date()) {
  const col = SENT_COLUMNS[kind];
  if (!col) throw new Error('알 수 없는 메일 종류');
  db.prepare('UPDATE love_leads SET ' + col + '=?, mail_claim_at=NULL WHERE id=?').run(now.toISOString(), id);
}
function markFailed(id) {
  db.prepare('UPDATE love_leads SET mail_fail_count=mail_fail_count+1, mail_claim_at=NULL WHERE id=?').run(id);
}
function release(id) {
  db.prepare('UPDATE love_leads SET mail_claim_at=NULL WHERE id=?').run(id);
}

function deleteExpired(now = new Date()) {
  return db.prepare('DELETE FROM love_leads WHERE delete_after <= ?').run(now.toISOString()).changes;
}

/* 운영 점검용 집계 — 숫자만 돌려준다(이메일·이름·토큰 없음). 현재 저장돼 있는 행 기준이다(보관 기한이 지나 삭제된 행은 빠진다).
   all은 전체, day는 최근 24시간에 일어난 일이다. 실패(재시도 한도 도달)는 시각을 따로 두지 않아 24시간 칸은 최근 24시간에 저장된 행 중 한도에 닿은 수다. */
function stats(now = new Date()) {
  const since = iso(now.getTime() - DAY);
  const count = (col) => ({
    all: db.prepare('SELECT COUNT(*) AS n FROM love_leads WHERE ' + col + ' IS NOT NULL').get().n,
    day: db.prepare('SELECT COUNT(*) AS n FROM love_leads WHERE ' + col + ' > ?').get(since).n
  });
  const failed = {
    all: db.prepare('SELECT COUNT(*) AS n FROM love_leads WHERE mail_fail_count >= ?').get(MAX_FAILS).n,
    day: db.prepare('SELECT COUNT(*) AS n FROM love_leads WHERE mail_fail_count >= ? AND created_at > ?').get(MAX_FAILS, since).n
  };
  return {
    saved: { all: db.prepare('SELECT COUNT(*) AS n FROM love_leads').get().n, day: db.prepare('SELECT COUNT(*) AS n FROM love_leads WHERE created_at > ?').get(since).n },
    marketing: count('agree_marketing_at'),
    result: count('result_mail_sent_at'),
    d1: count('followup1_sent_at'),
    d3: count('followup3_sent_at'),
    top1: count('top1_alert_sent_at'),
    unsubscribed: count('unsubscribed_at'),
    purchased: count('purchased_at'),
    failed
  };
}

module.exports = {
  normalizeEmail, inputKey, upsert, get, findByToken, unsubscribe, markPurchasedByEmail, sweepPurchases,
  mailCandidates, claim, markSent, markFailed, release, deleteExpired, monthStartMs, deleteAfterFor, stats,
  SENT_COLUMNS, MAX_FAILS, TOKEN_RE
};
