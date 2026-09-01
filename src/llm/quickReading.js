'use strict';
/* 저가 마이크로 리딩(단일 주제) — 18장 리포트와 완전히 새로운 로직을 만들지 않고,
   기존 chapters.js 레지스트리에서 딱 1개 챕터만 골라 목표 분량을 짧게(약 900자)
   줄여서 재사용한다. 엔진 계산·가드레일·전문용어 풀어쓰기 규칙은 100% 동일하게
   적용되고, 분량과 가격만 다른 저가 상품. */

const { CHAPTERS } = require('./chapters');
const { buildChapterPrompt } = require('./promptBuilder');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { generateText } = require('./client');

const QUICK_TOPICS = {
  total: { chapterId: 1, label: '오늘의 나 — 총평', price: 1000 },
  wealth: { chapterId: 8, label: '재물운', price: 1000 },
  career: { chapterId: 9, label: '직업·적성운', price: 1000 },
  love: { chapterId: 11, label: '애정운', price: 1000 },
  relationship: { chapterId: 13, label: '인간관계', price: 1000 }
};

const QUICK_TARGET_WORDS = 900;

/**
 * @param {Object} engineResult computeSaju() 결과
 * @param {{name?:string, gender?:string}} person
 * @param {string} topicKey QUICK_TOPICS의 키 (wealth, career, love, relationship, total)
 */
async function generateQuickReading(engineResult, person, topicKey) {
  const topic = QUICK_TOPICS[topicKey];
  if (!topic) throw new Error(`알 수 없는 마이크로 리딩 주제입니다: ${topicKey}`);

  const baseChapter = CHAPTERS.find(c => c.id === topic.chapterId);
  const quickChapter = { ...baseChapter, targetWords: QUICK_TARGET_WORDS };
  const prompt = buildChapterPrompt(quickChapter, engineResult, person, []);
  const { text, usage } = await generateText(SYSTEM_PROMPT, prompt);

  return { topicKey, title: topic.label, text, usage };
}

module.exports = { generateQuickReading, QUICK_TOPICS };
