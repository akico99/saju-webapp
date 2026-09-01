'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeKyukguk } = require('../../src/engine/kyukguk');

function makeCore({ dayStem, monthBranch, yearStem = '乙', monthStem, hourStem = '乙' }) {
  return {
    palja: {
      yearPillar: { stem: yearStem, branch: '子' },
      monthPillar: { stem: monthStem, branch: monthBranch },
      dayPillar: { stem: dayStem, branch: '子' },
      hourPillar: { stem: hourStem, branch: '子' }
    }
  };
}
const noPagyeok = { monthBranchChungFlag: false };
const noneWeakStrength = { verdict: '중화', deukryeong: true, deukji: true, deukse: true, tongkeun: true };
const flatCounts = { ohaeng: { 木: 1, 火: 1, 土: 1, 金: 1, 水: 1 } };

test('본기 투출 — 월간이 월지 본기를 직접 드러냄', () => {
  const core = makeCore({ dayStem: '戊', monthBranch: '寅', monthStem: '甲', hourStem: '乙' });
  const r = analyzeKyukguk(core, noPagyeok, noneWeakStrength, flatCounts);
  assert.equal(r.basis, '본기');
  assert.equal(r.name, '편관격(칠살격)');
});

test('중기 투출 — 본기 없고 중기만 노출된 경우 폴백', () => {
  // 丑 지장간: 본기己/중기癸/여기辛. 노출 천간에 己·辛은 없고 癸만 있음.
  const core = makeCore({ dayStem: '丙', monthBranch: '丑', yearStem: '甲', monthStem: '甲', hourStem: '癸' });
  const r = analyzeKyukguk(core, noPagyeok, noneWeakStrength, flatCounts);
  assert.equal(r.basis, '중기');
  assert.equal(r.name, '정관격');
});

test('무투출 폴백 — 아무것도 노출 안 되면 본기 자체 사용', () => {
  // 子 지장간은 癸 하나뿐. 노출 천간에 癸 없음 → 폴백.
  const core = makeCore({ dayStem: '戊', monthBranch: '子', yearStem: '甲', monthStem: '甲', hourStem: '甲' });
  const r = analyzeKyukguk(core, noPagyeok, noneWeakStrength, flatCounts);
  assert.equal(r.basis, '본기(무투출 폴백)');
  assert.equal(r.name, '정재격');
});

test('건록격 특례 — 비겁 투출', () => {
  const core = makeCore({ dayStem: '乙', monthBranch: '卯', monthStem: '乙', hourStem: '甲' });
  const r = analyzeKyukguk(core, noPagyeok, noneWeakStrength, flatCounts);
  assert.equal(r.name, '건록격');
});

test('파격 플래그 — 월지 충 발생 시 true', () => {
  const core = makeCore({ dayStem: '戊', monthBranch: '寅', monthStem: '甲', hourStem: '乙' });
  const r = analyzeKyukguk(core, { monthBranchChungFlag: true }, noneWeakStrength, flatCounts);
  assert.equal(r.pagyeokFlag, true);
});

test('종격 후보 — 신약 + 전부 실패 + 오행 5개 이상 몰림', () => {
  const core = makeCore({ dayStem: '戊', monthBranch: '子', monthStem: '甲', hourStem: '甲' });
  const weakStrength = { verdict: '신약', deukryeong: false, deukji: false, deukse: false, tongkeun: false };
  const skewedCounts = { ohaeng: { 木: 5, 火: 1, 土: 1, 金: 0, 水: 1 } };
  const r = analyzeKyukguk(core, noPagyeok, weakStrength, skewedCounts);
  assert.equal(r.jonggyeok.candidate, true);
  assert.equal(r.jonggyeok.dominantOhaeng, '木');
  assert.equal(r.jonggyeok.type, '종살격');
});
