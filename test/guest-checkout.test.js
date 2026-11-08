'use strict';
/* 비회원 결제 — 구매 창 한 번(이메일·필수 동의)으로 로그인 없이 주문을 만들고, 카드 앱을 다녀오며 세션을 잃어도
   토스가 결제자에게만 주는 paymentKey로 승인된 주문만 이 브라우저에 다시 연결되는지 실제 HTTP로 확인한다.
   임시 DB를 쓰고, 토스 API는 fetch를 바꿔 끼워 부르지 않는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-guest-checkout-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.TOSS_SECRET_KEY = 'test_sk_dummy';

const express = require('express');
const session = require('express-session');
const db = require('../src/db/index');
const users = require('../src/db/users');
const consents = require('../src/db/consents');
const cardPayments = require('../src/db/cardPayments');
const nativeFetch = global.fetch;

let baseUrl;
let server;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'guest-test', resave: false, saveUninitialized: false }));
  app.post('/test-login/:id', (req, res) => { req.session.userId = Number(req.params.id); res.json({ ok: true }); });
  app.use('/api', require('../src/server/routes/auth'));
  app.use('/api', require('../src/server/routes/pay'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function client(initialCookie = '') {
  let cookie = initialCookie;
  const call = async (method, url, body) => {
    const res = await nativeFetch(baseUrl + url, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => null), setCookie: !!set };
  };
  call.cookie = () => cookie;
  return call;
}

const form = { situation: 'single', readingFocus: 'timing', deliveryEmail: 'buyer@example.test', deliveryConsent: true, name: '수달', gender: '여', year: '1995', month: '5', day: '15', calendar: '양력', hour: '', minute: '', hourUnknown: true };
const AGREE = { agreeTerms: true, agreePrivacy: true, agreeAge: true, agreeOrder: true };
const countUsers = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

test('필수 동의가 하나라도 빠지거나 이메일이 틀리면 주문도 계정도 만들지 않는다', async () => {
  const call = client();
  const before = countUsers();
  for (const missing of Object.keys(AGREE)) {
    const res = await call('POST', '/api/pay/start', { product: 'love', form, ...AGREE, [missing]: false });
    assert.equal(res.status, 400, missing);
    assert.equal(res.data.code, 'consent_required');
  }
  const badEmail = await call('POST', '/api/pay/start', { product: 'love', form: { ...form, deliveryEmail: 'not-an-email' }, ...AGREE });
  assert.equal(badEmail.status, 400);
  const noDeliveryConsent = await call('POST', '/api/pay/start', { product: 'love', form: { ...form, deliveryConsent: false }, ...AGREE });
  assert.equal(noDeliveryConsent.status, 400);
  const other = await call('POST', '/api/pay/start', { product: 'full', form, ...AGREE });
  assert.equal(other.status, 400, '비회원 결제는 이메일로 결과를 보내는 상품에만 연다');
  assert.equal(countUsers(), before);
});

test('로그인하지 않은 손님은 구매 창 한 번으로 주문이 만들어지고 결제 페이지에서 동의를 다시 묻지 않는다', async () => {
  const call = client();
  const res = await call('POST', '/api/pay/start', { product: 'love', form, ...AGREE, attribution: { first: { utm_source: 'meta' } } });
  assert.equal(res.status, 200);
  assert.equal(res.data.guest, true);
  assert.equal(res.data.amountKrw, 14900);
  assert.ok(res.setCookie, '이 브라우저 세션을 비회원 주문에 연결한다');

  const row = cardPayments.findByOrderId(res.data.orderId);
  const owner = users.findById(row.user_id);
  assert.equal(owner.provider, 'guest');
  assert.match(owner.email, /@guest\.sajusudal\.local$/, '손님이 적은 주소를 계정 이메일로 쓰지 않는다');
  assert.equal(consents.hasSignupConsent(owner.id), true);
  assert.equal(consents.hasOrderConsent(owner.id, row.order_id), true);

  const mine = await call('GET', '/api/pay/mine');
  assert.equal(mine.status, 200);
  const order = mine.data.payments.find((p) => p.orderId === res.data.orderId);
  assert.equal(order.orderAgreed, true);
  assert.equal(order.customerEmail, 'buyer@example.test');
  assert.equal((await call('GET', '/api/pay/config')).status, 200);
  const me = await call('GET', '/api/auth/me');
  assert.equal(me.data.user.isGuest, true);
  assert.equal(me.data.needsConsent, false);

  // 같은 브라우저에서 한 번 더 사면 새 계정을 만들지 않는다.
  const before = countUsers();
  const again = await call('POST', '/api/pay/start', { product: 'love', form, ...AGREE });
  assert.equal(again.status, 200);
  assert.equal(countUsers(), before);
  assert.equal(cardPayments.findByOrderId(again.data.orderId).user_id, owner.id);
  assert.equal(users.adminStats().totalUsers, db.prepare("SELECT COUNT(*) AS n FROM users WHERE provider <> 'guest'").get().n);
});

test('로그인한 회원은 자기 계정으로 주문하고 비회원 계정을 만들지 않는다', async () => {
  const member = users.createUser({ email: 'member-guest-test@example.com', passwordHash: 'x' });
  const call = client();
  await call('POST', '/test-login/' + member.id);
  const before = countUsers();
  const res = await call('POST', '/api/pay/start', { product: 'love', form, ...AGREE });
  assert.equal(res.status, 200);
  assert.equal(res.data.guest, false);
  assert.equal(countUsers(), before);
  assert.equal(cardPayments.findByOrderId(res.data.orderId).user_id, member.id);
});

function guestPaidOrder(paymentKey) {
  const guest = users.createGuestUser();
  const row = cardPayments.create({ userId: guest.id, amountKrw: 14900, orderName: '연애 시기 리포트', testMode: true, productKey: 'love_timing', form, attribution: null });
  cardPayments.markPaidAndCredit(row, { paymentKey, method: '카드', approvedAt: '2026-11-09T10:00:00+09:00' });
  return { guest, row: cardPayments.findByOrderId(row.order_id) };
}

test('카드 앱을 다녀와 세션이 없어도, 결제 키가 맞는 비회원 주문만 이 브라우저에 다시 연결된다', async () => {
  const { guest, row } = guestPaidOrder('pk-guest-return');

  const wrongKey = await client()('POST', '/api/pay/confirm', { paymentKey: 'pk-someone-else', orderId: row.order_id, amount: row.amount_krw });
  assert.equal(wrongKey.status, 401);
  assert.equal(wrongKey.setCookie, false);

  const fresh = client();
  const ok = await fresh('POST', '/api/pay/confirm', { paymentKey: 'pk-guest-return', orderId: row.order_id, amount: row.amount_krw });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.alreadyConfirmed, true);
  assert.ok(ok.setCookie);
  const mine = await fresh('GET', '/api/pay/mine');
  assert.equal(mine.status, 200);
  assert.ok(mine.data.payments.some((p) => p.orderId === row.order_id));
  const me = await fresh('GET', '/api/auth/me');
  assert.equal(me.data.user.id, guest.id);
});

test('회원 주문은 결제 키만으로 다른 브라우저에 연결되지 않는다', async () => {
  const member = users.createUser({ email: 'member-no-adopt@example.com', passwordHash: 'x' });
  const row = cardPayments.create({ userId: member.id, amountKrw: 14900, orderName: '연애 시기 리포트', testMode: true, productKey: 'love_timing', form, attribution: null });
  cardPayments.markPaidAndCredit(row, { paymentKey: 'pk-member', method: '카드' });
  const res = await client()('POST', '/api/pay/confirm', { paymentKey: 'pk-member', orderId: row.order_id, amount: row.amount_krw });
  assert.equal(res.status, 401);
});

test('세션 없이 돌아온 비회원 결제가 토스 승인에 실패하면 브라우저를 연결하지 않는다', async () => {
  const call = client();
  const start = await call('POST', '/api/pay/start', { product: 'love', form, ...AGREE });
  const row = cardPayments.findByOrderId(start.data.orderId);
  const oldFetch = global.fetch;
  let confirms = 0;
  global.fetch = async (url, init) => {
    if (String(url).endsWith('/confirm')) { confirms++; return { ok: false, status: 400, json: async () => ({ code: 'REJECT_CARD_COMPANY', message: '카드사에서 거절했어요.' }) }; }
    return oldFetch(url, init);
  };
  let res;
  const other = client();
  try { res = await other('POST', '/api/pay/confirm', { paymentKey: 'pk-rejected', orderId: row.order_id, amount: row.amount_krw }); }
  finally { global.fetch = oldFetch; }
  assert.equal(confirms, 1);
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'REJECT_CARD_COMPANY');
  assert.equal(res.setCookie, false);
  assert.equal((await other('GET', '/api/pay/mine')).status, 401);
  assert.equal(cardPayments.findByOrderId(row.order_id).status, 'ready');
});

