'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { computeSaju } = require('../src/engine/index');
const { buildLoveTiming } = require('../src/engine/loveTiming');
const { loveWebHtml } = require('../src/pdf/loveVisual');

test('결과 그래프는 12달 막대를 그리고 상위 세 달에 강한 순서를 붙인다', () => {
  const timing = buildLoveTiming(computeSaju({ year: 1995, month: 5, day: 15, hour: 14, minute: 30, gender: '여' }), '여', new Date('2026-10-10T03:00:00Z'));
  const html = loveWebHtml(timing);
  assert.equal((html.match(/class="love-bar(?: is-top)?"/g) || []).length, 12);
  assert.equal((html.match(/class="love-bar is-top"/g) || []).length, 3);
  timing.top3.forEach((m, i) => {
    assert.match(html, new RegExp('data-rank="' + (i + 1) + '"[^>]*data-ym="' + m.year + '-' + m.month + '"'));
  });
  assert.doesNotMatch(html, /<script/i);
});

// 앱을 별도 프로세스에서 띄워 HTTP와 start()를 함께 확인한다(세션 정리 타이머가 테스트를 붙잡지 않게).
const result = JSON.parse(execFileSync(process.execPath, ['-e', `
  const app = require('./src/server/app');
  const server = app.listen(0, '127.0.0.1', async () => {
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      const post = async (url, body) => { const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
      const form = { situation: 'single', name: '수달', gender: '여', year: '1995', month: '5', day: '15', calendar: '양력', hour: '14', minute: '30', hourUnknown: false };
      const ok = await post('/api/love/preview', form);
      const noGender = await post('/api/love/preview', { ...form, gender: '' });
      const badDate = await post('/api/love/preview', { ...form, year: '' });
      const anon = await post('/api/love', form);
      const users = require('./src/db/users');
      const u = users.createUser({ email: 'love@test.local', passwordHash: 'x', name: '수달' });
      let started = null;
      try { await require('./src/server/routes/love').start(u.id, form); } catch (e) { started = { status: e.status, code: e.body && e.body.code }; }
      console.log(JSON.stringify({ ok, noGender, badDate, anon, started }));
      // 열린 연결을 먼저 닫고 나간다 — 바로 exit하면 Windows에서 libuv 핸들 정리 중 비정상 종료한다.
      server.closeAllConnections();
      server.close();
      setTimeout(() => process.exit(0), 100);
    } catch (e) { console.error(e); process.exit(1); }
  });
`], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000, env: { ...process.env, LOVE_TIMING_ENABLED: 'true', SAJU_DB_PATH: ':memory:' } }));

test('무료 첫 장은 로그인 없이 바로 응답한다', () => {
  assert.equal(result.ok.status, 200);
  const r = result.ok.body.reading;
  assert.equal(r.situation.label, '솔로');
  assert.equal(r.seasons.length, 4);
  assert.equal(r.price, 19900);
});

test('무료 첫 장은 성별·생년월일이 없으면 400과 안내를 준다', () => {
  assert.equal(result.noGender.status, 400);
  assert.match(result.noGender.body.error, /성별/);
  assert.equal(result.badDate.status, 400);
  assert.match(result.badDate.body.error, /생년월일/);
});

test('유료 생성은 로그인이 필요하고, 잔액이 없으면 카드 결제로 넘기는 402를 준다', () => {
  assert.equal(result.anon.status, 401);
  assert.deepEqual(result.started, { status: 402, code: 'insufficient_points' });
});

