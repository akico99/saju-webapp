'use strict';
const crypto = require('crypto');
const db = require('./index');

const TOKEN_TTL_MINUTES = 30;

const stmts = {
  invalidateActive: db.prepare(`
    UPDATE password_resets SET used_at = datetime('now')
    WHERE user_id = ? AND used_at IS NULL
  `),
  insert: db.prepare(`
    INSERT INTO password_resets (user_id, token, expires_at)
    VALUES (@userId, @token, datetime('now', @ttl))
  `),
  findValid: db.prepare(`
    SELECT * FROM password_resets
    WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')
  `),
  markUsed: db.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?")
};

/** 새 재설정 토큰을 만든다. 같은 사용자의 기존 미사용 토큰은 먼저 무효화한다
 * (이메일을 여러 번 요청해도 가장 최근 링크만 유효하게). */
function createToken(userId) {
  stmts.invalidateActive.run(userId);
  const token = crypto.randomBytes(32).toString('hex');
  stmts.insert.run({ userId, token, ttl: `+${TOKEN_TTL_MINUTES} minutes` });
  return token;
}

function findValidToken(token) {
  return stmts.findValid.get(token);
}

function markUsed(id) {
  stmts.markUsed.run(id);
}

module.exports = { createToken, findValidToken, markUsed, TOKEN_TTL_MINUTES };
