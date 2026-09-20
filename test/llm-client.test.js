'use strict';
/* client.js의 재시도 대기 계산과 분당 한도 관측 — 네트워크를 타지 않는 단위 테스트.
   18챕터를 병렬로 돌리면 429가 정상적으로 발생하고, 그때 주문이 실패로 끝나지 않으려면
   서버가 준 retry-after를 지키고 병렬 호출들이 동시에 몰리지 않아야 한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { retryDelayMs, getLastRateLimit } = require('../src/llm/client');

test('retry-after(초)를 그대로 따른다', () => {
  assert.equal(retryDelayMs({ headers: { 'retry-after': '3' } }, 0), 3000);
});

test('retry-after-ms가 있으면 초 단위 헤더보다 우선한다', () => {
  assert.equal(retryDelayMs({ headers: { 'retry-after-ms': '1500', 'retry-after': '9' } }, 0), 1500);
});

test('Headers 객체로 와도 읽는다', () => {
  const headers = new Headers({ 'retry-after': '2' });
  assert.equal(retryDelayMs({ headers }, 0), 2000);
});

test('error.response.headers 위치도 읽는다', () => {
  assert.equal(retryDelayMs({ response: { headers: { 'retry-after': '4' } } }, 0), 4000);
});

test('대기 시간은 상한을 넘지 않는다', () => {
  assert.equal(retryDelayMs({ headers: { 'retry-after': '99999' } }, 0), 30000);
});

test('헤더가 없으면 지수 백오프에 지터를 섞는다', () => {
  const first = [];
  for (let i = 0; i < 40; i++) first.push(retryDelayMs(new Error('boom'), 0));
  assert.ok(first.every((v) => v >= 750 && v <= 1250), '1차 시도는 1초 언저리여야 한다');
  assert.ok(new Set(first).size > 1, '지터가 없으면 병렬 호출이 같은 순간에 다시 몰린다');

  const third = retryDelayMs(new Error('boom'), 2);
  assert.ok(third >= 3000 && third <= 5000, '시도가 늘면 대기도 늘어야 한다');
});

test('한도를 한 번도 관측하지 않았으면 null이다', () => {
  assert.equal(getLastRateLimit(), null);
});
