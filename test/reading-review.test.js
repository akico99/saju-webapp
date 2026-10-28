'use strict';
/* 유료 풀이 검토 로직 — 숨김 근거 줄, 사실 대조(factCheck), 검토 기록·관리자 화면, 기준 사주 묶음. 실제 AI는 부르지 않는다. */
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
process.env.SAJU_DB_PATH = path.join(os.tmpdir(), 'reading-review-' + process.pid + '.db');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { computeSaju } = require('../src/engine/index');
const { buildLoveTiming } = require('../src/engine/loveTiming');
const { generateLoveReading, toPlainText, sectionDefs, buildLovePrompt } = require('../src/llm/loveTimingReading');
const { renderLoveHtml } = require('../src/pdf/renderLoveHtml');
const { splitEvidence, evidenceByKey } = require('../src/llm/readingReview');
const { buildFacts, factCheck } = require('../src/llm/factCheck');
const { buildRecord } = require('../src/server/reviewRecord');
const db = require('../src/db/index');
const reviews = require('../src/db/reviews');
const { loadGolden, scoreCase, renderReport } = require('../scripts/golden-run');

const O = '<' + '!--', C = '--' + '>';
const ev = (s) => O + ' 근거: ' + s + ' ' + C;
const birth = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여', isLunar: false };
const engine = computeSaju(birth);
const FIXED = new Date('2026-10-10T03:00:00Z');
const timing = buildLoveTiming(engine, '여', FIXED);
const person = { name: '수달이', gender: '여' };
const fire = engine.counts.ohaeng['火'];

test('숨김 근거 줄은 본문에서 빠지고 장 key별로 모인다(닫히지 않은 줄도 지운다)', () => {
  const raw = ['### 한 줄 답', '답이에요.', ev('배우자 자리에 든 기운, 불(火) 3개'), '', '### 💌 인연 신호가 강한 세 달 (강한 순서)', '세 달', ev('2026년 11월 두 기운'),
    '', '### 월별 상세 흐름', '- 2026년 11월: 흐름', ev('12개월 점수'), '', '### 모르는 제목', ev('버림'), O + ' 근거: 잘린 줄'].join('\n');
  const { text, notes } = splitEvidence(raw);
  assert.ok(!text.includes(O) && !/근거:/.test(text));
  assert.match(text, /### 한 줄 답\n답이에요\.\n\n### 💌/);
  const byKey = evidenceByKey(notes, sectionDefs('single'));
  assert.deepEqual(byKey, { answer: '배우자 자리에 든 기운, 불(火) 3개', top: '2026년 11월 두 기운', months: '12개월 점수' });
  assert.deepEqual(splitEvidence('### 한 줄 답\n그냥 본문').notes, []);
});

test('프롬프트는 장마다 숨김 근거 줄을 요구하되 십신 이름은 넘기지 않는다', () => {
  const prompt = buildLovePrompt(engine, person, 'single', timing);
  assert.ok(prompt.includes(O + ' 근거: ... ' + C));
  assert.doesNotMatch(prompt, /겁재|식신|상관|편관|정관|편재|정재|편인|정인|비견/);
});

test('factCheck: 틀린 오행 개수·일간·강한 달 순위는 오류, 없는 십신·범위 밖 날짜는 경고', () => {
  const facts = buildFacts({ engines: [engine], months: timing.months, ranked: timing.top3, rankSections: ['answer', 'top'] });
  const top = timing.top3[0], second = timing.top3[1];
  const wrongTop = timing.months.find((m) => m.month !== top.month);
  const bad = factCheck({ sections: [
    { key: 'answer', text: '12개월 중 인연 신호가 가장 강한 달은 **' + wrongTop.year + '년 ' + wrongTop.month + '월**이에요.' },
    { key: 'drawn', text: '불(火)이 ' + (fire + 4) + '개라 뜨거워요. 일간은 壬이라 물처럼 흘러요. 일간이 경금이에요.' },
    { key: 'where', text: (timing.months[0].year + 1) + '년 ' + timing.months[0].month + '월에도 기회가 있어요.' }
  ] }, facts);
  assert.deepEqual(bad.errors.map((e) => e.kind).sort(), ['ilgan', 'ilgan', 'ohaeng', 'rank']);
  assert.ok(bad.errors.every((e) => e.message && e.quote));
  assert.deepEqual(bad.warnings.map((w) => w.kind), ['date']);

  const absent = ['식신', '편재', '정관', '편인'].find((n) => !facts.shipsin.has(n));
  const ok = factCheck({ sections: [
    { key: 'answer', text: '인연 신호가 가장 강한 달은 ' + top.year + '년 ' + top.month + '월, 두 번째로 강한 달은 ' + second.year + '년 ' + second.month + '월이에요.' },
    { key: 'drawn', text: '불이 ' + fire + '개예요. 일간은 丙이에요. 선물이 2개 있어요. 상관없이 다가가도 돼요. 기운이 강한 편인 사람이라 1995년 5월 15일 생일도 괜찮아요.' },
    { key: 'top', text: '재물운이 가장 좋은 달은 3월이에요. 지우님에게 가장 좋은 달은 2월이에요.' }
  ] }, facts);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  const absentShinsal = ['홍염', '도화', '괴강', '원진'].find((n) => !facts.shinsal.has(n));
  const warn = factCheck({ sections: [{ key: 'pattern', text: (absent ? absent + '이 강해요. ' : '') + absentShinsal + '살이 있어요.' }] }, facts);
  assert.deepEqual(warn.errors, []);
  assert.deepEqual(warn.warnings.map((w) => w.kind).sort(), (absent ? ['shinsal', 'shipsin'] : ['shinsal']));
});

test('두 사람 상품은 둘 중 하나와 맞으면 맞은 것으로 보고, 시각 모름이면 오행 개수는 경고로 낮춘다', () => {
  const other = computeSaju({ year: 1993, month: 11, day: 2, hour: null, minute: 0, gender: '남' });
  const facts = buildFacts({ engines: [engine, other], months: timing.months });
  const r = factCheck({ sections: [{ key: 'attract', text: '그 사람의 일간은 ' + other.ilgan.char + '이에요. 불이 ' + other.counts.ohaeng['火'] + '개예요. 물이 9개예요.' }] }, facts);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings.map((w) => w.kind), ['ohaeng']);
});

// 기계적으로 만든 검증용 본문(사용자에게 파는 문장이 아님). love-timing-reading.test.js의 fixture와 같은 꼴에 근거 줄을 단다.
const paragraph = (key, i, length = 190) => key + ' 장면 ' + i + '. ' + (key + i + '의 흐름을 보고 선택을 점검해요. ').repeat(30).slice(0, length);
function fullText(t, { inject } = {}) {
  const parts = sectionDefs('single').map((d) => {
    let text;
    if (d.key === 'answer') text = '가장 강한 달은 ' + t.top3[0].year + '년 ' + t.top3[0].month + '월이에요. ' + paragraph('답', 1, 120);
    else if (d.key === 'top') text = t.top3.map((m, i) => '**' + m.year + '년 ' + m.month + '월**\n\n' + Array.from({ length: 4 }, (_, j) => paragraph('시기' + i, j)).join('\n\n')).join('\n\n');
    else text = Array.from({ length: 7 }, (_, i) => paragraph(d.key, i)).join('\n\n');
    if (inject && inject.key === d.key) text = inject.sentence + ' ' + text;
    return '### ' + d.title + '\n' + text + '\n' + ev(d.key + ' 근거, 불(火) ' + fire + '개');
  });
  parts.push('### 월별 상세 흐름\n' + t.months.map((m) => '- ' + m.year + '년 ' + m.month + '월: ' + paragraph('월' + m.month, 1, 260)).join('\n') + '\n' + ev('12개월 흐름 자료'));
  return parts.join('\n\n');
}
const usage = { input_tokens: 1, output_tokens: 1 };

test('생성 결과는 장별 근거를 따로 보관하고 본문·저장용 텍스트·PDF HTML에는 숨김 줄이 없다', async () => {
  const r = await generateLoveReading(engine, person, 'single', FIXED, { generate: async () => ({ text: fullText(timing), usage }) });
  assert.deepEqual(Object.keys(r.evidence).sort(), [...sectionDefs('single').map((d) => d.key), 'months'].sort());
  assert.equal(r.evidence.drawn, 'drawn 근거, 불(火) ' + fire + '개');
  assert.deepEqual(r.checks, []);
  for (const out of [toPlainText(r), renderLoveHtml(engine, person, r), JSON.stringify(r.sections), JSON.stringify(r.monthNotes)]) {
    assert.ok(!out.includes(O) && !/\w+ 근거, 불/.test(out));
  }
});

test('틀린 사실 진술은 그 묶음만 한 번 다시 만들고, 고쳐지지 않으면 실패 대신 오류 경고로 남긴다', async () => {
  const wrong = { key: 'drawn', sentence: '불(火)이 ' + (fire + 5) + '개라 뜨거운 사람이에요.' };
  const prompts = [];
  const fixedOnRetry = async (system, prompt) => {
    prompts.push(prompt);
    const retry = /사주 자료와 다른 진술/.test(prompt);
    return { text: fullText(timing, { inject: retry ? null : wrong }), usage };
  };
  const ok = await generateLoveReading(engine, person, 'single', FIXED, { generate: fixedOnRetry });
  assert.equal(prompts.length, 5, '네 묶음 + 관계 묶음 재시도 1회');
  assert.match(prompts[1], /불\(火\)|화 개수/);
  assert.deepEqual(ok.checks.filter((c) => c.level === 'error'), []);

  prompts.length = 0;
  const stubborn = async (system, prompt) => { prompts.push(prompt); return { text: fullText(timing, { inject: wrong }), usage }; };
  const kept = await generateLoveReading(engine, person, 'single', FIXED, { generate: stubborn });
  assert.equal(prompts.length, 5, '재시도 한도(1회)를 늘리지 않는다');
  const errs = kept.checks.filter((c) => c.level === 'error');
  assert.equal(errs.length, 1);
  assert.equal(errs[0].section, 'drawn');
  assert.equal(errs[0].kind, 'ohaeng');
});

function seedOrder(email, jobId, productKey) {
  const u = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, 'x');
  db.prepare("INSERT INTO orders (user_id, product_key, job_id, status, finished_at) VALUES (?, ?, ?, 'done', datetime('now'))").run(u.lastInsertRowid, productKey, jobId);
  return u.lastInsertRowid;
}

test('검토 기록은 이름·생년월일·이메일을 가리고 표의 생년월일 줄을 빼며, 판정·요약·탈퇴 삭제가 동작한다', async () => {
  const later = (timing.months[0].year + 1) + '년 ' + timing.months[0].month + '월'; // 12개월 범위 바로 다음 달
  const r = await generateLoveReading(engine, person, 'single', FIXED, { generate: async () => ({ text: fullText(timing, { inject: { key: 'where', sentence: '수달이님, 1995년 5월 15일생 a@b.co 에게 ' + later + '도 좋아요.' } }), usage }) });
  const rec = buildRecord(r, { engines: [engine], names: [person.name] });
  const all = JSON.stringify(rec);
  assert.doesNotMatch(all, /수달이|1995년 5월 15일|a@b\.co|sc-basis/);
  assert.match(all, /○○님/);
  assert.match(rec.evidence.charts[0], /saju-chart/);
  assert.ok(rec.evidence.sections.find((s) => s.key === 'months').evidence);

  const userId = seedOrder('review1@test.local', 'job-review-1', 'love_timing');
  reviews.saveReading('job-review-1', rec.evidence, rec.checks);
  const got = reviews.getReading('job-review-1');
  assert.equal(got.productKey, 'love_timing');
  assert.equal(got.evidence.sections.length, 9);
  reviews.saveMark('job-review-1', 'drawn', 'wrong', '배우자 자리 해석이 반대');
  reviews.saveMark('job-review-1', 'drawn', 'ok', '다시 보니 맞음');
  reviews.saveMark('job-review-1', 'top', 'wrong', '');
  assert.throws(() => reviews.saveMark('job-review-1', 'top', 'maybe'), /verdict/);
  assert.throws(() => reviews.saveMark('없는-주문', 'top', 'ok'), /검토 기록/);
  const sum = reviews.summary().filter((x) => x.productKey === 'love_timing');
  assert.deepEqual(sum.find((x) => x.sectionKey === 'drawn'), { productKey: 'love_timing', sectionKey: 'drawn', ok: 1, unclear: 0, wrong: 0, autoErrors: 0, autoWarnings: 0, judged: 1, wrongRate: 0 });
  assert.equal(sum.find((x) => x.sectionKey === 'top').wrongRate, 1);
  assert.equal(sum.find((x) => x.sectionKey === 'where').autoWarnings, 1);
  assert.deepEqual(reviews.sample({ perProduct: 5 }).map((s) => s.jobId), ['job-review-1']);

  // 실제 서버처럼 모든 DB 모듈(각자 표를 만든다)을 불러온 뒤 탈퇴를 실행한다.
  for (const f of fs.readdirSync(path.join(__dirname, '../src/db'))) if (f.endsWith('.js')) require('../src/db/' + f);
  const { deleteAccount } = require('../src/db/accountDeletion');
  const out = deleteAccount(userId, { removeDir: () => {} });
  assert.equal(out.ok, true);
  assert.equal(reviews.getReading('job-review-1'), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM reading_review_marks WHERE job_id = 'job-review-1'").get().n, 0);
});

function startServer() {
  const child = spawn(process.execPath, ['-e', "const app = require('./src/server/app'); const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ADMIN_PASSWORD: 'review-pass', SAJU_DB_PATH: process.env.SAJU_DB_PATH },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
    child.stdout.on('data', (d) => { out += d; const m = /PORT (\d+)/.exec(out); if (m) resolve({ child, port: Number(m[1]) }); });
  });
}

test('관리자 검토 API: 관리자만 표본·장별 기록을 보고 판정을 저장한다', { timeout: 60000 }, async () => {
  const r = await generateLoveReading(engine, person, 'single', FIXED, { generate: async () => ({ text: fullText(timing), usage }) });
  seedOrder('review2@test.local', 'job-review-2', 'love_timing');
  const rec = buildRecord(r, { engines: [engine], names: [person.name] });
  reviews.saveReading('job-review-2', rec.evidence, rec.checks);
  const { child, port } = await startServer();
  const base = 'http://127.0.0.1:' + port;
  try {
    assert.equal((await fetch(base + '/api/admin/review/sample')).status, 401);
    assert.equal((await fetch(base + '/admin-review.html')).status, 200);
    const login = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'review-pass' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = async (u) => (await fetch(base + u, { headers: { cookie } })).json();
    const sample = await get('/api/admin/review/sample?per=2&product=love_timing');
    assert.deepEqual(sample.items.map((i) => [i.jobId, i.productLabel]), [['job-review-2', '인연의 시기']]);
    const job = await get('/api/admin/review/job/job-review-2');
    assert.equal(job.sections.length, 9);
    assert.ok(job.sections.every((s) => s.evidence));
    assert.doesNotMatch(JSON.stringify(job), /수달이|review2@test|1995년 5월 15일/);
    const post = await fetch(base + '/api/admin/review/job/job-review-2/marks', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sectionKey: 'answer', verdict: 'unclear', memo: '근거가 약함' }) });
    assert.equal(post.status, 200);
    const bad = await fetch(base + '/api/admin/review/job/job-review-2/marks', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ sectionKey: 'answer', verdict: 'nope' }) });
    assert.equal(bad.status, 400);
    const sum = await get('/api/admin/review/summary');
    assert.equal(sum.rows.find((x) => x.productKey === 'love_timing' && x.sectionKey === 'answer').unclear, 1);
    assert.equal((await get('/api/admin/review/job/job-review-2')).sections.find((s) => s.key === 'answer').mark.memo, '근거가 약함');
  } finally {
    child.kill();
  }
});

test('기준 사주 묶음: 가상 인물 20명(상품별 5명)과 빈 체크리스트, 채점·보고서 형식', async () => {
  const { cases, checklist } = loadGolden();
  assert.equal(cases.cases.length, 20);
  const ids = cases.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, 20);
  for (const p of ['love', 'newyear', 'reunion', 'couple']) assert.equal(cases.cases.filter((c) => c.product === p).length, 5, p);
  for (const id of ids) assert.ok(checklist.cases[id] && checklist.cases[id].items.length, id);
  for (const c of cases.cases) {
    const births = c.product === 'reunion' ? [c.input.me.birth, c.input.them.birth] : c.product === 'couple' ? [c.input.a.birth, c.input.b.birth] : [c.input.birth];
    for (const b of births) assert.doesNotThrow(() => computeSaju(b), c.id);
  }
  const reading = await generateLoveReading(engine, person, 'single', FIXED, { generate: async () => ({ text: fullText(timing), usage }) });
  const score = scoreCase(reading, { items: [
    { section: 'drawn', expect: '장면 언급', keywords: ['drawn 장면', '없는말'] },
    { section: 'top', expect: '없는 해석', keywords: ['전혀없는표현'] },
    { section: '', expect: '금지', keywords: ['장면'], mustNot: ['점검해요'] },
    { section: 'nope', expect: '없는 장', keywords: ['x'] },
    { section: '', expect: '', keywords: [] }
  ] });
  assert.deepEqual(score.items.map((i) => i.status), ['pass', 'miss', 'forbidden', 'no-section', 'blank']);
  assert.deepEqual(score.evidence.missing, []);
  const md = renderReport([{ id: 'love-01', product: 'love', seconds: 1, chars: 100, costUsd: 0.1, score }, { id: 'x', product: 'love', error: '실패' }], { startedAt: 's', now: 'n' });
  assert.match(md, /\| love-01 \| love \| 완료 1초/);
  assert.match(md, /체크 miss \[top\] 없는 해석/);
  assert.match(md, /\| x \| love \| 실패: 실패/);
});

test.after(() => { try { db.close(); } catch (e) { /* 이미 닫힘 */ } for (const f of [process.env.SAJU_DB_PATH, process.env.SAJU_DB_PATH + '-wal', process.env.SAJU_DB_PATH + '-shm']) fs.rmSync(f, { force: true }); });

