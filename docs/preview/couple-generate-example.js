'use strict';
// 가상 커플 1건(연애 중)으로 실제 AI 생성 — 결제·이메일 발송 없음. 결과: docs/preview/couple-generated-dating.json
const fs = require('fs'); const path = require('path');
// 작업 폴더(worktree)에는 .env가 없어 본 저장소의 .env를 먼저 읽는다(키 값은 출력하지 않는다).
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
const { computeSaju } = require('../../src/engine');
const { generateCoupleReading, toPlainText } = require('../../src/llm/coupleReading');
const { costUsd, MODEL } = require('../../src/llm/client');
(async () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Local API configuration unavailable');
  const birthA = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여' };
  const birthB = { year: 1993, month: 11, day: 2, hour: null, minute: 0, gender: '남' };
  const people = { a: { name: '지우' }, b: { name: '민준' } };
  const relation = 'dating';
  const start = Date.now();
  const reading = await generateCoupleReading(computeSaju(birthA), computeSaju(birthB), people, relation, new Date('2026-10-28T03:00:00Z'));
  const report = toPlainText(reading);
  const seconds = Math.round((Date.now() - start) / 1000);
  const plain = report.replace(/[*#]/g, '').replace(/\s+/g, ' ').trim().length;
  fs.writeFileSync(path.join(__dirname, 'couple-generated-dating.json'), JSON.stringify({ notice: '가상 인물로 실제 AI 생성한 검증 예시입니다. 결제·이메일 발송 없음.', birthA, birthB, people, relation, model: MODEL, seconds, reading, report }, null, 2));
  console.log(JSON.stringify({ relation, model: MODEL, chars: report.length, plainChars: plain, seconds, usage: reading.usage, costUsd: costUsd(reading.usage) }));
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
