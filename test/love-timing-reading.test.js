'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../src/engine/index');
const { buildLoveTiming } = require('../src/engine/loveTiming');
const { buildLovePrompt, parseLoveText, toPlainText, LOVE_SYSTEM_PROMPT } = require('../src/llm/loveTimingReading');
const { BASE_RULES } = require('../src/llm/baseSystemPrompt');

const birth = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여', isLunar: false };
const OCT = new Date('2026-10-22T03:00:00Z');
const engine = computeSaju(birth);
const timing = buildLoveTiming(engine, '여', OCT);
const person = { name: '수달', gender: '여' };

test('프롬프트는 상위 세 달을 강한 순서 그대로 확정값으로 넘기고 점수 숫자는 넘기지 않는다', () => {
  const prompt = buildLovePrompt(engine, person, 'some', timing);
  const labels = timing.top3.map((m) => m.year + '년 ' + m.month + '월');
  let at = -1;
  for (const label of labels) {
    const i = prompt.indexOf(label, at + 1);
    assert.ok(i > at, label + ' 순서');
    at = i;
  }
  assert.ok(prompt.includes('### 썸을 연애로 바꾸려면'));
  assert.ok(prompt.includes('### 월별 한 줄'));
  assert.doesNotMatch(prompt, /\d+\s*점/);
});

test('이별 후 상황은 재회를 권하거나 말리지 않도록 지시한다', () => {
  const prompt = buildLovePrompt(engine, person, 'breakup', timing);
  assert.match(prompt, /재회를 권하거나 말리지 않/);
  assert.ok(prompt.includes('### 이별 뒤 지금 할 일'));
});

test('시스템 프롬프트는 공통 안전 규칙을 포함한다', () => {
  assert.ok(LOVE_SYSTEM_PROMPT.includes(BASE_RULES));
  assert.match(LOVE_SYSTEM_PROMPT, /반드시/);
});

const SAMPLE = [
  '### 한 줄 답', '12개월 중 인연 신호가 가장 강한 달은 2026년 12월이에요.', '',
  '### 인연 신호가 강한 세 달', '**2026년 12월** 첫째 달 풀이', '', '**2027년 8월** 둘째 달 풀이', '',
  '### 나에게 끌리는 사람', '끌리는 사람 풀이', '',
  '### 만남이 생기기 쉬운 자리 ', '자리 풀이', '',
  '### 썸을 연애로 바꾸려면:', '상황 풀이', '',
  '### 월별 한 줄', '- 10월: 첫 줄', '- 11월 : 둘째 줄', '이상한 줄', '- 13월: 무시', '- 10월: 중복 무시', '12월: 셋째 줄'
].join('\n');

test('본문 파싱은 정해진 순서로 장을 모으고 빠진 장과 형식이 틀린 월 줄을 견딘다', () => {
  const r = parseLoveText(SAMPLE, 'some');
  assert.deepEqual(r.sections.map((s) => s.title), ['한 줄 답', '인연 신호가 강한 세 달', '나에게 끌리는 사람', '만남이 생기기 쉬운 자리', '썸을 연애로 바꾸려면']);
  assert.match(r.sections[1].text, /\*\*2027년 8월\*\*/);
  assert.deepEqual(r.monthNotes, [{ month: 10, note: '첫 줄' }, { month: 11, note: '둘째 줄' }, { month: 12, note: '셋째 줄' }]);
});

test('소제목이 하나도 없으면 전체를 한 장으로 보존한다', () => {
  const r = parseLoveText('그냥 긴 글입니다.', 'single');
  assert.deepEqual(r.sections, [{ key: 'body', title: '풀이', text: '그냥 긴 글입니다.' }]);
  assert.deepEqual(r.monthNotes, []);
});

test('저장용 본문은 장 제목을 ## 으로 달고 월별 한 줄을 마지막에 둔다', () => {
  const text = toPlainText(parseLoveText(SAMPLE, 'some'));
  assert.ok(text.startsWith('## 한 줄 답\n\n12개월 중'));
  assert.ok(text.includes('## 앞으로 12개월\n\n- 10월: 첫 줄\n- 11월: 둘째 줄'));
  assert.ok(text.indexOf('## 썸을 연애로 바꾸려면') < text.indexOf('## 앞으로 12개월'));
});

