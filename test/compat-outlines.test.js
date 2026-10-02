'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { RELATIONS, TARGET_WORDS, getCompatOutline, normalizeRelation, splitCompatText } = require('../src/llm/compatOutlines');
const { buildCompatTiming } = require('../src/llm/compatTiming');
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
  // 요청 분량은 ASK_RATIO(1.5)로 키운 값 — 실제 목표 5,000자면 7,500자를 요청한다.
  assert.ok(prompt.includes('7500자'));
  // 연애 전용 소주제가 재회 프롬프트에 섞이지 않는다.
  assert.ok(!prompt.includes('다툼이 생기는 방식'));
});

test('시기 소주제가 점수 소주제 앞에 들어가고 재회만 6개월이다', () => {
  for (const key of Object.keys(RELATIONS)) {
    const headings = getCompatOutline(key).map((o) => o.heading);
    const t = headings.indexOf(key === 'ex' ? '앞으로 6개월' : '두 사람의 앞으로 3년');
    assert.ok(t >= 0, key + ': 시기 소주제 없음');
    assert.strictEqual(headings[t + 2], '점수가 말하는 것과 말하지 않는 것', key);
  }
});

test('시기 점수는 엔진이 계산한 확정값으로 프롬프트에 들어가고 재회는 월별 6개', () => {
  const year = buildCompatTiming(engineA, engineB, 'dating', new Date('2026-10-02T03:00:00Z'));
  assert.strictEqual(year.mode, 'year');
  assert.deepStrictEqual(year.periods.map((p) => p.year), [2026, 2027, 2028]);
  for (const p of year.periods) assert.strictEqual(p.combined, Math.round((p.a.score + p.b.score) / 2));
  const month = buildCompatTiming(engineA, engineB, 'ex', new Date('2026-12-31T20:00:00Z')); // 한국 시간 2027-01-01
  assert.strictEqual(month.mode, 'month');
  assert.strictEqual(month.periods.length, 6);
  assert.deepStrictEqual([month.periods[0].year, month.periods[0].month], [2027, 1]);
  const prompt = buildCompatPrompt(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, 'dating', year);
  assert.ok(prompt.includes('2028년 ' + year.periods[2].a.score + '점') || prompt.includes(year.periods[2].a.score + '점'));
  assert.ok(prompt.includes('평균이 가장 높은 해: ' + year.periods[year.bestIndex].label));
  assert.ok(prompt.includes('### 지금 할 것') && prompt.includes('### 피할 것'));
  // 계산 실패(null)여도 프롬프트는 만들어진다.
  assert.ok(buildCompatPrompt(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, 'dating', null).includes('계산하지 못했습니다'));
});

test('splitCompatText: 지금 할 것/피할 것을 본문에서 떼고, 빠지거나 깨져도 던지지 않는다', () => {
  const body = '### 첫째\n본문 하나.\n\n### 핵심 요약과 두 사람을 위한 실천 포인트\n요약.\n\n### 지금 할 것\n- 하나 **강조**\n- 둘\n\n### 피할 것\n1. 가\n2) 나\n   이어짐\n';
  const r = splitCompatText(body);
  assert.deepStrictEqual(r.dos, ['하나 **강조**', '둘']);
  assert.deepStrictEqual(r.donts, ['가', '나 이어짐']);
  assert.ok(!r.prose.includes('지금 할 것') && r.prose.includes('요약.'));
  assert.deepStrictEqual(splitCompatText('본문만 있음'), { prose: '본문만 있음', dos: [], donts: [] });
  assert.deepStrictEqual(splitCompatText(undefined), { prose: '', dos: [], donts: [] });
  assert.deepStrictEqual(splitCompatText('### 피할 것\n- x').dos, []);
});

test('궁합 HTML이 ### 소제목을 h3.sub로 그리고 관계 라벨을 표지에 넣는다', () => {
  const text = '### 서로에게 어떤 존재로 다가오는지\n첫 문단.\n\n### 배우자궁이 말하는 것\n둘째 문단.\n\n- 할 것 하나\n- 할 것 둘';
  const html = renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, text, 'married');
  assert.ok(html.includes('<h3 class="sub">서로에게 어떤 존재로 다가오는지</h3>'));
  assert.ok(html.includes('<ul class="sub-list">'));
  assert.ok(html.includes('결혼·부부 ·'));
  assert.ok(!html.includes('###'));
});

test('궁합 HTML이 시기 패널과 할 것·피할 것 카드를 그리고 본문에는 그 구역이 남지 않는다', () => {
  const text = '### 첫째\n본문.\n\n### 지금 할 것\n- 일 **하나**\n\n### 피할 것\n- 일 둘';
  const html = renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, text, 'dating');
  assert.ok(html.includes('두 사람의 앞으로 3년') && html.includes('<div class="vz-pair-grid">'));
  assert.ok(html.includes('<div class="vz-dd do">') && html.includes('<div class="vz-dd dont">'));
  assert.ok(!html.includes('<h3 class="sub">지금 할 것</h3>'));
  const ex = renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, text, 'ex');
  assert.ok(ex.includes('두 사람의 앞으로 6개월'));
  // timing=null이면 시기 패널 없이도 렌더된다.
  assert.ok(!renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, text, 'dating', null).includes('<div class="vz-pair-grid">'));
});
