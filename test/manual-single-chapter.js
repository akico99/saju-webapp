'use strict';
/* Phase 4 수동 확인용 — 챕터 1개를 실제 Claude API로 생성해 사실충실성/소수점없음/톤을 검수 */
const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { buildChapterPrompt } = require('../src/llm/promptBuilder');
const { SYSTEM_PROMPT } = require('../src/llm/systemPrompt');
const { generateText } = require('../src/llm/client');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const chapter = CHAPTERS[0]; // 제1장 총평
  const prompt = buildChapterPrompt(chapter, engine, { name: '홍길동', gender: '남' }, []);
  console.log('=== 프롬프트 길이 ===', prompt.length, '자');
  const { text, usage, stopReason } = await generateText(SYSTEM_PROMPT, prompt);
  console.log('=== stopReason ===', stopReason);
  console.log('=== usage ===', usage);
  console.log('=== 생성된 텍스트 길이 ===', text.length, '자 (목표', chapter.targetWords, '자)');
  console.log('=== 소수점 패턴 검사 ===', (text.match(/\d\.\d/g) || []));
  console.log('\n=== 본문 ===\n', text);
}
main().catch(e => { console.error('실패:', e.message); process.exit(1); });
