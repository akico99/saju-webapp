'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { RELATIONS, TARGET_WORDS, getCompatOutline, normalizeRelation } = require('../src/llm/compatOutlines');
const { buildCompatPrompt } = require('../src/llm/compatPromptBuilder');
const { renderCompatHtml } = require('../src/pdf/renderCompatHtml');
const { computeSaju } = require('../src/engine/index');
const { analyzeCompatibility } = require('../src/engine/compatibility');

const engineA = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
const engineB = computeSaju({ year: 1992, month: 9, day: 3, hour: 14, minute: 0, gender: '여' });
const compat = analyzeCompatibility(engineA, engineB);

test('관계 유형마다 골격 분량 합이 목표와 같고 소제목이 겹치지 않는다', () => {
  for (const key of Object.keys(RELATIONS)) {
    const outline = getCompatOutline(key);
    const sum = outline.reduce((a, o) => a + o.words, 0);
    assert.strictEqual(sum, TARGET_WORDS, `${key}: ${sum}`);
    const headings = outline.map((o) => o.heading);
    assert.strictEqual(new Set(headings).size, headings.length, `${key}: 소제목 중복`);
    assert.match(headings[headings.length - 1], /핵심 요약/);
    for (const o of outline) assert.ok(o.hint.length > 20, `${key}/${o.heading}: hint 없음`);
  }
});

test('모르는 관계 값은 기본(연애 중)으로 돌아간다', () => {
  assert.strictEqual(normalizeRelation('zzz'), 'dating');
  assert.strictEqual(normalizeRelation(undefined), 'dating');
  assert.deepStrictEqual(getCompatOutline('zzz'), getCompatOutline('dating'));
});

test('프롬프트에 관계 라벨과 골격 소제목이 순서대로 들어간다', () => {
  const prompt = buildCompatPrompt(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, 'ex');
  assert.ok(prompt.includes('헤어짐·재회 고민'));
  const outline = getCompatOutline('ex');
  let last = -1;
  for (const o of outline) {
    const idx = prompt.indexOf(`### ${o.heading}`);
    assert.ok(idx > last, `순서 어긋남: ${o.heading}`);
    last = idx;
  }
  // 요청 분량은 ASK_RATIO(1.5)로 키운 값 — 실제 목표 3,000자면 4,500자를 요청한다.
  assert.ok(prompt.includes('4500자'));
  // 연애 전용 소주제가 재회 프롬프트에 섞이지 않는다.
  assert.ok(!prompt.includes('다툼이 생기는 방식'));
});

test('궁합 HTML이 ### 소제목을 h3.sub로 그리고 관계 라벨을 표지에 넣는다', () => {
  const text = '### 서로에게 어떤 존재로 다가오는지\n첫 문단.\n\n### 배우자궁이 말하는 것\n둘째 문단.\n\n- 할 것 하나\n- 할 것 둘';
  const html = renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, text, 'married');
  assert.ok(html.includes('<h3 class="sub">서로에게 어떤 존재로 다가오는지</h3>'));
  assert.ok(html.includes('<ul class="sub-list">'));
  assert.ok(html.includes('결혼·부부 ·'));
  assert.ok(!html.includes('###'));
});
