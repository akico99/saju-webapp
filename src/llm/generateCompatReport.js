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
 * @returns {Promise<{text:string, usage:object}>}
 */
async function generateCompatReport(engineA, engineB, personA, personB, compat) {
  const prompt = buildCompatPrompt(engineA, engineB, personA, personB, compat);
  return generateText(SYSTEM_PROMPT, prompt);
}

module.exports = { generateCompatReport };
