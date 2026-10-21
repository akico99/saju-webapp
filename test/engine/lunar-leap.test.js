'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../../src/engine/index');

// 1995년에는 윤8월이 있다. 윤8월 1일은 양력 9월 25일(乙酉월), 평달 8월 1일은 양력 8월 26일(甲申월).
test('음력 윤달 입력은 윤달 날짜로 계산한다', () => {
  const leap = computeSaju({ year: 1995, month: 8, day: 1, hour: 12, minute: 0, gender: '여', isLunar: true, isLeap: true });
  const plain = computeSaju({ year: 1995, month: 8, day: 1, hour: 12, minute: 0, gender: '여', isLunar: true, isLeap: false });
  assert.deepEqual([leap.meta.solarBefore.month, leap.meta.solarBefore.day], [9, 25]);
  assert.deepEqual([plain.meta.solarBefore.month, plain.meta.solarBefore.day], [8, 26]);
  assert.equal(leap.palja.monthPillar.stem + leap.palja.monthPillar.branch, '乙酉');
  assert.equal(plain.palja.monthPillar.stem + plain.palja.monthPillar.branch, '甲申');
});

// 2017년 윤6월은 30일, 평달 6월은 29일까지다. 윤6월 30일이 평달로 계산되면 없는 날짜라 실패했다.
test('평달에는 없고 윤달에만 있는 날짜도 계산된다', () => {
  assert.doesNotThrow(() => computeSaju({ year: 2017, month: 6, day: 30, hour: 12, minute: 0, gender: '남', isLunar: true, isLeap: true }));
});

