'use strict';
// 두 사람의 궁합 라우터 — 스위치·무료 첫 장·입력 검사·로그인·결제 요구. 별도 프로세스에서 라우터만 띄운다(app.js 등록 전에도 검사 가능).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function run(enabled) {
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api', require('./src/server/routes/couple'));
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const post = async (url, body) => { const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
        const form = { relation: 'dating', deliveryEmail: 'test@example.test', deliveryConsent: true,
          aName: '지우', aGender: '여', aYear: '1995', aMonth: '5', aDay: '15', aCalendar: '양력', aHour: '14', aMinute: '30', aHourUnknown: false,
          bName: '민준', bGender: '남', bYear: '1993', bMonth: '11', bDay: '2', bCalendar: '양력', bHour: '', bMinute: '', bHourUnknown: true };
        const ok = await post('/api/couple/preview', form);
        const out = { ok };
        if (${enabled}) {
          const invalid = {};
          for (const [k, v] of [['relation', 'toString'], ['bGender', ''], ['aMonth', '13'], ['aDay', '5.5'], ['bYear', ''], ['aHour', '25']]) {
            const r = await post('/api/couple/preview', { ...form, [k]: v });
            invalid[k + '=' + v] = { status: r.status, error: r.body && r.body.error };
          }
          out.invalid = invalid;
          out.anon = await post('/api/couple', form);
          const users = require('./src/db/users');
          const u = users.createUser({ email: 'couple@test.local', passwordHash: 'x', name: '수달' });
          try { await require('./src/server/routes/couple').start(u.id, form); out.started = null; } catch (e) { out.started = { status: e.status, code: e.body && e.body.code }; }
          try { await require('./src/server/routes/couple').start(u.id, { ...form, deliveryEmail: '' }); } catch (e) { out.noEmail = e.status; }
          out.hasPrice = 'compat_v2' in require('./src/db/points').PRICES;
          out.parsedName = require('./src/server/routes/couple').parseBody({ ...form, aName: '<b>x</b>\\n#지우' }).a.name;
        }
        console.log(JSON.stringify(out));
        server.closeAllConnections();
        server.close();
        setTimeout(() => process.exit(0), 100);
      } catch (e) { console.error(e); process.exit(1); }
    });
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000, env: { ...process.env, COMPAT_V2_ENABLED: enabled ? 'true' : '', SAJU_DB_PATH: ':memory:' } }));
}

const off = run(false);
const on = run(true);

test('스위치가 꺼져 있으면 궁합 API는 404다', () => {
  assert.equal(off.ok.status, 404);
});

test('무료 첫 장은 로그인 없이 바로 응답한다', () => {
  assert.equal(on.ok.status, 200);
  const r = on.ok.body.reading;
  assert.equal(r.relation.label, '연애 중');
  assert.equal(r.people.length, 2);
  assert.equal(r.people[1].pillars.length, 3);
  assert.match(r.startYm, /^\d{4}-\d{1,2}$/);
});

test('잘못된 관계·성별·날짜·시각은 400과 한국어 안내다', () => {
  for (const [k, v] of Object.entries(on.invalid)) {
    assert.equal(v.status, 400, k);
    assert.match(v.error, /[가-힣]/, k);
  }
  assert.match(on.invalid['bGender='].error, /그 사람/);
});

test('이름에서 태그 기호·줄바꿈·# 을 걸러 주문 이름에 넣는다', () => {
  assert.doesNotMatch(on.parsedName, /[<>\n#]/);
  assert.match(on.parsedName, /지우/);
});

test('유료 생성은 로그인이 필요하고 이메일 동의가 없으면 400이다', () => {
  assert.equal(on.anon.status, 401);
  assert.equal(on.noEmail, 400);
});

test('잔액이 없으면 카드 결제로 넘기는 402를 준다(가격 등록 뒤)', (t) => {
  if (!on.hasPrice) return t.skip('points.PRICES에 compat_v2가 아직 없다(/root 통합 대기)');
  assert.deepEqual(on.started, { status: 402, code: 'insufficient_points' });
});
