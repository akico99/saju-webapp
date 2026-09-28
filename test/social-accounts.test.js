'use strict';
/* 간편 로그인 계정 연결 — 제공사가 확인한 이메일일 때만 기존 회원과 합치는지 임시 DB로 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-social-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');

const bcrypt = require('bcryptjs');
const db = require('../src/db/index');
const users = require('../src/db/users');
const { resolveSocialUser, placeholderEmail } = require('../src/server/socialAccounts');

test.after(() => { db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

let seq = 0;
function emailUser({ verified }) {
  seq += 1;
  const email = `owner${seq}@example.com`;
  const row = users.createUser({ email, passwordHash: bcrypt.hashSync('secret-pass', 4) });
  if (verified) users.markEmailVerified(row.id);
  return users.findById(row.id);
}

test('an unverified provider email never logs into the existing account with that email', () => {
  const victim = emailUser({ verified: true });
  const user = resolveSocialUser({ provider: 'kakao', providerId: 'k-attacker', email: victim.email, emailVerified: false, name: 'x' });

  assert.notEqual(user.id, victim.id);
  assert.equal(user.email, placeholderEmail('kakao', 'k-attacker'));
  assert.equal(user.email_verified, 0);
});

test('a verified provider email logs into the existing account with that email', () => {
  const owner = emailUser({ verified: true });
  const user = resolveSocialUser({ provider: 'google', providerId: 'g-owner', email: owner.email, emailVerified: true, name: 'o' });

  assert.equal(user.id, owner.id);
  assert.equal(bcrypt.compareSync('secret-pass', user.password_hash), true, 'a verified owner keeps their password');
});

test('joining an account that was never email-verified disables its password', () => {
  const squatter = emailUser({ verified: false });
  const user = resolveSocialUser({ provider: 'google', providerId: 'g-real', email: squatter.email, emailVerified: true, name: 'r' });

  assert.equal(user.id, squatter.id);
  assert.equal(user.email_verified, 1);
  assert.equal(bcrypt.compareSync('secret-pass', user.password_hash), false, 'the pre-registered password no longer works');
});

test('a new verified provider email becomes a verified account; a missing email does not', () => {
  const verified = resolveSocialUser({ provider: 'naver', providerId: 'n-1', email: 'new-naver@example.com', emailVerified: true, name: 'n' });
  assert.equal(verified.email, 'new-naver@example.com');
  assert.equal(verified.email_verified, 1);

  const noEmail = resolveSocialUser({ provider: 'kakao', providerId: 'k-1', email: undefined, emailVerified: false, name: 'k' });
  assert.equal(noEmail.email, placeholderEmail('kakao', 'k-1'));
  assert.equal(noEmail.email_verified, 0);
});

test('the same provider account always returns the same member', () => {
  const first = resolveSocialUser({ provider: 'kakao', providerId: 'k-same', email: undefined, emailVerified: false, name: 'k' });
  const again = resolveSocialUser({ provider: 'kakao', providerId: 'k-same', email: 'later@example.com', emailVerified: true, name: 'k' });
  assert.equal(again.id, first.id);
});

