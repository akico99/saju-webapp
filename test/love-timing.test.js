'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../src/engine/index');
const { buildLoveTiming, buildLovePreview, SITUATIONS } = require('../src/engine/loveTiming');

const birth = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여', isLunar: false };
const OCT = new Date('2026-10-10T03:00:00Z'); // KST 2026-10-10 12:00 — 15일 이전이면 이번 달부터
const LATE_OCT = new Date('2026-10-22T03:00:00Z'); // 16일 이후면 다음 달부터
const NOV = new Date('2026-11-05T03:00:00Z');

test('12개월은 이번 달(KST)부터 시작하고 3개월씩 네 칸으로 묶인다', () => {
  const t = buildLoveTiming(computeSaju(birth), '여', OCT);
  assert.equal(t.months.length, 12);
  assert.deepEqual([t.months[0].year, t.months[0].month], [2026, 10]);
  assert.deepEqual(t.seasons.map((s) => s.label), ['2026년 10~12월', '2027년 1~3월', '2027년 4~6월', '2027년 7~9월']);
  t.seasons.forEach((s, i) => {
    const part = t.months.slice(i * 3, i * 3 + 3);
    assert.equal(s.avg, Math.round(part.reduce((a, m) => a + m.score, 0) / 3));
    assert.ok(['강함', '보통', '잔잔함'].includes(s.level));
  });
});

test('해를 넘기는 칸은 양쪽 연도를 모두 적는다', () => {
  const t = buildLoveTiming(computeSaju(birth), '여', NOV);
  assert.equal(t.seasons[0].label, '2026년 11월~2027년 1월');
});

test('16일 이후에는 남은 날이 적은 이번 달을 빼고 다음 달부터 센다', () => {
  const t = buildLoveTiming(computeSaju(birth), '여', LATE_OCT);
  assert.deepEqual([t.months[0].year, t.months[0].month], [2026, 11]);
  assert.deepEqual([t.months[11].year, t.months[11].month], [2027, 10]);
});

test('상위 세 달은 점수 높은 순, 같으면 이른 달이 먼저다', () => {
  const t = buildLoveTiming(computeSaju(birth), '여', OCT);
  assert.equal(t.top3.length, 3);
  for (let i = 0; i < 2; i++) {
    const a = t.top3[i], b = t.top3[i + 1];
    assert.ok(a.score > b.score || (a.score === b.score && a.index < b.index));
  }
  const best = Math.max(...t.months.map((m) => m.score));
  assert.equal(t.top3[0].score, best);
  assert.equal(t.strongCount, t.months.filter((m) => m.score >= 65).length);
});

test('무료 첫 장에는 달별 점수와 달 이름이 없다', () => {
  const p = buildLovePreview(birth, 'some', OCT);
  const json = JSON.stringify(p);
  assert.doesNotMatch(json, /"months?":/);
  assert.doesNotMatch(json, /"(top3|score|index)":/);
  assert.equal(p.seasons.length, 4);
  assert.deepEqual(Object.keys(p.seasons[0]).sort(), ['avg', 'label', 'level']);
  assert.deepEqual(p.situation, { key: 'some', label: '썸' });
  assert.ok(p.locked.includes(SITUATIONS.some.actionTitle));
  assert.equal(p.price, 19900);
  assert.equal(p.pillars.length, 4);
  assert.ok(p.balance.bars.length === 5 && p.charm.base.text);
});

test('시각을 모르면 시주 없이 만들고 안내를 붙인다', () => {
  const p = buildLovePreview({ ...birth, hour: null }, 'single', OCT);
  assert.equal(p.pillars.length, 3);
  assert.ok(p.note);
});

test('상황과 성별이 없으면 한국어 오류를 낸다', () => {
  assert.throws(() => buildLovePreview(birth, 'unknown', OCT), /상황/);
  assert.throws(() => buildLovePreview({ ...birth, gender: null }, 'single', OCT), /성별/);
});

