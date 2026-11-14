'use strict';
/* 쉬운 말 프롬프트로 연애 시기 리포트를 실제 생성해 docs/preview/love-generated-plain-*.json 으로 저장한다.
   generate-love-examples.js 와 같은 가상 입력·같은 기준일. 결제·이메일 발송 없음. 키는 출력하지 않는다.
   사용: node docs/preview/generate-love-plain-examples.js some|single */
const fs = require('fs'); const path = require('path');
const ENV = process.env.LOVE_ENV_FILE || 'C:\\Users\\leeyongsoo\\Desktop\\사주\\saju-webapp-main\\.env';
let loaded = false;
try { require('dotenv').config({ path: ENV }); loaded = true; } catch (e) { /* dotenv 없으면 직접 읽는다 */ }
if (!loaded || !process.env.ANTHROPIC_API_KEY) {
  for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(ANTHROPIC_API_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const { computeSaju } = require('../../src/engine');
const { generateLoveReading, toPlainText } = require('../../src/llm/loveTimingReading');
const { costUsd } = require('../../src/llm/client');
(async () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Local API configuration unavailable');
  const inputs = [['single', '지우', '여', 1995, 5, 15, 14, 'person'], ['some', '서연', '여', 1993, 8, 20, 9, 'action']];
  const only = process.argv[2];
  for (const [situation, name, gender, year, month, day, hour, readingFocus] of inputs) {
    if (only && situation !== only) continue;
    const birth = { year, month, day, hour, minute: 10, gender }; const engine = computeSaju(birth); const person = { name, gender };
    const start = Date.now();
    try {
      const reading = await generateLoveReading(engine, person, situation, new Date('2026-10-28T03:00:00Z'), { readingFocus });
      const report = toPlainText(reading);
      fs.writeFileSync(path.join(__dirname, 'love-generated-plain-' + situation + '.json'), JSON.stringify({ notice: '가상 인물로 실제 AI 생성한 검증 예시입니다(쉬운 말 프롬프트). 결제·이메일 발송 없음.', birth, person, reading, report }, null, 2));
      console.log(JSON.stringify({ situation, chars: report.length, seconds: Math.round((Date.now() - start) / 1000), costUsd: costUsd(reading.usage), usage: reading.usage, checks: (reading.checks || []).length }));
    } catch (e) { console.log(JSON.stringify({ situation, error: e.message })); }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
