'use strict';
/* 계정 탈퇴 테스트 공용 도구 — 계정 한 개에 딸린 모든 종류의 데이터를 채우고, DB 전체를 비교용으로 덤프한다.
   호출하는 테스트 파일이 SAJU_DB_PATH와 OUTPUT_DIR을 먼저 정해야 한다(임시 폴더). */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');

function makeTempEnv(prefix) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');
  process.env.OUTPUT_DIR = path.join(tmpDir, 'output');
  fs.mkdirSync(process.env.OUTPUT_DIR, { recursive: true });
  return tmpDir;
}

function load() {
  const db = require('../../src/db/index');
  // 운영에서는 세션 저장소가 만드는 테이블 — 테스트에서는 같은 모양으로 직접 만든다.
  db.exec('CREATE TABLE IF NOT EXISTS sessions (sid TEXT NOT NULL PRIMARY KEY, sess JSON NOT NULL, expire TEXT NOT NULL)');
  return {
    db,
    users: require('../../src/db/users'),
    savedProfiles: require('../../src/db/savedProfiles'),
    consents: require('../../src/db/consents'),
    cardPayments: require('../../src/db/cardPayments'),
    orders: require('../../src/db/orders'),
    points: require('../../src/db/points'),
    emailVerifications: require('../../src/db/emailVerifications'),
    passwordResets: require('../../src/db/passwordResets'),
    OUTPUT_ROOT: require('../../src/config/outputDir').OUTPUT_ROOT
  };
}

let seq = 0;
const PAYMENT_KEY = 'tgen_PAYMENT_KEY_SECRET_';
const REPORT_TEXT = 'REPORT_BODY_SECRET_';
const FORM_NAME = 'FORM_NAME_SECRET_';

/** 계정과 그에 딸린 모든 종류의 데이터를 만든다. 기본 상태는 "결제 완료 + 리포트 완료"다. */
function seedAccount(m, opts = {}) {
  seq += 1;
  const tag = 'x' + seq + 'x';
  const email = opts.email || ('person' + tag + '@example.com');
  const provider = opts.provider || 'local';
  const password = opts.password || 'correct-horse-1';
  let user;
  if (provider === 'local') {
    user = m.users.createUser({
      email, passwordHash: bcrypt.hashSync(password, 4), name: 'NameSecret' + tag,
      gender: '여', birthYear: 1990, birthMonth: 1, birthDay: 15, birthHour: 7, birthMinute: 30, city: '서울'
    });
  } else {
    user = m.users.createSocialUser({
      email, name: 'SocialSecret' + tag, provider, providerId: 'pid-' + tag + '-secret', emailVerified: opts.emailVerified !== false
    });
  }
  m.savedProfiles.create(user.id, { label: '배우자', name: 'SpouseSecret' + tag, birthYear: 1991, birthMonth: 2, birthDay: 3 });
  m.consents.recordSignupConsents(user.id, null);
  m.emailVerifications.createToken(user.id);
  m.passwordResets.createToken(user.id);
  m.db.prepare("INSERT INTO point_requests (user_id, amount_krw, points, depositor_name, status) VALUES (?, 1000, 1000, ?, 'rejected')").run(user.id, 'DepositorSecret' + tag);
  m.db.prepare('INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)').run('sid-' + user.id, JSON.stringify({ cookie: {}, userId: user.id }), new Date(Date.now() + 86400000).toISOString());

  const out = { user, email, password, tag, jobIds: [] };
  if (opts.noPayment) return out;
  Object.assign(out, seedPurchase(m, user, { ...opts, tag }));
  return out;
}

/** 카드 결제 1건 + 그 결제로 시작된 주문과 생성 파일을 만든다. opts.orderStatus: 'done'(기본) | 'active' */
function seedPurchase(m, user, opts = {}) {
  seq += 1;
  const tag = (opts.tag || 'x' + seq + 'x') + (opts.suffix || '');
  const jobId = 'job-' + user.id + '-' + seq;
  const payment = m.cardPayments.create({
    userId: user.id, amountKrw: 14900, orderName: '평생사주 리포트', testMode: !!opts.testMode, productKey: 'full',
    form: { name: FORM_NAME + tag }, attribution: null
  });
  m.cardPayments.markPaidAndCredit(payment, { paymentKey: PAYMENT_KEY + tag, method: '카드', approvedAt: opts.approvedAt || '2026-03-04T05:06:07+09:00' });
  m.points.chargeForProductAndCreateOrder(user.id, 'full', { label: '평생사주', jobId, cardPaymentId: payment.id });
  m.cardPayments.setJob(payment, jobId);
  const jobDir = path.join(m.OUTPUT_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  const resultPath = path.join(jobDir, 'report.pdf');
  const cardPath = path.join(jobDir, 'summary-card.png');
  fs.writeFileSync(resultPath, 'pdf');
  fs.writeFileSync(cardPath, 'png');
  fs.writeFileSync(path.join(jobDir, 'chapters.json'), '{}');
  if (opts.orderStatus === 'active') {
    m.orders.updateStatus(jobId, 'generating');
  } else {
    m.orders.markDone(jobId, { resultPath, cardPath, resultText: REPORT_TEXT + tag, resultVisual: '<div>visual</div>' });
  }
  return {
    payment: m.cardPayments.findById(payment.id), paymentId: payment.id, jobId, jobIds: [jobId], jobDir, resultPath, cardPath,
    paymentKey: PAYMENT_KEY + tag, reportText: REPORT_TEXT + tag, formName: FORM_NAME + tag
  };
}

/** 결제 후 생성 실패로 카드 취소까지 끝난 결제(주문 없음). */
function seedCanceledPayment(m, user, tag) {
  seq += 1;
  const payment = m.cardPayments.create({
    userId: user.id, amountKrw: 4900, orderName: '궁합 리포트', testMode: false, productKey: 'compat', form: { name: 'CanceledForm' + tag }, attribution: null
  });
  m.cardPayments.markPaidAndCredit(payment, { paymentKey: PAYMENT_KEY + 'canceled_' + tag, method: '카드', approvedAt: '2026-05-06T07:08:09+09:00' });
  const claim = m.cardPayments.claimCancellationWithCreditReversal(payment, '생성 실패');
  m.cardPayments.finishRefund(claim, true, '생성 실패 환불');
  return m.cardPayments.findById(payment.id);
}

/** DB의 모든 표를 덤프한다 — 변경 전후 비교와 "어디에도 남지 않았다" 검사에 쓴다. */
function dumpDb(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const dump = {};
  for (const t of tables) dump[t.name] = db.prepare('SELECT * FROM "' + t.name + '" ORDER BY rowid').all();
  return dump;
}

/** user_id 열이 있는 모든 표에서 이 사용자의 행 수를 센다. */
function rowsForUser(db, userId) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  const found = {};
  for (const name of tables) {
    const cols = db.prepare('PRAGMA table_info("' + name + '")').all().map((c) => c.name);
    if (cols.includes('user_id')) {
      const n = db.prepare('SELECT COUNT(*) AS n FROM "' + name + '" WHERE user_id = ?').get(userId).n;
      if (n) found[name] = n;
    }
  }
  return found;
}

function client(baseUrl) {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(baseUrl + url, {
      method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch (e) { /* 본문 없음 */ }
    return { status: res.status, data };
  };
}

module.exports = {
  makeTempEnv, load, seedAccount, seedPurchase, seedCanceledPayment, dumpDb, rowsForUser, client,
  PAYMENT_KEY, REPORT_TEXT, FORM_NAME
};
