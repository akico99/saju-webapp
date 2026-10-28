'use strict';
// 가상 인물 한 명으로 2027 신년운세를 실제 AI로 만든다(결제·이메일 없음). 결과: newyear-generated-sample.json
const fs = require('fs'); const path = require('path');
const { computeSaju } = require('../../src/engine');
const { generateNewYearReading, toPlainText } = require('../../src/llm/newYearReading');
const { costUsd } = require('../../src/llm/client');
(async () => {
  if (!process.env.ANTHROPIC_API_KEY) require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Local API configuration unavailable');
  const birth = { year: 1990, month: 3, day: 8, hour: 7, minute: 20, gender: '남' };
  const person = { name: '도현', gender: '남' };
  const start = Date.now();
  const reading = await generateNewYearReading(computeSaju(birth), person);
  const report = toPlainText(reading);
  const body = report.replace(/^##.*$/gm, '').replace(/[*#]/g, '').replace(/\s+/g, ' ').trim();
  fs.writeFileSync(path.join(__dirname, 'newyear-generated-sample.json'), JSON.stringify({ notice: '가상 인물로 실제 AI 생성한 검증 예시입니다. 결제·이메일 발송 없음.', birth, person, reading, report }, null, 2));
  console.log(JSON.stringify({ chars: body.length, rawChars: report.length, seconds: Math.round((Date.now() - start) / 1000), costUsd: Number(costUsd(reading.usage).toFixed(4)), usage: reading.usage }));
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
