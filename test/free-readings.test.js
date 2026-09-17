'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFree, KINDS } = require('../src/engine/freeReadings');

const b = { year: 1985, month: 11, day: 3, hour: 22, minute: 0, gender: '남', isLunar: false };
const bNoHour = { ...b, hour: null };

test('세 종류 모두 결과 구조를 갖춘다', () => {
  assert.deepEqual(KINDS, ['noble', 'balance', 'charm']);
  for (const kind of KINDS) {
    const r = readFree(kind, b);
    assert.equal(r.kind, kind);
    assert.ok(r.headline && r.lead, kind + ': headline/lead');
    assert.ok(r.upsell && r.upsell.href.startsWith('/quick.html?topic='), kind + ': upsell');
  }
});

test('귀인·매력은 원국에 실제로 있는 신살만 쓴다', () => {
  const n = readFree('noble', b);
  assert.ok(n.found.every((f) => ['천을귀인', '문창귀인', '암록', '장성살', '반안살'].includes(f.name)));
  assert.ok(n.found.every((f) => ['year', 'month', 'day', 'hour'].includes(f.pillar)));
  const c = readFree('charm', b);
  assert.ok(c.base.text.length > 10);
  assert.ok(c.found.every((f) => f.core && f.shadow));
});

test('시각을 모르면 정오로 가정한 시주를 근거로 쓰지 않는다', () => {
  const n = readFree('noble', bNoHour);
  assert.ok(n.found.every((f) => f.pillar !== 'hour'));
  assert.equal(n.hourUnknown, true);
  assert.match(n.note, /시각/);
  const c = readFree('charm', bNoHour);
  assert.ok(c.found.every((f) => f.pillar !== 'hour'));
});

test('오행 밸런스는 다섯 막대 합이 글자 수와 같고 조사가 자연스럽다', () => {
  const r = readFree('balance', b);
  assert.equal(r.bars.length, 5);
  const total = r.bars.reduce((a, x) => a + x.count, 0);
  assert.ok(total >= 6 && total <= 8, '여덟 글자(시각 있음) 범위');
  assert.doesNotMatch(r.headline, /[가-힣]이 세고, [가-힣·]+이 비어/); // "목·수이" 같은 조사 오류
  assert.ok(r.strongest.light && r.strongest.shadow);
});

test('모르는 종류는 거부한다', () => {
  assert.throws(() => readFree('nope', b), /알 수 없는/);
});
