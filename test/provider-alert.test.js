'use strict';
const test = require('node:test');
const assert = require('node:assert');

// resend를 가짜로 바꿔서 실제 메일이 나가지 않게 한다.
const resendPath = require.resolve('../src/email/resend');
const sent = [];
require.cache[resendPath] = {
  id: resendPath, filename: resendPath, loaded: true,
  exports: { sendEmail: async (m) => { sent.push(m); return { id: 'fake' }; } }
};
const { notifyProviderOutage, kindOf } = require('../src/email/providerAlert');

const creditErr = Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'), { status: 400 });
const authErr = Object.assign(new Error('authentication_error: invalid x-api-key'), { status: 401 });
const transient = Object.assign(new Error('overloaded'), { status: 529 });

test('오류 종류를 분류한다', () => {
  assert.strictEqual(kindOf(creditErr), 'credit');
  assert.strictEqual(kindOf(authErr), 'auth');
  assert.strictEqual(kindOf(transient), null);
  assert.strictEqual(kindOf(null), null);
});

test('크레딧 오류는 메일을 보내고, 일시 오류는 보내지 않는다', async () => {
  sent.length = 0;
  notifyProviderOutage(transient);
  notifyProviderOutage(creditErr);
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].subject, /크레딧 소진/);
  assert.match(sent[0].html, /Plans &amp; Billing|Plans & Billing/);
  assert.match(sent[0].html, /자동 환불/);
});

test('같은 종류는 쿨다운 안에 다시 보내지 않고, 다른 종류는 보낸다', async () => {
  sent.length = 0;
  notifyProviderOutage(creditErr); // 직전 테스트에서 이미 보냈으므로 쿨다운
  notifyProviderOutage(authErr);   // 다른 종류 → 발송
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].subject, /인증 실패/);
});

test('메일 발송이 실패해도 던지지 않는다', async () => {
  require.cache[resendPath].exports.sendEmail = async () => { throw new Error('resend down'); };
  delete require.cache[require.resolve('../src/email/providerAlert')];
  const fresh = require('../src/email/providerAlert');
  assert.doesNotThrow(() => fresh.notifyProviderOutage(creditErr));
  await new Promise((r) => setTimeout(r, 10));
});
