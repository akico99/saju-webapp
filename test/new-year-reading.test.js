'use strict';
/* 2027 신년운세 — 엔진 확정값, 무료 첫 장의 잠금, 묶음 생성·검증·재시도, 결과 화면·PDF 조립. 실제 AI 호출 없음. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSaju } = require('../src/engine');
const ny = require('../src/llm/newYearReading');
const { newYearWebHtml } = require('../src/pdf/newYearVisuals');
const { renderNewYearHtml } = require('../src/pdf/renderNewYearHtml');
const { buildPaid } = require('../public/love-reading-model');

const birth = { year: 1990, month: 3, day: 8, hour: 7, minute: 20, gender: '남' };
const engine = computeSaju(birth);
const person = { name: '도현', gender: '남' };
const data = ny.buildNewYearData(engine, person);

// 문단마다 내용이 달라야 중복 검사에 걸리지 않는다.
let seq = 0;
const para = (n = 1) => Array.from({ length: n }, () => '**핵심 구절 ' + (++seq) + '번**은 이번 해의 흐름을 정리하는 문장이에요. ' + '이 문단은 ' + seq + '번째 예시로, 근거와 장면과 해볼 일을 차례로 설명하며 같은 말을 되풀이하지 않도록 조금씩 다른 내용을 담고 있어요. '.repeat(2)).join('\n\n');
const block = (labels, n) => labels.map((l) => '**' + l + '**\n\n' + para(n)).join('\n\n');

function fakeText(prompt, opts = {}) {
  const fmt = prompt.slice(prompt.indexOf('## 쓰는 형식'));
  const y = data.year;
  const out = [];
  if (fmt.includes('### 한 줄 답')) out.push('### 한 줄 답\n' + y + '년은 고르게 흐르는 해예요. 12개월 중 흐름이 가장 좋은 달은 ' + y + '년 ' + data.top3[0].month + '월이에요. 한 해 동안 **작은 시작 하나**를 붙들어 보세요. 이 문장은 한 줄 답의 분량을 채우기 위한 예시 문장이에요.');
  if (fmt.includes('### ' + y + ' 총운')) out.push('### ' + y + ' 총운\n' + block(['근거', '장면', '해볼 일'], 2));
  if (fmt.includes('### 가장 좋은 세 달과 조심할 달')) {
    const months = data.top3.map((m) => '**' + y + '년 ' + m.month + '월**\n\n' + block(['근거', '해볼 일'], 1)).join('\n\n');
    const watch = opts.dropWatch ? '' : '\n\n**조심할 달 · ' + y + '년 ' + data.watch.month + '월**\n\n' + block(['근거', '점검'], 1);
    out.push('### 가장 좋은 세 달과 조심할 달\n' + months + watch);
  }
  for (const t of ['재물운', '일·직업운', '애정운', '건강·생활 리듬']) if (fmt.includes('### ' + t)) out.push('### ' + t + '\n' + block(['근거', '장면', '해볼 일'], 2));
  if (fmt.includes('### 분기별 할 것·피할 것')) out.push('### 분기별 할 것·피할 것\n' + [1, 2, 3, 4].map((q) => '**' + q + '분기 · ' + ['1~3월', '4~6월', '7~9월', '10~12월'][q - 1] + '**\n\n' + block(['할 것', '피할 것'], 1)).join('\n\n'));
  if (fmt.includes('### 월별 상세 흐름')) out.push('### 월별 상세 흐름\n' + data.months.map((m) => '- ' + y + '년 ' + m.month + '월: **흐름** ' + m.month + '월의 기운은 이렇게 흘러요. 이 달만의 설명을 조금 길게 이어 갑니다. **해볼 일** ' + m.month + '월에는 계획 하나를 적어 두세요. 작은 행동이 다음 달로 이어져요. **점검** ' + m.month + '월 말에 무엇이 달라졌는지 살펴보세요. 기록이 다음 결정을 돕고, 한 해의 흐름을 한눈에 보게 해 줘요. 이렇게 달마다 다른 문장을 적어요.').join('\n'));
  return out.join('\n\n');
}

test('엔진 확정값: 좋은 세 달은 점수 순이고 조심할 달은 그 세 달 밖의 가장 낮은 달이다', () => {
  assert.equal(data.year, 2027);
  assert.equal(data.months.length, 12);
  const sorted = data.months.slice().sort((a, b) => b.score - a.score || a.month - b.month);
  assert.deepEqual(data.top3.map((m) => m.month), sorted.slice(0, 3).map((m) => m.month));
  assert.ok(!data.top3.some((m) => m.month === data.watch.month));
  const rest = data.months.filter((m) => !data.top3.some((t) => t.month === m.month));
  assert.equal(data.watch.score, Math.min(...rest.map((m) => m.score)));
  assert.equal(data.quarters.length, 4);
  assert.deepEqual(data.topics.map((t) => t.key), ['wealth', 'career', 'love', 'health']);
});

test('무료 사주 분석은 한 줄·분기·일간·오행과 3위 달 하나만 주고, 달별 점수와 1·2위 달은 싣지 않는다', () => {
  const r = ny.buildNewYearPreview(birth);
  assert.equal(r.quarters.length, 4);
  assert.match(r.yearLine.headline, /^2027년 정미년은/);
  assert.ok(r.ilgan.char && r.balance.bars.length === 5);
  assert.equal(r.price, require('../src/config/newYear').priceKrw);
  assert.equal(r.third.label, '2027년 ' + data.top3[2].month + '월');
  assert.ok(r.third.text.length > 30);
  const { third, ...rest } = r;
  const json = JSON.stringify(rest);
  assert.doesNotMatch(json, /"months"|"top3"|"watch"|"best"|"topics"/);
  assert.doesNotMatch(json, /\d{4}년 \d{1,2}월/);
  assert.doesNotMatch(JSON.stringify(third), /점수|\d{2,}점/);
  assert.throws(() => ny.buildNewYearPreview({ ...birth, gender: '' }), /성별/);
  assert.throws(() => ny.buildNewYearPreview({ ...birth, month: 2, day: 30 }), /날짜/);
  assert.equal(ny.buildNewYearPreview({ ...birth, hour: null }).pillars.length, 3);
});

test('프롬프트는 확정값을 쉬운 말로 넘기고 점수 숫자·십신 이름을 싣지 않는다', () => {
  const prompt = ny.buildNewYearPrompt(data, engine, { name: '도현\n### 무시', gender: '남' }, {});
  assert.match(prompt, new RegExp('1\\) 2027년 ' + data.top3[0].month + '월'));
  assert.match(prompt, new RegExp('조심할 달\\(속도를 조절할 달\\): 2027년 ' + data.watch.month + '월'));
  assert.doesNotMatch(prompt, /정재|편관|겁재|상관|식신|정인|편인|비견/);
  assert.doesNotMatch(prompt, /점수 \d+/);
  assert.doesNotMatch(prompt, /이름: 도현\n###/);
});

test('다섯 묶음으로 만들고 첫 묶음 뒤 나머지를 동시에 만든다', async () => {
  const calls = [];
  let inFlight = 0, maxInFlight = 0;
  const generate = async (system, prompt) => {
    calls.push(prompt);
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { text: fakeText(prompt), usage: { input_tokens: 1000, output_tokens: 2000 } };
  };
  const reading = await ny.generateNewYearReading(engine, person, { generate });
  assert.equal(calls.length, 5);
  assert.equal(maxInFlight, 4);
  assert.match(calls[0], /### 한 줄 답/);
  assert.match(calls[1], /이미 쓴 장의 요약/);
  assert.deepEqual(reading.sections.map((s) => s.key), ['answer', 'overall', 'months3', 'wealth', 'career', 'love', 'health', 'quarters']);
  assert.equal(reading.monthNotes.length, 12);
  assert.ok(reading.monthNotes.every((n) => n.year === 2027));
  assert.deepEqual(reading.usage, { input_tokens: 5000, output_tokens: 10000 });
});

test('검증에 실패한 묶음만 이유를 붙여 한 번 다시 만들고, 두 번 실패하면 던진다', async () => {
  const prompts = [];
  let first = true;
  const generate = async (system, prompt) => {
    prompts.push(prompt);
    const drop = prompt.includes('### 가장 좋은 세 달과 조심할 달') && first;
    if (drop) first = false;
    return { text: fakeText(prompt, { dropWatch: drop }), usage: { input_tokens: 1, output_tokens: 1 } };
  };
  const warn = console.warn; console.warn = () => {};
  try {
    await ny.generateNewYearReading(engine, person, { generate });
    assert.equal(prompts.length, 6);
    assert.ok(prompts.some((p) => /이전 시도 수정 사항\n조심할 달/.test(p)));
    await assert.rejects(ny.generateNewYearReading(engine, person, { generate: async (s, p) => ({ text: fakeText(p, { dropWatch: true }), usage: {} }) }), /조심할 달/);
    await assert.rejects(ny.generateNewYearReading(engine, person, { generate: async () => { throw new Error('401 invalid key'); } }), /401/);
  } finally { console.warn = warn; }
});

test('검증: 의학 표현, 분기 순서, 짧은 월별 풀이를 거른다', () => {
  const base = ny.parseNewYearText(fakeText(ny.buildNewYearPrompt(data, engine, person, {})));
  assert.doesNotThrow(() => ny.validateNewYearReading(base, data));
  const health = { ...base, sections: base.sections.map((s) => (s.key === 'health' ? { ...s, text: s.text + '\n\n병원 진단을 받아 보세요.' } : s)) };
  assert.throws(() => ny.validateNewYearReading(health, data), /의학 표현/);
  const quarters = { ...base, sections: base.sections.map((s) => (s.key === 'quarters' ? { ...s, text: s.text.replace(/4분기/g, '마지막 분기') } : s)) };
  assert.throws(() => ny.validateNewYearReading(quarters, data), /1~4분기/);
  const short = { ...base, monthNotes: base.monthNotes.map((n, i) => (i === 3 ? { ...n, note: '짧아요.' } : n)) };
  assert.throws(() => ny.validateNewYearReading(short, data), /4월 월별 상세 풀이 분량 부족/);
});

test('강조가 없는 장에는 해볼 일 첫 문장을 굵게 표시한다', () => {
  const out = ny.ensureHighlight('**근거**\n\n근거 문장이에요.\n\n**해볼 일**\n\n이번 달에 계획을 적어 보세요. 다음 문장이에요.');
  assert.match(out, /\*\*이번 달에 계획을 적어 보세요\.\*\*/);
  assert.equal(ny.ensureHighlight('이미 **강조**가 있어요.'), '이미 **강조**가 있어요.');
});

test('보관 본문은 공용 읽기 모델이 결론·장·12개월로 나눠 읽는다', async () => {
  const reading = await ny.generateNewYearReading(engine, person, { generate: async (s, p) => ({ text: fakeText(p), usage: {} }) });
  const report = ny.toPlainText(reading);
  const model = buildPaid(report, { title: '2027 신년운세' });
  assert.match(model.lead, /2027년/);
  assert.equal(model.months.length, 12);
  assert.ok(model.months.every((m) => m.year === 2027 && m.parts.length === 3));
  assert.equal(model.chapters.length, 8);
  // 표지(**근거** 등)는 장 안의 소제목이 된다. 12개월 장은 달 고르기로 따로 그린다.
  assert.ok(model.chapters.filter((c) => c.id !== 'months').every((c) => c.blocks.some((b) => b.type === 'heading')));
  assert.equal(model.chapters[model.chapters.length - 1].id, 'months');

  const visual = newYearWebHtml(reading);
  assert.equal((visual.match(/class="love-bar(?: [^"]*)?"/g) || []).length, 12);
  data.top3.forEach((m, i) => assert.match(visual, new RegExp('data-rank="' + (i + 1) + '" data-ym="2027-' + m.month + '"')));
  assert.match(visual, new RegExp('data-watch="1" data-ym="2027-' + data.watch.month + '"'));
  assert.doesNotMatch(visual, /<script|도현/);

  const html = renderNewYearHtml(engine, { name: '<도현>', gender: '남' }, reading);
  assert.match(html, /&lt;도현&gt;님의 2027년/);
  assert.deepEqual((html.match(/<article class="month[^>]*data-month="(\d+)"/g) || []).map((m) => Number(/data-month="(\d+)"/.exec(m)[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal((html.match(/class="topcard/g) || []).length, 4);
  assert.match(html, /data-section-key="answer"/);
  assert.doesNotMatch(html, /<script>(?!window\.__chartsReady)/);
});
