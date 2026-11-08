'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');

function toPublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    gender: row.gender,
    emailVerified: !!row.email_verified,
    isGuest: row.provider === 'guest',
    birth: row.birth_year ? {
      year: row.birth_year, month: row.birth_month, day: row.birth_day,
      hour: row.birth_hour, minute: row.birth_minute,
      isLunar: !!row.is_lunar, isLeap: !!row.is_leap, city: row.city,
      noLonCorrection: !!row.no_lon_correction
    } : null,
    createdAt: row.created_at
  };
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO users (email, password_hash, name, gender, birth_year, birth_month, birth_day,
                        birth_hour, birth_minute, is_lunar, is_leap, city, no_lon_correction, email_verified)
    VALUES (@email, @passwordHash, @name, @gender, @birthYear, @birthMonth, @birthDay,
            @birthHour, @birthMinute, @isLunar, @isLeap, @city, @noLonCorrection, 0)
  `),
  findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  findByProvider: db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?'),
  insertSocial: db.prepare(`
    INSERT INTO users (email, password_hash, name, provider, provider_id, email_verified)
    VALUES (@email, @passwordHash, @name, @provider, @providerId, @emailVerified)
  `),
  adjustBalance: db.prepare('UPDATE users SET point_balance = point_balance + ? WHERE id = ?'),
  updateBirth: db.prepare(`
    UPDATE users SET gender=@gender, birth_year=@birthYear, birth_month=@birthMonth, birth_day=@birthDay,
      birth_hour=@birthHour, birth_minute=@birthMinute, is_lunar=@isLunar, is_leap=@isLeap, city=@city,
      no_lon_correction=@noLonCorrection
    WHERE id=@id
  `),
  updatePasswordHash: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  markEmailVerified: db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?')
};

function createUser({ email, passwordHash, name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, isLunar, isLeap, city, noLonCorrection }) {
  const info = stmts.insert.run({
    email, passwordHash, name: name || null, gender: gender || null,
    birthYear: birthYear || null, birthMonth: birthMonth || null, birthDay: birthDay || null,
    birthHour: birthHour != null ? birthHour : null, birthMinute: birthMinute != null ? birthMinute : 0,
    isLunar: isLunar ? 1 : 0, isLeap: isLeap ? 1 : 0, city: city || null,
    noLonCorrection: noLonCorrection ? 1 : 0
  });
  return stmts.findById.get(info.lastInsertRowid);
}

function findByEmail(email) {
  return stmts.findByEmail.get(email);
}

function findByProvider(provider, providerId) {
  return stmts.findByProvider.get(provider, String(providerId));
}

/** emailVerified: 제공사가 확인해 준 실제 이메일일 때만 true. 가짜 주소(…@social.sajusudal.local)는 false. */
function createSocialUser({ email, name, provider, providerId, emailVerified = false }) {
  /* 소셜 계정은 비밀번호가 없다 — 아무도 모르는 무작위 값을 bcrypt 해시로 저장해
     password_hash NOT NULL 제약을 만족시키되, 이메일/비밀번호 로그인으로는 절대 맞을 수 없게 한다. */
  const passwordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const info = stmts.insertSocial.run({
    email, passwordHash, name: name || null, provider, providerId: String(providerId), emailVerified: emailVerified ? 1 : 0
  });
  return stmts.findById.get(info.lastInsertRowid);
}

function findById(id) {
  return stmts.findById.get(id);
}

/* 비회원 결제 — 가입 없이 결제하는 손님에게 내부용 계정을 붙인다. 결제·생성·환불·결과 보기 코드가 모두
   user_id를 기준으로 움직이므로, 같은 경로를 그대로 쓰기 위해서다. 로그인 수단(비밀번호·소셜)은 없고
   이 브라우저 세션으로만 쓴다. 이메일 칸은 받을 수 없는 내부 주소로 채운다 — 손님이 적은 수신 이메일은
   주문의 PDF 전달 정보(report_delivery)에만 둔다(기존 회원 이메일과 겹쳐도 충돌하지 않게). */
const GUEST_EMAIL_DOMAIN = 'guest.sajusudal.local';
function createGuestUser() {
  const token = crypto.randomBytes(12).toString('hex');
  return createSocialUser({ email: 'guest_' + token + '@' + GUEST_EMAIL_DOMAIN, name: null, provider: 'guest', providerId: token, emailVerified: false });
}
function isGuest(row) {
  return !!row && row.provider === 'guest';
}

function adjustPointBalance(userId, delta) {
  stmts.adjustBalance.run(delta, userId);
}

function updatePasswordHash(userId, passwordHash) {
  stmts.updatePasswordHash.run(passwordHash, userId);
}

function markEmailVerified(userId) {
  stmts.markEmailVerified.run(userId);
}

/* ---------- 관리자 회원관리 ---------- */
function toAdminUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    provider: row.provider,
    status: row.status,
    emailVerified: !!row.email_verified,
    createdAt: row.created_at
  };
}

function countAll({ search } = {}) {
  const like = `%${search || ''}%`;
  const row = search
    ? db.prepare('SELECT COUNT(*) AS c FROM users WHERE email LIKE ? OR name LIKE ?').get(like, like)
    : db.prepare('SELECT COUNT(*) AS c FROM users').get();
  return row.c;
}

function listAll({ search, limit = 50, offset = 0 } = {}) {
  const like = `%${search || ''}%`;
  const rows = search
    ? db.prepare('SELECT * FROM users WHERE email LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?').all(like, like, limit, offset)
    : db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
  return rows.map(toAdminUser);
}

function setStatus(id, status) {
  if (status !== 'active' && status !== 'suspended') throw new Error('알 수 없는 상태입니다: ' + status);
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);
  return toAdminUser(stmts.findById.get(id));
}

function adminStats() {
  // 비회원 결제용 내부 계정(provider='guest')은 가입이 아니므로 회원 수에서 뺀다.
  const totalUsers = db.prepare("SELECT COUNT(*) AS c FROM users WHERE provider <> 'guest'").get().c;
  const todaySignups = db.prepare("SELECT COUNT(*) AS c FROM users WHERE provider <> 'guest' AND date(created_at) = date('now')").get().c;
  // 실제로 결제되고 취소되지 않은 카드 결제만 센다(테스트 결제 제외).
  // 탈퇴한 회원의 결제는 계정과 분리된 보존 기록(retained_transactions)에 남아 있으므로 함께 센다.
  const totalRevenue = db.prepare(`
    SELECT (SELECT COALESCE(SUM(amount_krw), 0) FROM card_payments WHERE status = 'paid' AND test_mode = 0)
         + (SELECT COALESCE(SUM(amount_krw), 0) FROM retained_transactions WHERE payment_status = 'paid') AS s
  `).get().s;
  return { totalUsers, todaySignups, totalRevenue };
}

function updateBirth(id, { gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, isLunar, isLeap, city, noLonCorrection }) {
  stmts.updateBirth.run({
    id, gender: gender || null,
    birthYear: birthYear || null, birthMonth: birthMonth || null, birthDay: birthDay || null,
    birthHour: birthHour != null ? birthHour : null, birthMinute: birthMinute != null ? birthMinute : 0,
    isLunar: isLunar ? 1 : 0, isLeap: isLeap ? 1 : 0, city: city || null,
    noLonCorrection: noLonCorrection ? 1 : 0
  });
  return stmts.findById.get(id);
}

module.exports = {
  createUser, findByEmail, findById, adjustPointBalance, updateBirth, toPublicUser,
  findByProvider, createSocialUser, updatePasswordHash, markEmailVerified,
  listAll, countAll, setStatus, adminStats, toAdminUser, createGuestUser, isGuest, GUEST_EMAIL_DOMAIN
};
