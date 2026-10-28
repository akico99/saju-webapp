'use strict';
/* 신년운세 API — 켜진 상태에서 무료 첫 장, 입력 검사, 로그인·결제·이메일 확인 순서. 실제 AI 호출 없음. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// 앱을 별도 프로세스에서 띄워 HTTP와 start()를 함께 확인한다(세션 정리 타이머가 테스트를 붙잡지 않게).
const result = JSON.parse(execFileSync(process.execPath, ['-e', `
  const app = require('./src/server/app');
  const server = app.listen(0, '127.0.0.1', async () => {
    try {
      const base = 'http://127.0.0.1:' + server.address().port;
      const post = async (url, body) => { const r = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
      const form = { deliveryEmail: 'test@example.test', deliveryConsent: true, name: '도현', gender: '남', year: '1990', month: '3', day: '8', calendar: '양력', hour: '7', minute: '20', hourUnknown: false };
      const config = await (await fetch(base + '/api/newyear/config')).json();
      const ok = await post('/api/newyear/preview', form);
      const noHour = await post('/api/newyear/preview', { ...form, hour: '', hourUnknown: true });
      const lunar = await post('/api/newyear/preview', { ...form, calendar: '음력', month: '1', day: '15' });
      const noGender = await post('/api/newyear/preview', { ...form, gender: '' });
      const badDate = await post('/api/newyear/preview', { ...form, year: '' });
      const invalid = {};
      for (const [k, v, extra] of [['month', '13'], ['day', '31', { month: '2' }], ['hour', '25'], ['minute', '99'], ['day', '5.5'], ['year', '2999']]) {
        invalid[k + '=' + v] = (await post('/api/newyear/preview', { ...form, [k]: v, ...(extra || {}) })).status;
      }
      const anon = await post('/api/newyear', form);
      const anonDelivery = await post('/api/newyear/x/delivery', {});
      const users = require('./src/db/users');
      const u = users.createUser({ email: 'ny@test.local', passwordHash: 'x', name: '도현' });
      const route = require('./src/server/routes/newYear');
      const attempt = async (body) => { try { await route.start(u.id, body); return null; } catch (e) { return { status: e.status, code: e.body && e.body.code, error: e.body && e.body.error }; } };
      const started = await attempt(form);
      const noEmail = await attempt({ ...form, deliveryEmail: '' });
      const noConsent = await attempt({ ...form, deliveryConsent: false });
      const parsedName = route.parseBody({ ...form, name: '<b>x</b>\\n#도현**' }).name;
      const { resolveProduct } = require('./src/server/products');
      const product = resolveProduct('newyear', form);
      console.log(JSON.stringify({ config, ok, noHour, lunar, noGender, badDate, invalid, anon, anonDelivery, started, noEmail, noConsent, parsedName, product: product && { key: product.productKey, price: product.price } }));
      server.closeAllConnections();
      server.close();
      setTimeout(() => process.exit(0), 100);
    } catch (e) { console.error(e); process.exit(1); }
  });
`], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000, env: { ...process.env, NEWYEAR_ENABLED: 'true', SAJU_DB_PATH: ':memory:' } }));

test('켜진 상품은 2027년과 설정 가격을 알려 주고 결제 레지스트리에 같은 가격으로 오른다', () => {
  assert.equal(result.config.year, 2027);
  assert.equal(result.config.priceKrw, 14900);
  assert.deepEqual(result.product, { key: 'new_year_2027', price: 14900 });
});

test('무료 첫 장은 로그인 없이 한 줄·분기 네 칸·사주표·오행을 준다', () => {
  assert.equal(result.ok.status, 200);
  const r = result.ok.body.reading;
  assert.equal(r.year, 2027);
  assert.equal(r.quarters.length, 4);
  assert.equal(r.pillars.length, 4);
  assert.equal(r.balance.bars.length, 5);
  assert.match(r.quarterLead, /이 분기 밖에 있을 수도/);
  assert.ok(Array.isArray(r.locked) && r.locked.length >= 3);
  assert.doesNotMatch(JSON.stringify(r), /"months"|"top3"|"watch"|"topics"/);
  assert.equal(result.noHour.status, 200);
  assert.equal(result.noHour.body.reading.pillars.length, 3);
  assert.equal(result.lunar.status, 200);
});

test('성별·생년월일이 없거나 없는 날짜·범위 밖 값은 400과 안내를 준다', () => {
  assert.equal(result.noGender.status, 400);
  assert.match(result.noGender.body.error, /성별/);
  assert.equal(result.badDate.status, 400);
  assert.match(result.badDate.body.error, /생년월일/);
  for (const [k, status] of Object.entries(result.invalid)) assert.equal(status, 400, k);
});

test('유료 생성은 로그인이 필요하고, 이메일·동의를 먼저 확인하며, 잔액이 없으면 카드 결제로 넘기는 402를 준다', () => {
  assert.equal(result.anon.status, 401);
  assert.equal(result.anonDelivery.status, 401);
  assert.equal(result.noEmail.status, 400);
  assert.equal(result.noConsent.status, 400);
  assert.deepEqual({ status: result.started.status, code: result.started.code }, { status: 402, code: 'insufficient_points' });
});

test('이름에서 태그 기호·줄바꿈·#·* 를 걸러 주문 이름에 넣는다', () => {
  assert.doesNotMatch(result.parsedName, /[<>\n#*]/);
  assert.match(result.parsedName, /도현/);
});
