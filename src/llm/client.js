'use strict';
/* Anthropic SDK 래퍼 — 재시도 + 토큰/비용 로깅. 기본 모델은 claude-opus-5
   (2026-08 기준 최신 Opus, claude-api 스킬 기준 명시적 지정 없으면 이걸 씀). */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { notifyProviderOutage } = require('../email/providerAlert');
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

// 병렬 호출을 켜면 429가 정상적으로 발생한다. 지금까지는 그게 실패로 올라가 주문이 error가 되고
// 포인트가 환불됐다. SDK 재시도 횟수를 늘려 일시적인 한도 초과를 삼키게 한다.
const SDK_MAX_RETRIES = Number(process.env.SAJU_SDK_MAX_RETRIES || 4);
const MAX_BACKOFF_MS = 30000;

/* 실제 분당 한도는 티어마다 다르고 콘솔을 봐야 알 수 있다. 응답 헤더가 그 값을 알려주므로
   읽어서 보관한다. 병렬 동시성을 몇 개까지 열 수 있는지 판단하는 근거가 된다. */
const RATE_LIMIT_HEADERS = {
  outputLimit: 'anthropic-ratelimit-output-tokens-limit',
  outputRemaining: 'anthropic-ratelimit-output-tokens-remaining',
  outputReset: 'anthropic-ratelimit-output-tokens-reset',
  requestsLimit: 'anthropic-ratelimit-requests-limit',
  requestsRemaining: 'anthropic-ratelimit-requests-remaining'
};
let lastRateLimit = null;

/** Headers 객체든 평범한 객체든 같은 방식으로 헤더 하나를 읽는다. */
function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const hit = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return hit ? headers[hit] : null;
}

function readRateLimit(headers) {
  const out = {};
  let found = false;
  for (const [key, name] of Object.entries(RATE_LIMIT_HEADERS)) {
    const raw = headerValue(headers, name);
    if (raw == null) continue;
    found = true;
    out[key] = /^\d+$/.test(String(raw)) ? Number(raw) : String(raw);
  }
  return found ? out : null;
}

/** 처음 관측했을 때와 한도 자체가 바뀌었을 때만 한 줄 남긴다. 매 호출마다 찍지 않는다. */
function noteRateLimit(headers) {
  const rl = readRateLimit(headers);
  if (!rl) return;
  const isFirst = !lastRateLimit;
  const limitChanged = lastRateLimit && lastRateLimit.outputLimit !== rl.outputLimit;
  lastRateLimit = { ...rl, observedAt: new Date().toISOString() };
  if (isFirst || limitChanged) {
    console.log('[LLM] 분당 한도 — 출력 토큰 ' + (rl.outputLimit ?? '?') +
      ' (남은 ' + (rl.outputRemaining ?? '?') + '), 요청 ' + (rl.requestsLimit ?? '?'));
  }
}

/** 마지막으로 관측한 분당 한도. 병렬 동시성을 정할 때 읽는다. 관측 전이면 null. */
function getLastRateLimit() {
  return lastRateLimit;
}

/* 수동 재시도 대기 시간. SDK 재시도를 다 쓰고도 올라온 오류를 한 번 더 기다렸다 보낼 때 쓴다.
   서버가 retry-after를 줬으면 그 값을 따르고, 없으면 지수 백오프에 지터를 섞는다.
   지터가 없으면 병렬 호출들이 같은 순간에 한꺼번에 재시도해 다시 한도를 때린다. */
function retryDelayMs(error, attempt) {
  const headers = error && (error.headers || (error.response && error.response.headers));
  const ms = headerValue(headers, 'retry-after-ms');
  if (ms != null && Number.isFinite(Number(ms)) && Number(ms) >= 0) {
    return Math.min(Number(ms), MAX_BACKOFF_MS);
  }
  const after = headerValue(headers, 'retry-after');
  if (after != null) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
    const at = Date.parse(String(after));
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_BACKOFF_MS);
  }
  const base = Math.min(1000 * Math.pow(2, attempt), MAX_BACKOFF_MS);
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

let client = null;
function isPermanentProviderError(error) {
  const status = Number(error && error.status);
  return (status >= 400 && status < 500 && status !== 429) ||
    /credit balance|insufficient credits|purchase credits/i.test((error && error.message) || '');
}

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY가 설정되어 있지 않습니다. .env 파일을 확인하세요.');
    }
    // 429(rate limit)·5xx 재시도는 SDK에 맡긴다. SDK는 응답의 retry-after / retry-after-ms를
    // 존중하고 없으면 지수 백오프를 쓴다(core.js shouldRetry/retryRequest). 기본값 2회로는
    // 18챕터를 병렬로 돌릴 때 한도에 걸린 호출이 쉽게 소진되므로 늘려 잡는다.
    client = new Anthropic({ maxRetries: SDK_MAX_RETRIES });
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
      // withResponse()로 원본 HTTP 응답을 함께 받아 분당 한도 헤더를 읽는다.
      const { data: response, response: http } = await c.messages.create({
        model: MODEL,
        max_tokens: 12000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      }).withResponse();
      noteRateLimit(http && http.headers);
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
      // 잔액 부족·인증·잘못된 요청은 재시도해도 해결되지 않는다.
      // 특히 잔액 부족 오류를 3회 반복 호출하지 않도록 즉시 상위 작업에 전달한다.
      if (isPermanentProviderError(e)) {
        // 운영자에게 바로 알린다 — 고객이 먼저 겪고 운영자가 나중에 아는 상황을 막는다.
        notifyProviderOutage(e);
        break;
      }
      // 429는 여기까지 올라온 시점에 SDK가 이미 여러 번 재시도한 뒤다. 그래도 포기하지 않고
      // 서버가 알려준 대기 시간만큼 쉬었다 한 번 더 보낸다 — 주문을 실패로 만들지 않기 위해서다.
      if (e && e.headers) noteRateLimit(e.headers);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs(e, attempt)));
        continue;
      }
    }
  }
  throw lastErr;
}

module.exports = { generateText, MODEL, costUsd, sumUsage, isPermanentProviderError, getLastRateLimit, retryDelayMs };
