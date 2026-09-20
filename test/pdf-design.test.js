'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../src/engine');
const { renderQuickHtml } = require('../src/pdf/renderQuickHtml');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderCompatHtml } = require('../src/pdf/renderCompatHtml');
const { analyzeCompatibility } = require('../src/engine/compatibility');

test('quick PDF keeps the report text and shows the reading hierarchy', () => {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const text = '첫 문단의 요약입니다.\n\n둘째 문단의 근거입니다.\n\n셋째 문단의 실천 제안입니다.';
  const html = renderQuickHtml(engine, { name: '홍길동', gender: '남' }, '재물운', text);
  assert.match(html, /<body class="quick-report">/);
  assert.match(html, /01 · 먼저 읽어보세요/);
  assert.match(html, /02 · 조금 더 자세히/);
  for (const paragraph of text.split('\n\n')) assert.ok(html.includes(paragraph));
  assert.match(html, /window\.__chartsReady = true/);
});

test('full report shows numeric element and role distributions without chart canvases', () => {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const html = renderHtml(engine, [], { name: '홍길동', gender: '남' });
  assert.match(html, /id="myeongsik"/);
  assert.match(html, /id="myeongsik-data"/);
  assert.match(html, /가장 많이 나타난 기운은/);
  assert.match(html, /이 수치는 글자의/);
  assert.doesNotMatch(html, /<canvas id="ohaengChart"/);
  assert.doesNotMatch(html, /<canvas id="shipsinChart"/);
  for (const count of Object.values(engine.counts.ohaeng)) assert.ok(html.includes(`${count}개`));
});

test('lifetime report includes a plain-language daewoon sheet without chart scripts', () => {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const html = renderHtml(engine, [{ id: 7, title: '대운 흐름', text: '시기별 흐름을 읽습니다.' }], { name: '홍길동', gender: '남' });
  assert.match(html, /<body class="lifetime-report">/);
  assert.match(html, /class="daewoon-sheet page-break"/);
  assert.match(html, /이 숫자는 무엇을 뜻하나요/);
  assert.match(html, /window\.__chartsReady = true/);
  assert.doesNotMatch(html, /<canvas id="daewoonChart"/);
  assert.doesNotMatch(html, /chart\.js/i);
});

test('compatibility report describes scores as references, not predictions', () => {
  const engineA = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const engineB = computeSaju({ year: 1992, month: 9, day: 3, hour: 14, minute: 0, gender: '여' });
  const html = renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, analyzeCompatibility(engineA, engineB), '서로의 소통을 살펴보세요.');
  assert.match(html, /<body class="compat-report">/);
  assert.match(html, /관계 데이터 참고 점수/);
  assert.match(html, /관계의 미래를 예측하는 확률이 아닙니다/);
  // 골격 도입 후 본문은 renderBody로 그린다 — 예전 "먼저 읽어보세요" 강조 상자는 없다.
  assert.match(html, /<div class="compat-body"><p>서로의 소통을 살펴보세요\.<\/p>/);
});
