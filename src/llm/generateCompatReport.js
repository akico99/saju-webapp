'use strict';
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { buildCompatPrompt } = require('./compatPromptBuilder');
const { generateText } = require('./client');

/**
 * @param {Object} engineA computeSaju() 결과 (본인)
 * @param {Object} engineB computeSaju() 결과 (상대)
 * @param {{name?:string}} personA
 * @param {{name?:string}} personB
 * @param {Object} compat analyzeCompatibility() 결과
 * @param {string} [relation] compatOutlines.RELATIONS 키 (dating/married/crush/ex)
 * @param {Object|null} [timing] compatTiming.buildCompatTiming() 결과(없으면 프롬프트 빌더가 계산)
 * @returns {Promise<{text:string, usage:object}>}
 */
async function generateCompatReport(engineA, engineB, personA, personB, compat, relation, timing) {
  const prompt = buildCompatPrompt(engineA, engineB, personA, personB, compat, relation, timing);
  // 본문 5,000자 + 할 것·피할 것 10항목이라 기본 12000토큰으로는 빠듯하다 — 잘리면 통째로 실패(환불)하므로 넉넉히.
  return generateText(SYSTEM_PROMPT, prompt, { maxTokens: 16000 });
}

module.exports = { generateCompatReport };
