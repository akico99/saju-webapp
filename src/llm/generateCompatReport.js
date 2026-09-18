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
 * @returns {Promise<{text:string, usage:object}>}
 */
async function generateCompatReport(engineA, engineB, personA, personB, compat, relation) {
  const prompt = buildCompatPrompt(engineA, engineB, personA, personB, compat, relation);
  return generateText(SYSTEM_PROMPT, prompt);
}

module.exports = { generateCompatReport };
