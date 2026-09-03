'use strict';
/* Anthropic SDK 래퍼 — 재시도 + 토큰/비용 로깅. 기본 모델은 claude-opus-5
   (2026-08 기준 최신 Opus, claude-api 스킬 기준 명시적 지정 없으면 이걸 씀). */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.SAJU_MODEL || 'claude-sonnet-5';

// claude-sonnet-5 공식 단가($/백만 토큰, platform.claude.com/docs/en/about-claude/pricing 기준).
// 모델을 바꾸면 이 값도 같이 바꿔야 원가 계산이 정확하다.
const PRICE_PER_MTOK = { input: 2, output: 10 };

/** 한 번의 API 응답 usage({input_tokens, output_tokens})를 달러 원가로 환산. */
function costUsd(usage) {
  if (!usage) return 0;
  return (usage.input_tokens * PRICE_PER_MTOK.input + usage.output_tokens * PRICE_PER_MTOK.output) / 1e6;
}

/** 여러 usage 객체(챕터별 등)를 하나로 합산 — 합산 후 costUsd에 그대로 넣을 수 있다. */
function sumUsage(usages) {
  return usages.filter(Boolean).reduce(
    (acc, u) => ({ input_tokens: acc.input_tokens + (u.input_tokens || 0), output_tokens: acc.output_tokens + (u.output_tokens || 0) }),
    { input_tokens: 0, output_tokens: 0 }
  );
}

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY가 설정되어 있지 않습니다. .env 파일을 확인하세요.');
    }
    client = new Anthropic();
  }
  return client;
}

/**
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {{maxRetries?: number}} opts
 * @returns {Promise<{text: string, usage: object}>}
 */
async function generateText(systemPrompt, userMessage, opts = {}) {
  const maxRetries = opts.maxRetries ?? 2;
  const c = getClient();
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await c.messages.create({
        model: MODEL,
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });
      // stop_reason이 'max_tokens'면 문장이 중간에 잘린 채 응답이 끝난 것 —
      // 실제로 챕터 14/16에서 발생해 "**집안 " 처럼 강조 마커가 안 닫힌 채 잘리는 걸
      // 확인했다. 조용히 잘린 텍스트를 반환하지 말고 재시도로 돌린다.
      if (response.stop_reason === 'max_tokens') {
        throw new Error('응답이 max_tokens에서 잘렸습니다(stop_reason=max_tokens)');
      }
      const textBlock = response.content.find(b => b.type === 'text');
      return {
        text: textBlock ? textBlock.text : '',
        usage: response.usage,
        stopReason: response.stop_reason
      };
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastErr;
}

module.exports = { generateText, MODEL, costUsd, sumUsage };
