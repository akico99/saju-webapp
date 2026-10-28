/* 「다시, 우리」 실제 AI 생성 검증 — 가상 인물 두 쌍(연락 끊김 / 차단됨). 결제·이메일 없음.
   node docs/preview/generate-reunion-examples.js [cut|blocked] */
const fs = require('fs'); const path = require('path');
// 작업 트리(.worktrees/...)에는 .env가 없다. 저장소 본체의 .env를 먼저 읽는다(client.js는 이미 있는 값을 덮지 않는다).
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });
const { computeSaju } = require('../../src/engine');
const { generateReunionReading, toPlainText, checkSafety } = require('../../src/llm/reunionReading');
const { costUsd } = require('../../src/llm/client');
const CASES = {
  cut: { me: { name: '지우', birth: { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여' } }, them: { name: '민준', birth: { year: 1993, month: 11, day: 2, hour: null, minute: 0, gender: '남' } }, story: { since: 'm6', initiator: 'mutual', contact: 'cut' } },
  blocked: { me: { name: '도윤', birth: { year: 1992, month: 9, day: 23, hour: 21, minute: 10, gender: '남' } }, them: { name: '서연', birth: { year: 1994, month: 3, day: 8, hour: 9, minute: 0, gender: '여' } }, story: { since: 'y1', initiator: 'them', contact: 'blocked' } }
};
(async () => {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Local API configuration unavailable');
  const only = process.argv[2];
  for (const [kind, c] of Object.entries(CASES)) {
    if (only && kind !== only) continue;
    const a = computeSaju(c.me.birth), b = computeSaju(c.them.birth);
    const people = { me: { name: c.me.name, gender: c.me.birth.gender }, them: { name: c.them.name, gender: c.them.birth.gender } };
    const start = Date.now();
    try {
      const reading = await generateReunionReading(a, b, people, c.story, new Date('2026-10-28T03:00:00Z'));
      const report = toPlainText(reading);
      fs.writeFileSync(path.join(__dirname, 'reunion-generated-' + kind + '.json'), JSON.stringify({ notice: '가상 인물로 실제 AI 생성한 검증 예시입니다. 결제·이메일 발송 없음.', case: c, people, reading, report }, null, 2));
      const body = report.replace(/[*#]/g, '').replace(/\s+/g, ' ');
      console.log(JSON.stringify({ kind, boundary: reading.boundary, chars: body.length, seconds: Math.round((Date.now() - start) / 1000), costUsd: Number(costUsd(reading.usage).toFixed(4)), usage: reading.usage, safety: checkSafety(report, reading.boundary) }));
    } catch (e) { console.log(JSON.stringify({ kind, error: e.message, seconds: Math.round((Date.now() - start) / 1000) })); }
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
