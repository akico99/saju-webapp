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
    pointBalance: row.point_balance,
    gender: row.gender,
    birth: row.birth_year ? {
      year: row.birth_year, month: row.birth_month, day: row.birth_day,
      hour: row.birth_hour, minute: row.birth_minute,
      isLunar: !!row.is_lunar, isLeap: !!row.is_leap, city: row.city
    } : null,
    createdAt: row.created_at
  };
}

const stmts = {
  insert: db.prepare(`
    INSERT INTO users (email, password_hash, name, gender, birth_year, birth_month, birth_day,
                        birth_hour, birth_minute, is_lunar, is_leap, city)
    VALUES (@email, @passwordHash, @name, @gender, @birthYear, @birthMonth, @birthDay,
            @birthHour, @birthMinute, @isLunar, @isLeap, @city)
  `),
  findByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  findById: db.prepare('SELECT * FROM users WHERE id = ?'),
  findByProvider: db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?'),
  insertSocial: db.prepare(`
    INSERT INTO users (email, password_hash, name, provider, provider_id)
    VALUES (@email, @passwordHash, @name, @provider, @providerId)
  `),
  adjustBalance: db.prepare('UPDATE users SET point_balance = point_balance + ? WHERE id = ?'),
  updateBirth: db.prepare(`
    UPDATE users SET gender=@gender, birth_year=@birthYear, birth_month=@birthMonth, birth_day=@birthDay,
      birth_hour=@birthHour, birth_minute=@birthMinute, is_lunar=@isLunar, is_leap=@isLeap, city=@city
    WHERE id=@id
  `)
};

function createUser({ email, passwordHash, name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, isLunar, isLeap, city }) {
  const info = stmts.insert.run({
    email, passwordHash, name: name || null, gender: gender || null,
    birthYear: birthYear || null, birthMonth: birthMonth || null, birthDay: birthDay || null,
    birthHour: birthHour != null ? birthHour : null, birthMinute: birthMinute != null ? birthMinute : 0,
    isLunar: isLunar ? 1 : 0, isLeap: isLeap ? 1 : 0, city: city || null
  });
  return stmts.findById.get(info.lastInsertRowid);
}

function findByEmail(email) {
  return stmts.findByEmail.get(email);
}

function findByProvider(provider, providerId) {
  return stmts.findByProvider.get(provider, String(providerId));
}

function createSocialUser({ email, name, provider, providerId }) {
  /* 소셜 계정은 비밀번호가 없다 — 아무도 모르는 무작위 값을 bcrypt 해시로 저장해
     password_hash NOT NULL 제약을 만족시키되, 이메일/비밀번호 로그인으로는 절대 맞을 수 없게 한다. */
  const passwordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
  const info = stmts.insertSocial.run({
    email, passwordHash, name: name || null, provider, providerId: String(providerId)
  });
  return stmts.findById.get(info.lastInsertRowid);
}

function findById(id) {
  return stmts.findById.get(id);
}

function adjustPointBalance(userId, delta) {
  stmts.adjustBalance.run(delta, userId);
}

/* ---------- 관리자 회원관리 ---------- */
function toAdminUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    pointBalance: row.point_balance,
    provider: row.provider,
    status: row.status,
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
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const todaySignups = db.prepare("SELECT COUNT(*) AS c FROM users WHERE date(created_at) = date('now')").get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(amount_krw), 0) AS s FROM point_requests WHERE status = 'approved'").get().s;
  return { totalUsers, todaySignups, totalRevenue };
}

function updateBirth(id, { gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, isLunar, isLeap, city }) {
  stmts.updateBirth.run({
    id, gender: gender || null,
    birthYear: birthYear || null, birthMonth: birthMonth || null, birthDay: birthDay || null,
    birthHour: birthHour != null ? birthHour : null, birthMinute: birthMinute != null ? birthMinute : 0,
    isLunar: isLunar ? 1 : 0, isLeap: isLeap ? 1 : 0, city: city || null
  });
  return stmts.findById.get(id);
}

module.exports = {
  createUser, findByEmail, findById, adjustPointBalance, updateBirth, toPublicUser,
  findByProvider, createSocialUser,
  listAll, countAll, setStatus, adminStats, toAdminUser
};
