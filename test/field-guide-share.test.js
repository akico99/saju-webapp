'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSharePayload } = require('../public/field-guide-share');

test('share payload always points to the clean guide input page', () => {
  const payload = makeSharePayload('https://sajuotter.com/field-guide.html?year=1996&month=5&name=지은#result');

  assert.deepEqual(payload, {
    title: '사주 도감 | 사주보는 수달',
    text: '나만의 사주 도감을 무료로 만들어 봐.',
    url: 'https://sajuotter.com/field-guide.html',
  });
  assert.doesNotMatch(JSON.stringify(payload), /1996|지은|month|year/);
});
