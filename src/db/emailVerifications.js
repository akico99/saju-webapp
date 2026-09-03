'use strict';
const crypto = require('crypto');
const db = require('./index');

const TOKEN_TTL_HOURS = 24;

const stmts = {
  invalidateActive: db.prepare(`
    UPDATE email_verifications SET used_at = datetime('now')
    WHERE user_id = ? AND used_at IS NULL
  `),
  insert: db.prepare(`
    INSERT INTO email_verifications (user_id, token, expires_at)
    VALUES (@userId, @token, datetime('now', @ttl))
  `),
  findValid: db.prepare(`
    SELECT * FROM email_verifications
    WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')
  `),
  markUsed: db.prepare("UPDATE email_verifications SET used_at = datetime('now') WHERE id = ?")
};

function createToken(userId) {
  stmts.invalidateActive.run(userId);
  const token = crypto.randomBytes(32).toString('hex');
  stmts.insert.run({ userId, token, ttl: `+${TOKEN_TTL_HOURS} hours` });
  return token;
}

function findValidToken(token) {
  return stmts.findValid.get(token);
}

function markUsed(id) {
  stmts.markUsed.run(id);
}

module.exports = { createToken, findValidToken, markUsed, TOKEN_TTL_HOURS };
