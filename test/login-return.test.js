'use strict';
/* 로그인 뒤 돌아갈 주소 — 사이트 안 경로만 통과시키고, 밖으로 보내는 주소는 막는지 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeNext } = require('../src/server/loginReturn');

test('상품 페이지 경로와 쿼리는 그대로 돌려준다', () => {
  assert.equal(safeNext('/quick.html?topic=love'), '/quick.html?topic=love');
  assert.equal(safeNext('/compat.html'), '/compat.html');
});

test('외부로 나가는 주소와 이상한 값은 막는다', () => {
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '/a\nb', '', null, undefined, 42, '/' + 'a'.repeat(600)]) {
    assert.equal(safeNext(bad), null, String(bad));
  }
});
