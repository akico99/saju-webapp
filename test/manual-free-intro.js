'use strict';
/* 수동 확인용 — 실제 AI(가장 싼 모델)로 네 상품의 무료 소개를 한 건씩 만들어 문구·응답 시간·원가를 본다.
   실행: node test/manual-free-intro.js  (ANTHROPIC_API_KEY 필요, 호출 4~8건) */
const fi = require('../src/llm/freeIntro');
const { buildNewYearPreview } = require('../src/llm/newYearReading');
const { buildReunionPreview } = require('../src/engine/reunion');
const { buildCouplePreview } = require('../src/llm/coupleReading');
const { generateText } = require('../src/llm/client');

const A = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여', isLunar: false };
const B = { year: 1993, month: 2, day: 3, hour: null, minute: 0, gender: '남', isLunar: false };
const story = { since: 'm6', initiator: 'mutual', contact: 'cut' };
const cases = [
  ['연애', fi.loveFacts(A, '솔로')],
  ['신년운세', fi.newYearFacts({ ...B, hour: 9 }, buildNewYearPreview({ ...B, hour: 9 }).yearLine)],
  ['재회', (() => { const p = buildReunionPreview({ me: A, them: B, story }); return fi.reunionFacts(A, B, p.bond, p.story); })()],
  ['궁합', fi.coupleFacts(A, B, buildCouplePreview(A, B, 'dating', { a: '나', b: '그 사람' }))]
];
let usageAll = [];
fi.setGenerator(async (s, u, o) => { const r = await generateText(s, u, o); usageAll.push(r.usage); return r; });
(async () => {
  for (const [label, f] of cases) {
    usageAll = [];
    const t = Date.now();
    try {
      const r = await fi.getIntro(f, 'manual-' + label);
      const usage = usageAll.reduce((a, u) => ({ input_tokens: a.input_tokens + u.input_tokens, output_tokens: a.output_tokens + u.output_tokens }), { input_tokens: 0, output_tokens: 0 });
      console.log('\n=== ' + label + ' (' + (Date.now() - t) + 'ms, 호출 ' + usageAll.length + '회, 입력 ' + usage.input_tokens + ' / 출력 ' + usage.output_tokens + ' 토큰, $' + fi.introCostUsd(usage).toFixed(5) + ', ' + r.text.replace(/\s+/g, ' ').length + '자)');
      console.log(r.text);
    } catch (e) { console.log('\n=== ' + label + ' 실패: ' + e.message); }
  }
})();

