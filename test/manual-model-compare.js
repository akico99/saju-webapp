'use strict';
/* 모델 비교용 — 동일 챕터를 Sonnet 5로 생성해 Opus 결과와 비교 */
process.env.SAJU_MODEL = process.argv[2] || 'claude-sonnet-5';

const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { buildChapterPrompt } = require('../src/llm/promptBuilder');
const { SYSTEM_PROMPT } = require('../src/llm/systemPrompt');
const { generateText, MODEL } = require('../src/llm/client');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const chapter = CHAPTERS[0];
  const prompt = buildChapterPrompt(chapter, engine, { name: '홍길동', gender: '남' }, []);
  console.log('=== 모델 ===', MODEL);
  const t0 = Date.now();
  const { text, usage, stopReason } = await generateText(SYSTEM_PROMPT, prompt);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('=== stopReason ===', stopReason, '/ 소요', elapsedSec, '초');
  console.log('=== usage ===', usage);
  console.log('=== 길이 ===', text.length, '자 (목표', chapter.targetWords, '자)');
  console.log('=== 소수점 패턴 ===', (text.match(/\d\.\d/g) || []));
  console.log('\n=== 본문 ===\n', text);
}
main().catch(e => { console.error('실패:', e.message); process.exit(1); });
