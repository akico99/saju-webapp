'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../src/engine/index');
const { buildLoveTiming, buildLovePreview, SITUATIONS, situationOf, validateBirth } = require('../src/engine/loveTiming');

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
  assert.equal(p.price, 14900);
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

test('객체 기본 속성 이름은 상황 값으로 통과하지 않는다', () => {
  for (const key of ['__proto__', 'toString', 'constructor', 'hasOwnProperty']) assert.throws(() => situationOf(key), /상황/, key);
});

test('무료 계절 문구는 가장 강한 달이 그 계절 안에 있다고 약속하지 않는다', () => {
  // 계절 평균 1위와 월별 1위는 다른 칸에 있는 경우가 많다(검토 표본 54%). 어느 쪽이든 같은 문장을 써서
  // 결과와 어긋나지도, 1위 달의 위치를 흘리지도 않게 한다.
  const leads = new Set();
  for (let i = 0; i < 60; i++) {
    const b = { year: 1975 + (i % 30), month: 1 + (i % 12), day: 1 + (i % 28), hour: i % 24, minute: 0, gender: i % 2 ? '남' : '여', isLunar: false };
    const p = buildLovePreview(b, 'single', LATE_OCT);
    assert.doesNotMatch(p.seasonLead, /그 안에서|그중 어느 달/);
    assert.match(p.seasonLead, /이 계절 밖에 있을 수도/);
    leads.add(p.seasonLead.replace(/^계절로 묶어 보면 .+?의 흐름/, ''));
  }
  assert.equal(leads.size, 1);
});

test('서버는 없는 날짜·범위 밖 시각·정수가 아닌 값을 거른다', () => {
  const ok = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, isLunar: false, isLeap: false };
  const bad = [
    { month: 13 }, { day: 0 }, { year: 1995, month: 2, day: 29 }, { month: 2, day: 31 }, { day: 5.5 },
    { hour: 25 }, { hour: -3 }, { hour: 1.5 }, { minute: 99 }, { minute: -1 }, { year: 1 }, { year: 3000 },
    { isLunar: true, year: 1995, month: 2, day: 31 }, { isLunar: true, isLeap: true, year: 2023, month: 2, day: 30 },
    { isLunar: true, isLeap: true, year: 1995, month: 5, day: 1 } // 1995년에는 윤5월이 없다(윤8월)
  ];
  for (const b of bad) assert.throws(() => validateBirth({ ...ok, ...b }), /날짜|시각|분|해/, JSON.stringify(b));
  assert.doesNotThrow(() => validateBirth(ok));
  assert.doesNotThrow(() => validateBirth({ ...ok, hour: null, minute: 0 }));
  assert.doesNotThrow(() => validateBirth({ ...ok, year: 2000, month: 2, day: 29 }));
  assert.doesNotThrow(() => validateBirth({ ...ok, isLunar: true, isLeap: true, year: 2023, month: 2, day: 10 }));
});

test('아직 오지 않은 생년월일은 거른다(음력은 양력으로 바꾼 날짜 기준)', () => {
  const now = new Date('2026-10-22T03:00:00Z');
  assert.throws(() => validateBirth({ year: 2026, month: 12, day: 31, hour: null, minute: 0, isLunar: false }, now), /오지 않은/);
  assert.throws(() => validateBirth({ year: 2026, month: 12, day: 29, hour: null, minute: 0, isLunar: true }, now), /오지 않은/);
  assert.doesNotThrow(() => validateBirth({ year: 2026, month: 10, day: 22, hour: null, minute: 0, isLunar: false }, now));
  assert.doesNotThrow(() => validateBirth({ year: 2026, month: 9, day: 1, hour: null, minute: 0, isLunar: true }, now)); // 양력 10월 11일
});

test('무료 첫 장에서 받은 시작 달로 유료 12개월을 고정하되, 허용된 두 달 밖의 값은 무시한다', () => {
  const p = buildLovePreview(birth, 'single', LATE_OCT);
  assert.equal(p.startYm, '2026-11');
  const e = computeSaju(birth);
  // 15일에 미리보고 16일에 결제하면 시작 달이 밀리지 않도록 직전 달까지 받아 준다.
  assert.deepEqual(buildLoveTiming(e, '여', LATE_OCT, { startYm: '2026-10' }).months[0].month, 10);
  assert.deepEqual(buildLoveTiming(e, '여', LATE_OCT, { startYm: '2026-11' }).months[0].month, 11);
  for (const s of ['2025-01', '2026-12', 'x', null, 2026]) {
    assert.equal(buildLoveTiming(e, '여', LATE_OCT, { startYm: s }).months[0].month, 11, String(s));
  }
});

