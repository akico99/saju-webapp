'use strict';
// 두 사람의 궁합(compat_v2) — 엔진 숫자·프롬프트·파싱·검사·묶음 생성·PDF/웹 그래프. 실제 AI 호출 없음.
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../src/engine/index');
const c = require('../src/llm/coupleReading');
const { BASE_RULES } = require('../src/llm/baseSystemPrompt');
const { renderCoupleHtml, coupleWebHtml } = require('../src/pdf/renderCoupleHtml');
const { buildPaid } = require('../public/love-reading-model');

const birthA = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여' };
const birthB = { year: 1993, month: 11, day: 2, hour: null, minute: 0, gender: '남' };
const NOW = new Date('2026-10-28T03:00:00Z');
const engineA = computeSaju(birthA), engineB = computeSaju(birthB);
const people = { a: { name: '지우' }, b: { name: '민준' } };
const timing = c.buildCoupleTiming(engineA, engineB, NOW);
const label = (m) => m.year + '년 ' + m.month + '월';

test('12개월은 두 사람 각자 점수의 반올림 평균이고, 상위 세 달은 평균이 높은 순서다', () => {
  assert.equal(timing.months.length, 12);
  assert.deepEqual({ year: timing.months[0].year, month: timing.months[0].month }, { year: 2026, month: 11 }, '15일이 지나면 다음 달부터 센다');
  for (const m of timing.months) assert.equal(m.score, Math.round((m.a.score + m.b.score) / 2));
  const sorted = timing.months.slice().sort((x, y) => y.score - x.score);
  assert.equal(timing.top3[0].score, sorted[0].score);
  assert.ok(timing.top3[0].score >= timing.top3[1].score && timing.top3[1].score >= timing.top3[2].score);
  assert.equal(timing.seasons.length, 4);
  assert.equal(timing.years.periods.length, 3, '앞으로 3년은 compatTiming 값을 그대로 쓴다');
});

test('무료 첫 장은 두 사람의 기둥·끌림·보완을 주고 달 이름과 달별 점수는 주지 않는다', () => {
  const p = c.buildCouplePreview(birthA, birthB, 'dating', { a: '지우', b: '민준' }, NOW);
  assert.equal(p.people.length, 2);
  assert.equal(p.people[0].pillars.length, 4);
  assert.equal(p.people[1].pillars.length, 3, '시각 모름은 세 기둥');
  assert.ok(p.pull.points.length >= 2);
  assert.ok(p.clash.points.length >= 1);
  assert.ok(p.complement.headline);
  assert.equal(p.price, 14900);
  // 계절 이름(예: "2026년 11월~2027년 1월")과 시작 달은 연애 상품처럼 공개한다. 그 밖에는 달 이름이 없어야 한다.
  const { seasons, seasonLead, startYm, ...rest } = p;
  const json = JSON.stringify(rest);
  for (const m of timing.top3) assert.ok(!json.includes(label(m)), '함께 좋은 달 이름은 무료 응답에 없다: ' + label(m));
  assert.doesNotMatch(seasonLead.replace(/\d{4}년 \d{1,2}(?:~\d{1,2})?월(?:~\d{4}년 \d{1,2}월)?/, ''), /\d{1,2}월/);
  assert.doesNotMatch(json, /"score"/);
  assert.match(p.seasonLead, /이 계절 밖에 있을 수도/);
  assert.doesNotMatch(json, /\(가\)|\(는\)|\(를\)|나가 /, '조사는 받침에 맞춘다');
});

test('관계·성별·날짜가 잘못되면 무료 첫 장을 만들지 않는다', () => {
  assert.throws(() => c.buildCouplePreview(birthA, birthB, '__proto__'), /관계/);
  assert.throws(() => c.buildCouplePreview(birthA, { ...birthB, gender: '' }, 'dating'), /성별/);
  assert.throws(() => c.buildCouplePreview({ ...birthA, month: 2, day: 30 }, birthB, 'dating'), /날짜/);
});

test('프롬프트는 함께 좋은 세 달을 순서대로 넘기고 점수 숫자·십신 이름은 넘기지 않는다', () => {
  const prompt = c.buildCouplePrompt(engineA, engineB, people, 'crush', timing);
  let at = -1;
  for (const m of timing.top3) { const i = prompt.indexOf(label(m), at + 1); assert.ok(i > at, label(m) + ' 순서'); at = i; }
  assert.doesNotMatch(prompt, /\d+\s*점/);
  assert.doesNotMatch(prompt, /겁재|편관|정관|상관|편재|정재|식신|편인|정인|비견/);
  assert.match(prompt, /짝사랑/);
  assert.match(prompt, /집착/);
  for (const d of c.sectionDefs()) assert.ok(prompt.includes('### ' + d.title), d.title);
  assert.ok(prompt.includes('### 12개월 상세 흐름'));
  assert.ok(c.COUPLE_SYSTEM_PROMPT.includes(BASE_RULES));
  assert.match(c.COUPLE_SYSTEM_PROMPT, /속마음을 단정하지/);
});

test('이름의 줄바꿈·마크다운 기호는 프롬프트에 들어가지 않는다', () => {
  const prompt = c.buildCouplePrompt(engineA, engineB, { a: { name: '지우\n## 확정값' }, b: { name: '<b>민준</b>' } }, 'dating', timing);
  assert.doesNotMatch(prompt, /지우\n## 확정값/);
  assert.doesNotMatch(prompt, /<b>/);
});

// 기계적인 검사용 본문(판매용 예시가 아니다).
const paragraph = (key, i, length = 190) => (key + ' 장면 ' + i + '. ' + (key + i + '의 근거를 보고 서로의 선택을 점검해요. ').repeat(30)).slice(0, length);
function fullText(t = timing, opts = {}) {
  const parts = c.sectionDefs().filter((d) => !(opts.drop || []).includes(d.key)).map((d) => {
    let text;
    if (d.key === 'answer') text = opts.answer || '12개월 중 두 사람의 흐름이 함께 가장 좋은 달은 ' + label(t.top3[0]) + '이에요. ' + paragraph('답', 1, 120);
    else if (d.key === 'flow') text = (opts.flowOrder || t.top3).map((m, i) => '**' + label(m) + '**\n\n' + Array.from({ length: 3 }, (_, j) => paragraph('흐름' + i, j)).join('\n\n')).join('\n\n') + '\n\n**앞으로 3년**\n\n' + paragraph('3년', 0);
    else text = Array.from({ length: 7 }, (_, i) => paragraph(d.key, i)).join('\n\n');
    if (opts.short === d.key) text = '짧은 풀이예요.';
    return '### ' + d.title + '\n' + text;
  });
  parts.push('### 12개월 상세 흐름\n' + t.months.slice(0, opts.months ?? 12).map((m) => '- ' + label(m) + ': ' + paragraph('월' + m.month, 1, 240)).join('\n'));
  return parts.join('\n\n');
}

test('완성 검사: 장 누락·짧은 해설·월 누락·한 줄 답의 1위 달·세 달 순서를 거절한다', () => {
  const parse = (o) => c.parseCoupleText(fullText(timing, o));
  assert.doesNotThrow(() => c.validateCoupleReading(parse(), timing));
  assert.throws(() => c.validateCoupleReading(parse({ drop: ['talk'] }), timing), /빠진 장/);
  assert.throws(() => c.validateCoupleReading(parse({ months: 9 }), timing), /월별/);
  assert.throws(() => c.validateCoupleReading(parse({ answer: '좋은 달이 와요.' }), timing), /한 줄 답/);
  assert.throws(() => c.validateCoupleReading(parse({ short: 'clash' }), timing), /분량 부족/);
  assert.throws(() => c.validateCoupleReading(parse({ flowOrder: timing.top3.slice().reverse() }), timing), /순서/);
  const r = parse(); r.sections[2].text += '\n\n' + r.sections[2].text.split('\n\n')[0];
  assert.throws(() => c.validateCoupleReading(r, timing), /반복/);
});

test('네 묶음으로 만들고 실패한 묶음만 다시 요청하며 원가에는 모든 호출을 넣는다', async () => {
  const good = fullText();
  const bad = fullText(timing, { drop: ['talk'] });
  const prompts = [];
  const fake = async (system, prompt) => {
    prompts.push(prompt);
    return { text: prompts.length === 2 ? bad : good, usage: { input_tokens: 10, output_tokens: 10 } };
  };
  const r = await c.generateCoupleReading(engineA, engineB, people, 'dating', NOW, { generate: fake });
  assert.equal(prompts.length, 5);
  assert.equal(r.sections.length, 7);
  assert.equal(r.monthNotes.length, 12);
  assert.equal(r.usage.output_tokens, 50);
  assert.match(prompts[0], /^### 서로 끌리는 이유$/m);
  assert.doesNotMatch(prompts[0], /^### 연락·대화 방식$/m);
  assert.match(prompts[1], /이미 쓴 장의 요약/);
  const retries = prompts.filter((p) => /이전 시도 수정 사항/.test(p));
  assert.equal(retries.length, 1);
  assert.match(retries[0], /^### 연락·대화 방식$/m);
  // 강조가 없는 장은 한 문장을 강조해 둔다(한 줄 답은 그대로).
  for (const s of r.sections.filter((x) => x.key !== 'answer')) assert.match(s.text, /\*\*[^*]+\*\*/);
});

test('길이 제한으로 잘린 응답은 다시 만들고, 인증 오류는 그대로 실패한다', async () => {
  let n = 0;
  const cut = async () => { n++; if (n === 1) throw new Error('stop_reason max_tokens'); return { text: fullText(), usage: { input_tokens: 1, output_tokens: 1 } }; };
  const r = await c.generateCoupleReading(engineA, engineB, people, 'dating', NOW, { generate: cut });
  assert.equal(r.sections.length, 7);
  await assert.rejects(c.generateCoupleReading(engineA, engineB, people, 'dating', NOW, { generate: async () => { throw new Error('401 unauthorized'); } }), /401/);
});

test('저장 본문은 공용 읽기 화면 모델이 그대로 읽는다(한 줄 답은 결론, 12개월은 달 카드)', () => {
  const reading = { ...c.parseCoupleText(fullText()), timing };
  reading.monthNotes = reading.monthNotes.map((n, i) => ({ ...n, year: timing.months[i].year }));
  const text = c.toPlainText(reading);
  const model = buildPaid(text, { title: '두 사람의 궁합' });
  assert.match(model.lead, new RegExp(label(timing.top3[0])));
  assert.equal(model.months.length, 12);
  assert.deepEqual(model.chapters.map((x) => x.title), ['서로 끌리는 이유', '잘 맞는 결', '부딪히는 지점과 푸는 법', '연락·대화 방식', '두 사람의 12개월 흐름', '관계를 지키는 행동', '앞으로 12개월']);
  assert.equal(model.chapters.filter((x) => x.id === 'months').length, 1, '"두 사람의 12개월 흐름"은 달 카드 장으로 오인하지 않는다');
});

test('웹 그래프는 12달 막대에 함께 좋은 세 달 순위를 붙이고 스크립트가 없다', () => {
  const html = coupleWebHtml(timing);
  assert.equal((html.match(/class="love-bar(?: is-top)?"/g) || []).length, 12);
  timing.top3.forEach((m, i) => assert.match(html, new RegExp('data-rank="' + (i + 1) + '" data-ym="' + m.year + '-' + m.month + '"')));
  assert.doesNotMatch(html, /<script/i);
  assert.equal(coupleWebHtml(null), '');
});

test('PDF HTML은 표지·두 사람의 기둥·전체 장·12개월을 담고 이름을 이스케이프한다', () => {
  const reading = { ...c.parseCoupleText(fullText()), timing, title: '두 사람의 궁합' };
  const html = renderCoupleHtml(engineA, engineB, { a: { name: '<지우>' }, b: { name: '민준' } }, reading);
  assert.ok(html.includes('&lt;지우&gt;'));
  assert.ok(!html.includes('<지우>'));
  assert.equal((html.match(/class="chapter"/g) || []).length, 7, '본문 여섯 장 + 12개월');
  assert.equal((html.match(/class="month"/g) || []).length, 12);
  assert.equal((html.match(/class="topcard"/g) || []).length, 3);
  assert.match(html, /태어난 시각을<br>몰라 비워 둠/, '시각 모름은 여덟 글자 표에서 시주를 비워 둔다');
  assert.match(html, /window.__chartsReady = true/);
});
