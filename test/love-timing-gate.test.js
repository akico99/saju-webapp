'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// 신년운세 게이트 테스트와 같은 방식 — 앱을 별도 프로세스에서 띄워 HTTP로 확인한다.
function probe(enabled) {
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    const app = require('./src/server/app');
    const server = app.listen(0, '127.0.0.1', async () => {
      try {
        const base = 'http://127.0.0.1:' + server.address().port;
        const statuses = {};
        for (const route of ['/love.html', '/love-app.js', '/love.css', '/love%2Ehtml', '/LOVE.html', '/api/love/preview', '/api/love', '/api/LOVE/preview']) {
          statuses[route] = (await fetch(base + route, { method: route.startsWith('/api/') ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: route.startsWith('/api/') ? '{}' : undefined })).status;
        }
        const { resolveProduct } = require('./src/server/products');
        const r = resolveProduct('love', { name: '수달' });
        console.log(JSON.stringify({
          statuses,
          sellable: require('./src/db/points').SELLABLE.has('love_timing'),
          price: require('./src/db/points').PRICES.love_timing,
          catalog: require('./src/server/routes/tracking').productCatalog().love_timing || null,
          resolved: r && { productKey: r.productKey, price: r.price, label: r.label, page: r.page, hasStart: typeof r.start === 'function' }
        }));
        process.exit(0);
      } catch (e) { console.error(e); process.exit(1); }
    });
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000, env: { ...process.env, LOVE_TIMING_ENABLED: enabled ? 'true' : 'false', SAJU_DB_PATH: ':memory:' } }));
}

const off = probe(false);
const on = probe(true);

test('꺼진 연애 시기 리포트는 페이지·정적 파일·API와 인코딩 변형 주소가 모두 404다', () => {
  for (const [route, status] of Object.entries(off.statuses)) assert.equal(status, 404, route);
});

test('꺼진 연애 시기 리포트는 판매·결제 준비·추적 카탈로그에서 빠진다', () => {
  assert.equal(off.sellable, false);
  assert.equal(off.catalog, null);
  assert.equal(off.resolved, null);
  assert.equal(off.price, 19900); // 가격 조회(환불·복구)는 꺼져 있어도 된다
});

test('켜진 연애 시기 리포트는 19,900원 상품으로 결제 준비된다', () => {
  assert.equal(on.sellable, true);
  assert.deepEqual(on.catalog, { name: '연애 시기 리포트', price: 19900 });
  assert.deepEqual(on.resolved, { productKey: 'love_timing', price: 19900, label: '연애 시기 리포트 — 수달', page: '/love.html', hasStart: true });
});

