'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// 앱의 세션 정리 타이머가 테스트 실행기를 붙잡지 않도록 별도 프로세스에서 HTTP로 검사한다.
const result = JSON.parse(execFileSync(process.execPath, ['-e', `
  const app = require('./src/server/app');
  const server = app.listen(0, '127.0.0.1', async () => {
    try {
      const statuses = {};
      const base = 'http://127.0.0.1:' + server.address().port;
      for (const route of ['/new-year.html', '/new-year-app.js', '/new%2Dyear.html', '/new-year%2Dapp.js', '/api/newyear/config', '/api/newyear/', '/api/NEWYEAR', '/', '/compat.html', '/quick.html', '/date-select.html', '/lifetime-report.html']) {
        statuses[route] = (await fetch(base + route, { method: route.startsWith('/api/') && !route.endsWith('/config') ? 'POST' : 'GET' })).status;
      }
      const { resolveProduct } = require('./src/server/products');
      console.log(JSON.stringify({ statuses, sellable: require('./src/db/points').SELLABLE.has('new_year_2027'), catalog: require('./src/server/routes/tracking').productCatalog(), newYearPayment: resolveProduct('newyear', {}), existing: [['full', {}], ['compat', {}], ['deep', {topic:'career'}], ['date_select', {occasion:'moving'}]].map(([p,f])=>!!resolveProduct(p,f)) }));
      process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
  });
`], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000, env: { ...process.env, NEWYEAR_ENABLED:'false', SAJU_DB_PATH:':memory:' } }));

test('비활성 신년운세는 인코딩된 주소와 API 변형 주소도 404다', () => {
  for (const route of ['/new-year.html', '/new-year-app.js', '/new%2Dyear.html', '/new-year%2Dapp.js', '/api/newyear/config', '/api/newyear/', '/api/NEWYEAR']) {
    assert.equal(result.statuses[route], 404, route);
  }
});

test('비활성 신년운세는 판매와 결제 준비에서 빠지고 기존 상품은 유지된다', () => {
  assert.equal(result.newYearPayment, null);
  assert.equal(result.sellable, false);
  assert.equal(result.catalog.new_year_2027, undefined);
  assert.deepEqual(result.existing, [true, true, true, true]);
  for (const route of ['/', '/compat.html', '/quick.html', '/date-select.html', '/lifetime-report.html']) {
    assert.equal(result.statuses[route], 200, route);
  }
});
