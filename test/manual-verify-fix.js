'use strict';
/* 내부 필드명 누출 수정 검증 — 문제가 있었던 4장, 6장만 재생성해서 확인 */
const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { buildChapterPrompt } = require('../src/llm/promptBuilder');
const { SYSTEM_PROMPT } = require('../src/llm/systemPrompt');
const { generateText, MODEL } = require('../src/llm/client');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const targets = CHAPTERS.filter(c => c.id === 4 || c.id === 6);
  for (const chapter of targets) {
    const prompt = buildChapterPrompt(chapter, engine, { name: '홍길동', gender: '남' }, []);
    const { text } = await generateText(SYSTEM_PROMPT, prompt);
    const leak = (text.match(/[a-z][A-Z][a-zA-Z]*|candidates|score|verdict|mode|ruleMatched/g) || []);
    console.log(`\n=== 제${chapter.id}장 "${chapter.title}" (${MODEL}) ===`);
    console.log('길이:', text.length, '자 / 목표', chapter.targetWords, '자');
    console.log('의심 패턴:', leak.length ? leak : '없음');
    console.log(text);
  }
}
main().catch(e => { console.error('실패:', e.message); process.exit(1); });
