'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const session = require('express-session');
process.env.RESEND_API_KEY = 'test-resend-key';

const fx = require('./helpers/account-fixtures');
const tmpDir = fx.makeTempEnv('saju-rate-limit-');
const m = fx.load();
const users = m.users;
const user = users.createUser({ email: 'rate-limit@example.com', passwordHash: 'unused' });
const originalFetch = global.fetch;
global.fetch = async (url, init) => String(url).startsWith('https://api.resend.com')
  ? new Response('{"id":"mail_test"}', { status: 200 })
  : originalFetch(url, init);
let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'rate-test-secret', resave: false, saveUninitialized: false }));
  app.post('/test-login/:id', (req, res) => { req.session.userId = Number(req.params.id); res.json({ ok: true }); });
  app.use('/api', require('../src/server/routes/pay'));
  const authRouter = require('../src/server/routes/auth');
  app.use('/api', authRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const response = await fetch(baseUrl + url, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: response.status, retryAfter: response.headers.get('retry-after'), body: await response.json().catch(() => ({})) };
  };
}

test('payment preparation is bounded by both user and IP', async () => {
  const call = client();
  const login = await call('POST', `/test-login/${user.id}`);
  assert.equal(login.status, 200, JSON.stringify(login));
  const prepare = () => call('POST', '/api/pay/prepare', { product: 'compat', form: {} });
  for (let i = 0; i < 10; i++) {
    const response = await prepare();
    assert.equal(response.status, 200, JSON.stringify(response));
  }
  const limitedUser = await prepare();
  assert.equal(limitedUser.status, 429);
  assert.ok(Number(limitedUser.retryAfter) > 0);

  let limitedIp;
  for (let i = 0; i < 3 && !limitedIp; i++) {
    const differentUser = users.createUser({ email: `rate-limit-other-${i}@example.com`, passwordHash: 'unused' });
    const otherSession = client();
    await otherSession('POST', `/test-login/${differentUser.id}`);
    for (let n = 0; n < 10; n++) {
      const response = await otherSession('POST', '/api/pay/prepare', { product: 'compat', form: {} });
      if (response.status === 429) { limitedIp = response; break; }
    }
  }
  assert.equal(limitedIp.status, 429);
  assert.ok(Number(limitedIp.retryAfter) > 0);
});

test('verification resend is bounded by both user and IP', async () => {
  const call = client();
  const login = await call('POST', `/test-login/${user.id}`);
  assert.equal(login.status, 200, JSON.stringify(login));
  const resend = () => call('POST', '/api/auth/resend-verification', {});
  for (let i = 0; i < 5; i++) assert.equal((await resend()).status, 200);
  const limitedUser = await resend();
  assert.equal(limitedUser.status, 429);
  assert.ok(Number(limitedUser.retryAfter) > 0);

  let limitedIp;
  for (let i = 0; i < 6 && !limitedIp; i++) {
    const differentUser = users.createUser({ email: `rate-limit-resend-${i}@example.com`, passwordHash: 'unused' });
    const otherSession = client();
    await otherSession('POST', `/test-login/${differentUser.id}`);
    for (let n = 0; n < 5; n++) {
      const response = await otherSession('POST', '/api/auth/resend-verification', {});
      if (response.status === 429) { limitedIp = response; break; }
    }
  }
  assert.equal(limitedIp.status, 429);
  assert.ok(Number(limitedIp.retryAfter) > 0);
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  global.fetch = originalFetch;
  m.db.close();
  require('node:fs').rmSync(tmpDir, { recursive: true, force: true });
});
