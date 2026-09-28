'use strict';
/* 테스트 결제 한도 — 최근 24시간 안에 승인된 결제만 센다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-testlimit-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');

const db = require('../src/db/index');
const users = require('../src/db/users');
const cardPayments = require('../src/db/cardPayments');

test.after(() => { db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

test('only test payments approved in the last 24 hours count toward the limit', () => {
  const userId = users.createUser({ email: 'limit@example.com', passwordHash: 'x' }).id;
  const pay = (approvedAt, testMode = true) => {
    const row = cardPayments.create({ userId, amountKrw: 3900, orderName: 't', testMode, productKey: 'deep_love', form: {} });
    cardPayments.markPaidAndCredit(row, { paymentKey: 'pk_' + row.id, approvedAt });
  };
  const kst = (msAgo) => new Date(Date.now() - msAgo + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00';

  pay(kst(2 * 24 * 3600e3));   // 이틀 전 — 세지 않는다
  pay(kst(25 * 3600e3));       // 25시간 전 — 세지 않는다
  pay(kst(3600e3));            // 1시간 전
  pay(kst(60e3));              // 1분 전
  pay(kst(60e3), false);       // 실제 결제 — 테스트 한도와 무관

  assert.equal(cardPayments.countPaidTest(userId), 2);
});

