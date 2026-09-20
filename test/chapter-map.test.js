'use strict';
/* 18챕터를 병렬로 돌리기 위해 순서 의존을 끊었다. 그 자리를 대신하는 것이 '지면 배분' 블록이다.
   이 블록이 빠지면 각 챕터가 남의 몫을 미리 써버려 중복이 늘어난다. 계약을 테스트로 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildChapterMap } = require('../src/llm/generateReport');
const { CHAPTERS } = require('../src/llm/chapters');
const { buildChapterPrompt } = require('../src/llm/promptBuilder');
const { computeSaju } = require('../src/engine/index');
const { SYSTEM_PROMPT } = require('../src/llm/systemPrompt');

test('지면 배분표는 자기 챕터만 빼고 나머지 전부를 담는다', () => {
  const map = buildChapterMap(8);
  assert.equal(map.split('\n').length, CHAPTERS.length - 1);
  assert.ok(!map.includes('제8장'), '자기 몫을 다시 보여줄 이유가 없다');
  for (const c of CHAPTERS) {
    if (c.id === 8) continue;
    assert.ok(map.includes('제' + c.id + '장 ' + c.title), c.id + '장이 빠졌다');
  }
});

test('배분표에는 소주제까지 펼쳐 넣는다 — 제목만으로는 경계가 모호하다', () => {
  const map = buildChapterMap(1);
  const withOutline = CHAPTERS.find((c) => c.id !== 1 && (c.outline || []).length);
  const firstHeading = withOutline.outline[0].heading;
  assert.ok(map.includes(firstHeading), '소주제 제목이 배분표에 있어야 한다');
});

test('리포트 프롬프트는 배분표를 쓰고 이전 챕터 요약에 기대지 않는다', () => {
  const engine = computeSaju({ year: 1985, month: 11, day: 3, hour: 22, minute: 0, gender: '남', isLunar: false });
  const chapter = CHAPTERS.find((c) => c.id === 8);
  const prompt = buildChapterPrompt(chapter, engine, { name: '홍길동', gender: '남' }, [], {
    chapterMap: buildChapterMap(8)
  });
  assert.match(prompt, /리포트 전체 지면 배분/);
  assert.ok(!prompt.includes('이전 챕터 핵심 요지'), '순서 의존이 남아 있으면 병렬로 돌릴 수 없다');
});

test('심층 리딩은 기존 방식(이전 챕터 요약)을 그대로 쓴다', () => {
  const engine = computeSaju({ year: 1985, month: 11, day: 3, hour: 22, minute: 0, gender: '남', isLunar: false });
  const chapter = CHAPTERS.find((c) => c.id === 8);
  const prompt = buildChapterPrompt(chapter, engine, { name: '홍길동', gender: '남' }, ['앞 챕터 요지 한 줄']);
  assert.match(prompt, /이전 챕터 핵심 요지/);
  assert.ok(!prompt.includes('리포트 전체 지면 배분'));
});

test('용어 풀이를 챕터마다 똑같이 복사하지 말라는 규칙이 있다', () => {
  // 측정 결과 가장 긴 공통 구간 1위가 7개 챕터에 동일하게 박힌 십신 용어 풀이였다.
  assert.match(SYSTEM_PROMPT, /그대로 복사해 쓰지 마세요/);
});
