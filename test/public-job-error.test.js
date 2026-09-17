'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicJobError } = require('../src/server/publicJobError');
const { isPermanentProviderError } = require('../src/llm/client');

test('external provider credit errors become customer-safe copy', () => {
  const raw = '400 {"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to purchase credits."},"request_id":"req_secret"}';
  const message = publicJobError(raw, 'quick');
  assert.match(message, /일시적으로 중단/);
  assert.match(message, /자동 환불/);
  assert.doesNotMatch(message, /Anthropic|credit|Billing|req_secret|400/);
});

test('unexpected failures never expose internal messages', () => {
  const message = publicJobError('ENOENT /internal/output/path api-key=secret', 'full');
  assert.match(message, /문제가 발생/);
  assert.doesNotMatch(message, /ENOENT|internal|secret/);
  assert.equal(publicJobError(null, 'quick'), null);
});

test('billing and authentication errors do not retry; rate limits may retry', () => {
  assert.equal(isPermanentProviderError({ status: 400, message: 'credit balance is too low' }), true);
  assert.equal(isPermanentProviderError({ status: 401, message: 'invalid api key' }), true);
  assert.equal(isPermanentProviderError({ status: 429, message: 'rate limit' }), false);
  assert.equal(isPermanentProviderError({ status: 500, message: 'server error' }), false);
});
