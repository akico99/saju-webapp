'use strict';
/* 연애 무료 결과의 쉬운 말: 본문에 명리 용어가 없고, 원본 값은 응답에 그대로 남는다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLovePreview } = require('../src/engine/loveTiming');
const plain = require('../src/engine/lovePlain');
const { readCharm } = require('../src/engine/freeReadings');

const NOW = new Date('2026-11-14T03:00:00Z');
// 본문(사주 원본 보기 밖)에 나오면 안 되는 말
const JARGON = /일간|일주|월주|연주|시주|비견|겁재|식신|상관|정재|편재|정관|편관|정인|편인|장성|역마|도화|화개|반안|망신|육해|지살|천을귀인|지장간|12운성|십이운성|용신|대운|신살|오행|명식|[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/;
const sample = (i) => ({ year: 1970 + (i * 7) % 35, month: 1 + (i % 12), day: 1 + (i * 3) % 28, hour: i % 5 === 0 ? null : (i * 5) % 24, minute: 0, gender: i % 2 ? '남' : '여', isLunar: false });

test('쉬운 말 매핑은 신살 다섯 가지를 모두 용어 없이 풀어 쓴다', () => {
  for (const name of ['도화살', '장성살', '반안살', '화개살', '역마살']) {
    const c = plain.CHARM_PLAIN[name];
    assert.ok(c && c.title && c.shows && c.caution, name);
    assert.doesNotMatch(JSON.stringify(c), JARGON, name);
  }
  for (const o of ['木', '火', '土', '金', '水']) {
    assert.doesNotMatch(JSON.stringify([plain.HABIT_STRONG[o], plain.HABIT_LACK[o]]), JARGON, o);
  }
  for (const k of Object.keys(plain.MONTH_SCENE)) assert.doesNotMatch(JSON.stringify(plain.MONTH_SCENE[k]), JARGON, k);
});

test('무료 응답의 쉬운 말(plain·3위 달)은 어떤 사주에서도 용어와 "~기운이 들어와요"가 없다', () => {
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const b = sample(i);
    const p = buildLovePreview(b, ['single', 'some', 'dating', 'breakup'][i % 4], NOW);
    const body = JSON.stringify({ plain: p.plain, third: p.third, seasonLead: p.seasonLead });
    assert.doesNotMatch(body, JARGON, JSON.stringify(b));
    assert.doesNotMatch(p.third.text, /기운이 들어와요|별이/);
    assert.ok(p.plain.charm.headline && p.plain.habit.headline && p.plain.habit.lines.length >= 1);
    assert.ok(p.plain.charm.items.length <= 3);
    p.plain.charm.items.forEach((x) => seen.add(x.title));
    // 한 문장은 45자 안팎: 80자를 넘는 문장은 없다.
    for (const s of p.third.text.split(/(?<=[.!?])\s+/)) assert.ok(s.length <= 80, s);
  }
  assert.ok(seen.size >= 3, '여러 매력 항목이 실제로 나온다');
});

test('원본 필드(사주표·오행 글자 수·신살 원문)는 응답에 그대로 있고 쉬운 말은 따로 붙는다', () => {
  const p = buildLovePreview(sample(1), 'some', NOW);
  assert.ok(p.pillars.length >= 3 && p.balance.bars.length === 5 && p.charm.headline);
  assert.deepEqual(Object.keys(p.plain).sort(), ['charm', 'habit', 'situation']);
  assert.deepEqual(p.plain.situation, plain.SITUATION_PLAIN.some);
  assert.deepEqual(Object.keys(p.third).sort(), ['label', 'text']);
  // 신살이 실제로 있는 사주는 쉬운 제목이 원문 신살 수만큼(최대 3) 나온다
  for (let i = 0; i < 40; i++) {
    const b = sample(i);
    const q = buildLovePreview(b, 'single', NOW);
    assert.equal(q.plain.charm.items.length, Math.min(3, q.charm.found.length));
  }
});

test('상황별 잠금 카드 제목은 유료 장 제목과 같다', () => {
  const { SITUATIONS } = require('../src/engine/loveTiming');
  for (const key of Object.keys(SITUATIONS)) assert.equal(plain.situationPlain(key).title, SITUATIONS[key].actionTitle);
});

test('오행이 없는 쪽은 의식해서 챙길 점으로, 고른 사주는 치우치지 않는다고 말한다', () => {
  const lacking = plain.habitPlain({ strongestAll: [{ el: '火', count: 3 }], strongest: { el: '火', count: 3 }, lacking: [{ el: '土' }], bars: [{ count: 1 }, { count: 3 }, { count: 0 }, { count: 1 }, { count: 1 }] });
  assert.equal(lacking.headline, '마음이 빨리 뜨거워지는 편 대신, 오래 지키는 힘은 의식해서 챙겨야 해요');
  const even = plain.habitPlain({ strongestAll: [{ el: '木', count: 2 }], strongest: { el: '木', count: 2 }, lacking: [], bars: [{ count: 2 }, { count: 1 }, { count: 2 }, { count: 1 }, { count: 2 }] });
  assert.match(even.headline, /고른 편/);
});
