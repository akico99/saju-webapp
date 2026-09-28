'use strict';
/* 약관 동의 — 가입·주문 동의 없이는 가입도 결제 승인도 되지 않는지 실제 HTTP 요청으로 확인한다.
   임시 DB를 쓰고, 토스 API는 부르지 않는다(동의 확인이 승인 요청보다 먼저다). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-consent-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');

const express = require('express');
const session = require('express-session');
const db = require('../src/db/index');
const users = require('../src/db/users');
const consents = require('../src/db/consents');
const cardPayments = require('../src/db/cardPayments');

let baseUrl;
let server;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api', require('../src/server/routes/auth'));
  app.use('/api', require('../src/server/routes/pay'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 쿠키를 들고 다니는 아주 작은 클라이언트 */
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(baseUrl + url, {
      method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
}

let seq = 0;
const signupBody = (extra) => {
  seq += 1;
  return { email: `consent${seq}@example.com`, password: 'password123', year: 1990, month: 1, day: 15, gender: '여', ...extra };
};
const ALL_AGREED = { agreeTerms: true, agreePrivacy: true, agreeAge: true };

test('signup is refused unless all three required consents are checked', async () => {
  const call = client();
  const none = await call('POST', '/api/auth/signup', signupBody());
  assert.equal(none.status, 400);
  assert.equal(none.data.code, 'consent_required');

  const partial = await call('POST', '/api/auth/signup', signupBody({ agreeTerms: true, agreePrivacy: true }));
  assert.equal(partial.status, 400);
});

test('signup with all consents records them and needs no further consent', async () => {
  const call = client();
  const res = await call('POST', '/api/auth/signup', signupBody(ALL_AGREED));
  assert.equal(res.status, 200);
  assert.equal(res.data.needsConsent, false);
  assert.equal(consents.hasSignupConsent(res.data.user.id), true);
});

test('an account without consent agrees to everything on the payment page in one step', async () => {
  const call = client();
  seq += 1;
  const email = `legacy${seq}@example.com`;
  const bcrypt = require('bcryptjs');
  const user = users.createUser({ email, passwordHash: await bcrypt.hash('password123', 4) });

  const login = await call('POST', '/api/auth/login', { email, password: 'password123' });
  assert.equal(login.data.needsConsent, true);

  // 주문은 동의 전에도 만들 수 있다 — 동의는 결제 화면에서 받는다.
  const order = await call('POST', '/api/pay/prepare', { product: 'compat', form: {} });
  assert.equal(order.status, 200);

  // 주문 동의만으로는 부족하다(가입 동의가 없는 회원).
  const orderOnly = await call('POST', '/api/pay/agree', { orderId: order.data.orderId, agreeOrder: true });
  assert.equal(orderOnly.status, 400);
  assert.equal(consents.hasOrderConsent(user.id, order.data.orderId), false);

  const all = await call('POST', '/api/pay/agree', { orderId: order.data.orderId, agreeOrder: true, ...ALL_AGREED });
  assert.equal(all.status, 200);
  assert.equal(consents.hasSignupConsent(user.id), true);
  assert.equal(consents.hasOrderConsent(user.id, order.data.orderId), true);
  assert.equal((await call('GET', '/api/auth/me')).data.needsConsent, false);
});

test('the consent page still records signup consent for social first logins', async () => {
  const call = client();
  seq += 1;
  const email = `social${seq}@example.com`;
  const bcrypt = require('bcryptjs');
  users.createUser({ email, passwordHash: await bcrypt.hash('password123', 4) });
  await call('POST', '/api/auth/login', { email, password: 'password123' });

  assert.equal((await call('POST', '/api/auth/consent', { agreeTerms: true })).status, 400);
  assert.equal((await call('POST', '/api/auth/consent', ALL_AGREED)).status, 200);
  assert.equal((await call('GET', '/api/auth/me')).data.needsConsent, false);
});

test('a payment without the order consent is not confirmed', async () => {
  const call = client();
  await call('POST', '/api/auth/signup', signupBody(ALL_AGREED));
  const order = await call('POST', '/api/pay/prepare', { product: 'compat', form: {} });

  const refused = await call('POST', '/api/pay/confirm', { paymentKey: 'pk_test', orderId: order.data.orderId, amount: order.data.amountKrw });
  assert.equal(refused.status, 400);
  assert.equal(refused.data.code, 'consent_required');
  assert.equal(cardPayments.findByOrderId(order.data.orderId).status, 'failed');
});

test('the order consent must be an explicit check on the user\'s own ready order', async () => {
  const call = client();
  const me = await call('POST', '/api/auth/signup', signupBody(ALL_AGREED));
  const order = await call('POST', '/api/pay/prepare', { product: 'compat', form: {} });

  const unchecked = await call('POST', '/api/pay/agree', { orderId: order.data.orderId });
  assert.equal(unchecked.status, 400);

  const other = client();
  await other('POST', '/api/auth/signup', signupBody(ALL_AGREED));
  const stranger = await other('POST', '/api/pay/agree', { orderId: order.data.orderId, agreeOrder: true });
  assert.equal(stranger.status, 404);

  const ok = await call('POST', '/api/pay/agree', { orderId: order.data.orderId, agreeOrder: true });
  assert.equal(ok.status, 200);
  assert.equal(consents.hasOrderConsent(me.data.user.id, order.data.orderId), true);
});

