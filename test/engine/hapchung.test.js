'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeHapchung } = require('../../src/engine/hapchung');

function palja(y, m, d, h) {
  return {
    yearPillar: { stem: '甲', branch: y },
    monthPillar: { stem: '甲', branch: m },
    dayPillar: { stem: '甲', branch: d },
    hourPillar: { stem: '甲', branch: h }
  };
}

test('자오충 감지', () => {
  const r = analyzeHapchung(palja('子', '寅', '午', '辰'));
  assert.equal(r.chung.length, 1);
  assert.deepEqual(r.chung[0].branches.sort(), ['子', '午'].sort());
});

test('인묘진 방합 완전체', () => {
  const r = analyzeHapchung(palja('寅', '卯', '辰', '巳'));
  assert.equal(r.banghap.complete.length, 1);
  assert.equal(r.banghap.complete[0].element, '木');
});

test('신자진 완전삼합 vs 왕지 없는 반합 불인정', () => {
  const complete = analyzeHapchung(palja('申', '子', '辰', '巳'));
  assert.equal(complete.samhap.complete.length, 1);
  assert.equal(complete.samhap.complete[0].element, '水');

  // 申辰만 있고 왕지(子)가 없으면 반합 불인정
  const noWangji = analyzeHapchung(palja('申', '辰', '巳', '午'));
  assert.equal(noWangji.samhap.complete.length, 0);
  assert.equal(noWangji.samhap.half.length, 0);
});

test('반합은 왕지 포함 시에만 성립', () => {
  const half = analyzeHapchung(palja('申', '子', '巳', '午'));
  assert.equal(half.samhap.half.length, 1);
  assert.equal(half.samhap.half[0].wangji, '子');
});

test('삼합 완전체가 겹치면 같은 지지의 충/육합은 weakened 태그', () => {
  // 년=申, 월=子, 일=辰(삼합 완전) + 시=午 → 子午충 발생, 子가 삼합에 묶여 weakened
  const r = analyzeHapchung(palja('申', '子', '辰', '午'));
  assert.equal(r.samhap.complete.length, 1);
  const chungHit = r.chung.find(c => c.branches.includes('子') && c.branches.includes('午'));
  assert.ok(chungHit, 'chung between 子/午 should be detected');
  assert.equal(chungHit.weakened, true);
});

test('육합 — 인접 지지만 성립(비인접은 불인정)', () => {
  const adjacent = analyzeHapchung(palja('子', '丑', '寅', '卯')); // 년-월 인접
  assert.equal(adjacent.yukhap.length, 1);
  assert.equal(adjacent.yukhap[0].element, '土');

  const nonAdjacent = analyzeHapchung(palja('子', '寅', '丑', '卯')); // 子(년)-丑(일)은 비인접
  assert.equal(nonAdjacent.yukhap.length, 0);
});

test('형(刑) — 인사신 삼형 2글자 이상', () => {
  const r = analyzeHapchung(palja('寅', '巳', '申', '子'));
  const samhyeong = r.hyeong.find(h => h.type === '삼형');
  assert.ok(samhyeong);
  assert.equal(samhyeong.complete, true);
});

test('자형 — 같은 지지(辰) 2개', () => {
  const r = analyzeHapchung(palja('辰', '子', '辰', '午'));
  const jahyeong = r.hyeong.find(h => h.type === '자형');
  assert.ok(jahyeong);
});
