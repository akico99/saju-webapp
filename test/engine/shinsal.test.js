'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeShinsal } = require('../../src/engine/shinsal');

function makeCore({ yearB, monthB, dayS, dayB, hourB }) {
  const palja = {
    yearPillar: { stem: '乙', branch: yearB },
    monthPillar: { stem: '乙', branch: monthB },
    dayPillar: { stem: dayS, branch: dayB },
    hourPillar: { stem: '乙', branch: hourB }
  };
  const manse = {};
  ['year', 'month', 'day', 'hour'].forEach(k => { manse[k] = { shinsals: [] }; });
  return { palja, manse };
}

test('천을귀인 — 甲일간 기준 丑/未', () => {
  const core = makeCore({ yearB: '丑', monthB: '午', dayS: '甲', dayB: '寅', hourB: '巳' });
  analyzeShinsal(core);
  assert.ok(core.manse.year.shinsals.includes('천을귀인'));
});

test('문창귀인 — 甲일간 기준 巳', () => {
  const core = makeCore({ yearB: '子', monthB: '午', dayS: '甲', dayB: '寅', hourB: '巳' });
  analyzeShinsal(core);
  assert.ok(core.manse.hour.shinsals.includes('문창귀인'));
});

test('양인 — 甲일간 기준 卯 (음간은 해당 없음)', () => {
  const core = makeCore({ yearB: '卯', monthB: '午', dayS: '甲', dayB: '寅', hourB: '巳' });
  analyzeShinsal(core);
  assert.ok(core.manse.year.shinsals.includes('양인'));

  const yinCore = makeCore({ yearB: '卯', monthB: '午', dayS: '乙', dayB: '寅', hourB: '巳' });
  analyzeShinsal(yinCore);
  assert.ok(!yinCore.manse.year.shinsals.includes('양인'));
});

test('괴강 — 일주 庚辰', () => {
  const core = makeCore({ yearB: '子', monthB: '午', dayS: '庚', dayB: '辰', hourB: '巳' });
  analyzeShinsal(core);
  assert.ok(core.manse.day.shinsals.includes('괴강'));
});

test('백호 — 어느 기둥이든 甲辰이면 성립', () => {
  const core = makeCore({ yearB: '辰', monthB: '午', dayS: '丙', dayB: '寅', hourB: '巳' });
  core.palja.yearPillar.stem = '甲'; // 년주를 甲辰으로
  analyzeShinsal(core);
  assert.ok(core.manse.year.shinsals.includes('백호'));
});

test('도화 — 연지/일지 이중 기준, 어느 쪽으로 성립했는지 태그', () => {
  // 연지 寅(寅午戌 그룹 → 卯가 도화 목표) → 시지가 卯면 도화 성립
  const core = makeCore({ yearB: '寅', monthB: '午', dayS: '戊', dayB: '子', hourB: '卯' });
  analyzeShinsal(core);
  assert.ok(core.manse.hour.shinsals.some(s => s.startsWith('도화')));
});
