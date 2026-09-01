'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeStrength } = require('../../src/engine/strength');

test('신강 — 득령/득지/득세/통근 전부 충족', () => {
  const core = {
    palja: {
      yearPillar: { stem: '甲', branch: '申' },
      monthPillar: { stem: '丙', branch: '寅' }, // 월지 寅 본기=甲(木) → 득령
      dayPillar: { stem: '甲', branch: '寅' },   // 일간 甲, 일지 寅 → 甲의 12운성=건록(왕지) → 득지
      hourPillar: { stem: '壬', branch: '酉' }   // 壬=인성(水生木) → 년甲(비겁)+시壬(인성)=2 → 득세
    },
    ilgan: { char: '甲', ohaeng: '木', yinyang: '양' }
  };
  const r = analyzeStrength(core);
  assert.equal(r.deukryeong, true);
  assert.equal(r.deukji, true);
  assert.equal(r.deukse, true);
  assert.equal(r.tongkeun, true);
  assert.equal(r.verdict, '신강');
});

test('신약 — 득령/득지/득세/통근 전부 실패', () => {
  const core = {
    palja: {
      yearPillar: { stem: '庚', branch: '申' },
      monthPillar: { stem: '庚', branch: '申' }, // 월지 申 본기=庚(金) → 甲에게 관성 → 득령 실패
      dayPillar: { stem: '甲', branch: '申' },   // 甲의 12운성@申=절 → 득지 실패
      hourPillar: { stem: '辛', branch: '申' }   // 비겁/인성 없음 → 득세 실패
    },
    ilgan: { char: '甲', ohaeng: '木', yinyang: '양' }
  };
  const r = analyzeStrength(core);
  assert.equal(r.deukryeong, false);
  assert.equal(r.deukji, false);
  assert.equal(r.deukse, false);
  assert.equal(r.tongkeun, false);
  assert.equal(r.verdict, '신약');
});
