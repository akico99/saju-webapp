'use strict';
/* 무료 사주 분석 — 3위 달 공개(1·2위는 응답에 없음)와 AI 개인 소개(가짜 생성기, 실제 AI 호출 없음).
   캐시·IP 한도·형식 검사·실패 처리와 /api/<상품>/intro 라우트를 확인한다. */
process.env.SAJU_DB_PATH = ':memory:';
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.REUNION_ENABLED = 'true';
process.env.COMPAT_V2_ENABLED = 'true';
process.env.NEWYEAR_ENABLED = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { computeSaju } = require('../src/engine/index');
const { buildLovePreview, buildLoveTiming } = require('../src/engine/loveTiming');
const { buildNewYearPreview, buildNewYearData } = require('../src/llm/newYearReading');
const R = require('../src/engine/reunion');
const C = require('../src/llm/coupleReading');
const fi = require('../src/llm/freeIntro');

const A = { year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여', isLunar: false };
const B = { year: 1993, month: 11, day: 2, hour: null, minute: 0, gender: '남', isLunar: false };
const NOW = new Date('2026-10-10T03:00:00Z');
const label = (m) => m.year + '년 ' + m.month + '월';
const withoutSeasons = (p) => { const { seasons, seasonLead, startYm, third, ...rest } = p; return JSON.stringify(rest); };

test('네 상품 모두 3위 달의 연·월과 성격을 주고 1·2위 달은 싣지 않는다', () => {
  const love = buildLovePreview(A, 'single', NOW);
  const lt = buildLoveTiming(computeSaju(A), '여', NOW);
  assert.equal(love.third.label, label(lt.top3[2]));
  for (const m of lt.top3.slice(0, 2)) assert.ok(!withoutSeasons(love).includes(label(m)) && !JSON.stringify(love.third).includes(label(m)));

  const ny = buildNewYearPreview(B);
  const nd = buildNewYearData(computeSaju(B), { gender: '남' });
  assert.equal(ny.third.label, '2027년 ' + nd.top3[2].month + '월');

  const story = { since: 'm6', initiator: 'mutual', contact: 'cut' };
  const re = R.buildReunionPreview({ me: A, them: B, story }, NOW);
  const rt = R.buildReunionTiming(computeSaju(A), computeSaju(B), NOW);
  assert.equal(re.third.label, label(rt.top3[2]));
  for (const m of rt.top3.slice(0, 2)) assert.ok(!withoutSeasons(re).includes(label(m)) && !JSON.stringify(re.third).includes(label(m)));
  const blocked = R.buildReunionPreview({ me: A, them: B, story: { ...story, contact: 'blocked' } }, NOW);
  assert.match(blocked.third.text, /연락할 때라기보다/);

  const co = C.buildCouplePreview(A, B, 'dating', { a: '지우', b: '민준' }, NOW);
  assert.match(co.third.text, /민준/, '상대 이름으로 부른다');
  for (const p of [love, ny, re, co]) {
    assert.deepEqual(Object.keys(p.third).sort(), ['label', 'text']);
    assert.doesNotMatch(p.third.text, /점수|비견|겁재|식신|상관|편재|정재|편관|정관|편인|정인/);
  }
});

const GOOD = '당신은 한낮의 해처럼 있는 자리를 환하게 만드는 사람이에요. 가만히 있어도 사람들의 시선이 먼저 가고, 주관이 뚜렷해서 자기 방향이 분명한 편이에요. 그만큼 스스로를 지키는 힘이 단단해요.\n\n연애에서는 앞에 서서 관계의 방향을 잡아 주는 모습이 자연스럽게 나와요. 결단력 있는 모습에 끌리는 사람이 다가오기 쉽고, 격이 느껴지는 분위기 덕분에 곁에 있는 상대도 대접받는 기분을 느끼기 쉬워요. 다만 자존심이 앞서면 조용히 거리를 두는 모습이 반복되기 쉬워요. 오래 알아갈수록 좋아지는 관계가 잘 맞아요.';
function fake(texts) {
  const calls = [];
  const gen = async (system, user, opts) => { calls.push({ system, user, opts }); const t = texts[Math.min(calls.length - 1, texts.length - 1)]; return { text: t, usage: { input_tokens: 1000, output_tokens: 400 } }; };
  return { gen, calls };
}

test('소개 근거에는 엔진 값만 있고 달·점수·이름이 없으며, 가장 싼 모델에 생각 토큰을 끄고 요청한다', async () => {
  fi._reset();
  const f = fake([GOOD]);
  fi.setGenerator(f.gen);
  const facts = fi.loveFacts(A, '솔로');
  assert.match(facts.facts, /나를 뜻하는 글자/);
  assert.match(facts.facts, /배우자 자리/);
  assert.match(facts.facts, /매력 표지/);
  assert.doesNotMatch(facts.facts, /\d{1,2}월|점수|[一-龥]{2}살/);
  const r = await fi.getIntro(facts, '1.1.1.1');
  assert.equal(r.text, GOOD);
  assert.equal(f.calls[0].opts.model, fi.INTRO_MODEL);
  assert.match(fi.INTRO_MODEL, /haiku/);
  assert.deepEqual(f.calls[0].opts.thinking, { type: 'disabled' });
  assert.ok(r.costUsd > 0 && r.costUsd < 0.01);
  const pairFacts = fi.coupleFacts(A, B, C.buildCouplePreview(A, B, 'dating', { a: '나', b: '그 사람' }, NOW));
  assert.match(pairFacts.facts, /\[나\][\s\S]*\[그 사람\][\s\S]*\[두 사람 사이\]/);
  assert.match(fi.buildIntroPrompt(pairFacts).system, /두 사람은 이런 사이예요/);
  const p = R.buildReunionPreview({ me: A, them: B, story: { since: 'm6', initiator: 'them', contact: 'cut' } }, NOW);
  assert.match(fi.buildIntroPrompt(fi.reunionFacts(A, B, p.bond, p.story)).user, /연락이나 재회를 권하지 말고/);
});

test('같은 근거는 캐시에서 바로 주고, 동시에 들어온 같은 요청은 한 번만 생성한다', async () => {
  fi._reset();
  const f = fake([GOOD]);
  fi.setGenerator(f.gen);
  const facts = fi.loveFacts(A, '썸');
  const [x, y] = await Promise.all([fi.getIntro(facts, '2.2.2.2'), fi.getIntro(facts, '2.2.2.2')]);
  assert.equal(x.text, y.text);
  const z = await fi.getIntro(facts, '9.9.9.9');
  assert.equal(z.cached, true);
  assert.equal(f.calls.length, 1);
});

test('IP당 분당 한도를 넘으면 429, 캐시 적중은 한도를 쓰지 않는다', async () => {
  fi._reset();
  const f = fake([GOOD]);
  fi.setGenerator(f.gen);
  const ip = '3.3.3.3';
  const births = Array.from({ length: fi.LIMITS.perMinute + 1 }, (_, i) => ({ ...A, day: i + 1 }));
  for (let i = 0; i < fi.LIMITS.perMinute; i++) await fi.getIntro(fi.loveFacts(births[i], '솔로'), ip);
  await fi.getIntro(fi.loveFacts(births[0], '솔로'), ip); // 캐시 적중
  await assert.rejects(fi.getIntro(fi.loveFacts(births[fi.LIMITS.perMinute], '솔로'), ip), (e) => e.status === 429);
  await fi.getIntro(fi.loveFacts(births[fi.LIMITS.perMinute], '솔로'), '4.4.4.4'); // 다른 IP는 통과
});

test('형식이 어긋나면 한 번 더 만들고, 두 번 다 어긋나면 503으로 끝낸다', async () => {
  fi._reset();
  const leak = GOOD.replace('연애에서는', '2027년 3월에는');
  let f = fake(['짧아요.', GOOD]);
  fi.setGenerator(f.gen);
  assert.equal((await fi.getIntro(fi.loveFacts(A, '솔로'), '5.5.5.5')).text, GOOD);
  assert.equal(f.calls.length, 2);
  f = fake([leak, '# 제목\n\n' + GOOD]);
  fi.setGenerator(f.gen);
  await assert.rejects(fi.getIntro(fi.loveFacts(A, '연애 중'), '5.5.5.6'), (e) => e.status === 503);
  // 너무 길면 뒤 문단을 덜어 낸다.
  const long = GOOD + '\n\n' + '덧붙이는 문단이에요. '.repeat(20);
  assert.equal(fi.cleanIntro(long), GOOD);
});

test('/api/<상품>/intro 라우트: 정상은 소개를, 잘못된 입력은 400을, 생성 실패는 503을 준다', async () => {
  fi._reset();
  let fail = false;
  fi.setGenerator(async () => { if (fail) throw new Error('boom'); return { text: GOOD, usage: { input_tokens: 1, output_tokens: 1 } }; });
  const app = express();
  app.use(express.json());
  for (const r of ['love', 'newYear', 'reunion', 'couple']) app.use('/api', require('../src/server/routes/' + r));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = async (url, body) => { const res = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json().catch(() => null) }; };
  const one = { gender: '여', year: '1995', month: '5', day: '15', hour: '14', minute: '30', calendar: '양력' };
  const two = { aGender: '여', aYear: '1995', aMonth: '5', aDay: '15', aHour: '14', aMinute: '30', bGender: '남', bYear: '1993', bMonth: '11', bDay: '2', bHourUnknown: true };
  try {
    const cases = [
      ['/api/love/intro', { ...one, situation: 'single' }],
      ['/api/newyear/intro', one],
      ['/api/reunion/intro', { ...two, since: 'm6', initiator: 'me', contact: 'cut' }],
      ['/api/couple/intro', { ...two, relation: 'dating' }]
    ];
    for (const [url, body] of cases) {
      const ok = await post(url, body);
      assert.equal(ok.status, 200, url + ' ' + JSON.stringify(ok.body));
      assert.equal(ok.body.intro, GOOD);
      assert.equal((await post(url, { ...body, gender: '', aGender: '' })).status, 400, url);
    }
    fail = true;
    const bad = await post('/api/love/intro', { ...one, situation: 'some', year: '1996' });
    assert.equal(bad.status, 503);
  } finally {
    server.close();
    fi.setGenerator(null);
  }
});

