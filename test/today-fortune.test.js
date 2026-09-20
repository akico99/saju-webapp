'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getTodayFortune } = require('../src/engine/todayFortune');

const birth = { year: 1985, month: 11, day: 3, hour: 22, minute: 0, gender: '남', isLunar: false };

test('오늘의 운세는 참고 지수와 비유임을 명시한다', () => {
  const result = getTodayFortune(birth, new Date(2026, 8, 20));
  assert.match(result.scoreNote, /참고 지수/);
  assert.match(result.weather.note, /비유/);
  assert.doesNotMatch([result.title, result.desc, result.tip, ...result.summary3, ...result.dos].join(' '), /가장 좋은 날|중요한 일정은 그날로|결과가 보장/);
});
