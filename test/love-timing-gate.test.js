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
        // fetch는 /./ 와 .. 를 미리 정리해 버리므로 원래 경로를 그대로 보내 정적 파일 처리기의 정규화 우회를 확인한다.
        const http = require('http');
        const raw = (p, method) => new Promise((resolve) => {
          const req = http.request({ host: '127.0.0.1', port: server.address().port, path: p, method: method || 'GET', headers: { 'Content-Type': 'application/json', Connection: 'close' } }, (res) => { res.resume(); resolve(res.statusCode); });
          req.on('error', () => resolve(-1));
          if (method === 'POST') req.write('{"situation":"single","gender":"여","year":"1995","month":"5","day":"15"}');
          req.end();
        });
        const rawStatuses = {};
        for (const p of ['//love.html', '/./love.html', '/x/../love.html', '/%2e/love.html', '/./love-app.js', '//love.css', '/.//love.html', '/./new-year.html', '//new-year-app.js']) rawStatuses[p] = await raw(p);
        for (const p of ['/api//love/preview', '/api/./love/preview', '//api/love/preview', '/api//love']) rawStatuses['POST ' + p] = await raw(p, 'POST');
        const r = resolveProduct('love', { name: '수달' });
        console.log(JSON.stringify({
          statuses,
          rawStatuses,
          sellable: require('./src/db/points').SELLABLE.has('love_timing'),
          price: require('./src/db/points').PRICES.love_timing,
          catalog: require('./src/server/routes/tracking').productCatalog().love_timing || null,
          resolved: r && { productKey: r.productKey, price: r.price, label: r.label, page: r.page, hasStart: typeof r.start === 'function' }
        }));
        server.closeAllConnections();
        server.close();
        setTimeout(() => process.exit(0), 100);
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
  for (const [route, status] of Object.entries(off.rawStatuses)) assert.equal(status, 404, '꺼짐 우회 경로 ' + route);
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

test('켜진 연애 시기 리포트는 페이지·스크립트·스타일이 열리고 유료 API는 로그인을 요구한다', () => {
  assert.equal(on.statuses['/love.html'], 200);
  assert.equal(on.statuses['/love-app.js'], 200);
  assert.equal(on.statuses['/love.css'], 200);
  assert.equal(on.statuses['/api/love/preview'], 400); // 빈 입력
  assert.equal(on.statuses['/api/love'], 401);
});

