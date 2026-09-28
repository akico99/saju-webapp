'use strict';
/* 이용자 동의 기록 — 누가, 언제, 어떤 항목의 어떤 버전에 동의했는지 남긴다. 분쟁 때 증거가 된다.

   가입 동의(terms·privacy·age14)는 약관 버전(CONSENT_VERSION = 약관 시행일)마다 받는다. 약관을 바꾸면
   이 값을 올리고, 새 버전에 동의하지 않은 회원은 다음 로그인·결제 때 동의 페이지로 간다.
   주문 동의(order)는 카드 결제 1건마다 결제창을 열기 직전에 받는다(ref = 주문번호). */
const db = require('./index');

const CONSENT_VERSION = '2026-09-28';
const SIGNUP_KINDS = ['terms', 'privacy', 'age14'];

db.exec(`
  CREATE TABLE IF NOT EXISTS consents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    kind TEXT NOT NULL,
    version TEXT NOT NULL,
    ref TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id, kind, version);
  CREATE INDEX IF NOT EXISTS idx_consents_ref ON consents(ref);
`);

const stmts = {
  insert: db.prepare(`
    INSERT INTO consents (user_id, kind, version, ref, ip, user_agent)
    VALUES (@userId, @kind, @version, @ref, @ip, @userAgent)
  `),
  countSignup: db.prepare(`
    SELECT COUNT(DISTINCT kind) AS n FROM consents
    WHERE user_id = ? AND version = ? AND kind IN ('terms', 'privacy', 'age14')
  `),
  findOrder: db.prepare("SELECT id FROM consents WHERE user_id = ? AND kind = 'order' AND ref = ? LIMIT 1")
};

function metaOf(req) {
  if (!req) return { ip: null, userAgent: null };
  return { ip: String(req.ip || '').slice(0, 64) || null, userAgent: String(req.get ? req.get('user-agent') || '' : '').slice(0, 300) || null };
}

/** 가입 필수 동의 3가지가 모두 체크됐는지 — 요청 본문의 agreeTerms / agreePrivacy / agreeAge. */
function signupAgreed(body) {
  return !!body && body.agreeTerms === true && body.agreePrivacy === true && body.agreeAge === true;
}

function recordSignupConsents(userId, req) {
  const { ip, userAgent } = metaOf(req);
  db.transaction(() => {
    SIGNUP_KINDS.forEach((kind) => stmts.insert.run({ userId, kind, version: CONSENT_VERSION, ref: null, ip, userAgent }));
  })();
}

function hasSignupConsent(userId) {
  return stmts.countSignup.get(userId, CONSENT_VERSION).n === SIGNUP_KINDS.length;
}

function recordOrderConsent(userId, orderId, req) {
  if (hasOrderConsent(userId, orderId)) return;
  const { ip, userAgent } = metaOf(req);
  stmts.insert.run({ userId, kind: 'order', version: CONSENT_VERSION, ref: orderId, ip, userAgent });
}

function hasOrderConsent(userId, orderId) {
  return !!stmts.findOrder.get(userId, orderId);
}

module.exports = { CONSENT_VERSION, signupAgreed, recordSignupConsents, hasSignupConsent, recordOrderConsent, hasOrderConsent };

