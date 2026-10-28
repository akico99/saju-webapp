'use strict';
/* 2026-10 상품 정리 — 주제별 심층 리딩(3,900원 6종) 판매 종료, 메인 개편.
   새 결제는 거절하고, 이미 있는 주문의 복구·환불·다운로드는 그대로 되는지 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const express = require('express');
const fixtures = require('./helpers/account-fixtures');

fixtures.makeTempEnv('main-lineup-');
const m = fixtures.load();
const { resolveProduct } = require('../src/server/products');
const { productCatalog } = require('../src/server/routes/tracking');
const quick = require('../src/server/routes/quick');
const { recoverPendingOrders } = require('../src/jobs/recoverPendingOrders');

const TOPICS = ['intro', 'wealth', 'career', 'love', 'relationship', 'health'];
const body = (topic) => ({ topic, year: '1995', month: '5', day: '15', hour: '14', minute: '30', gender: '여', calendar: '양력' });

test('주제별 심층 리딩은 판매 목록에서 빠지고 가격은 기존 주문용으로 남는다', () => {
  for (const t of TOPICS) {
    assert.equal(m.points.SELLABLE.has('deep_' + t), false, t);
    assert.equal(m.points.PRICES['deep_' + t], 3900, t + ' price kept for refunds');
    assert.ok('deep_' + t in m.points.LEGACY_PRICES, t);
    assert.equal(resolveProduct('deep', { topic: t }), null, t + ' payment prepare must be refused');
  }
  assert.ok(!Object.keys(productCatalog()).some((k) => k.startsWith('deep_')), 'tracking catalog');
  // 그대로 파는 상품
  assert.ok(resolveProduct('full', {}));
  assert.ok(resolveProduct('compat', {}));
  assert.ok(resolveProduct('date_select', { occasion: 'moving' }));
});

test('판매 종료된 심층 리딩은 결제 차감과 시작 API 모두 거절한다', async () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  assert.throws(() => m.points.chargeForProduct(user.id, 'deep_love'), /판매가 종료된 상품/);
  for (const [topic, next] of [['love', '/love.html'], ['relationship', '/love.html'], ['career', '/new-year.html'], ['wealth', '/new-year.html'], ['health', '/new-year.html']]) {
    await assert.rejects(quick.start(user.id, body(topic)), (e) => e.status === 410 && e.body.code === 'discontinued' && e.body.next === next, topic);
  }
  assert.equal(m.db.prepare("SELECT COUNT(*) n FROM orders WHERE product_key LIKE 'deep_%'").get().n, 0);
});

test('재시작 때 남아 있던 심층 리딩 주문은 예전 가격으로 환불·복구된다', () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const jobId = 'deep-recover-' + user.id;
  m.orders.createOrder({ userId: user.id, productKey: 'deep_wealth', label: '재물운 심층 리딩', jobId });
  recoverPendingOrders();
  assert.equal(m.orders.findByJobId(jobId).status, 'error');
  const refund = m.db.prepare("SELECT delta FROM point_transactions WHERE ref_type='refund' AND ref_id=?").get(jobId);
  assert.equal(refund && refund.delta, 3900);
});

test('이미 완료된 심층 리딩 주문은 계속 내려받을 수 있다', async () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const jobId = 'deep-done-' + user.id;
  m.orders.createOrder({ userId: user.id, productKey: 'deep_career', label: '직업·적성운 심층 리딩', jobId });
  const pdf = path.join(m.OUTPUT_ROOT, jobId, 'deep-report.pdf');
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  fs.writeFileSync(pdf, '%PDF-1.4 test');
  m.orders.markDone(jobId, { resultPath: pdf, resultText: '본문' });

  const app = express();
  app.use((req, res, next) => { req.session = { userId: user.id }; next(); });
  app.use('/api', require('../src/server/routes/download'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/download/' + jobId);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '%PDF-1.4 test');
  } finally { server.close(); }
});

/* 메인 링크 — 앱을 따로 띄워 메인의 모든 내부 링크·그림이 실제로 열리는지 본다.
   대표 상품이 모두 켜진 경우와 모두 꺼진 경우(꺼진 상품은 메인이 숨기거나 예전 궁합으로 보낸다)를 함께 본다. */
function probe(on) {
  const flag = on ? 'true' : 'false';
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    const fs = require('fs');
    const html = fs.readFileSync('public/index.html', 'utf8');
    const app = require('./src/server/app');
    const server = app.listen(0, '127.0.0.1', async () => {
      const base = 'http://127.0.0.1:' + server.address().port;
      // fetch는 일부 임의 포트를 "bad port"로 막으므로 http로 직접 묻는다.
      const get = (u) => new Promise((resolve) => require('http').get(base + u, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b })); }));
      const tags = [...html.matchAll(/<(a|img|link|script)[ >][^>]*>/g)].map((x) => x[0]);
      const urls = [];
      for (const tag of tags) {
        for (const attr of ['href', 'src', 'data-src', 'data-legacy-href']) {
          const v = (tag.match(new RegExp('[ ]' + attr + '="([^"]+)"')) || [])[1];
          if (!v || !v.startsWith('/') || v.startsWith('//')) continue;
          const product = (tag.match(/data-product="([^"]+)"/) || [])[1] || null;
          urls.push({ url: v.split('#')[0] || '/', product, attr });
        }
      }
      const statuses = [];
      for (const u of urls) statuses.push({ ...u, status: (await get(u.url)).status });
      const available = JSON.parse((await get('/api/products/available')).body);
      const compat = { plain: await get('/compat.html'), resume: await get('/compat.html?jobId=x') };
      const loc = (r) => r.status;
      console.log(JSON.stringify({ statuses, available, compat: { plain: loc(compat.plain), resume: loc(compat.resume) } }));
      server.closeAllConnections(); server.close();
      setTimeout(() => process.exit(0), 50);
    });
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000, env: { ...process.env, SAJU_DB_PATH: ':memory:', LOVE_TIMING_ENABLED: flag, NEWYEAR_ENABLED: flag, REUNION_ENABLED: flag, COMPAT_V2_ENABLED: flag } }));
}

test('대표 상품이 모두 켜져 있으면 메인의 모든 링크와 상품 그림이 열린다', () => {
  const { statuses, available, compat } = probe(true);
  assert.deepEqual(available, { love: true, newYear: true, reunion: true, couple: true });
  assert.ok(statuses.length > 30, 'home should expose its links');
  // 새 궁합이 켜지면 예전 궁합 주소는 새 궁합으로 넘어간다(결제 복귀 주소는 그대로).
  assert.deepEqual(compat, { plain: 302, resume: 200 });
  for (const s of statuses) assert.equal(s.status, s.url.startsWith('/compat.html') ? 302 : 200, s.attr + ' ' + s.url);
  for (const cover of ['/love-assets/reading/cover-comic.webp', '/new-year-assets/cover.webp', '/reunion-assets/cover.webp', '/couple-assets/cover.webp']) {
    assert.ok(statuses.some((s) => s.url === cover), cover);
  }
});

test('대표 상품이 꺼져 있으면 메인이 기본으로 보여 주는 링크는 모두 열린다', () => {
  const { statuses, available, compat } = probe(false);
  assert.deepEqual(available, { love: false, newYear: false, reunion: false, couple: false });
  assert.deepEqual(compat, { plain: 200, resume: 200 }, 'old compat page stays while the new one is off');
  // 꺼진 상품 링크는 home.js가 숨긴다. 궁합은 data-src(새 궁합 그림)만 꺼져 있고 기본 링크는 예전 궁합이다.
  // 숨겨진 카드 안의 표지 그림(상품별 폴더)도 상품과 함께 잠긴다 — 숨긴 카드의 lazy 그림은 브라우저가 받지 않는다.
  const gated = /^\/(love|new-year|reunion|couple)-assets\//;
  const shown = statuses.filter((s) => !['love', 'newYear', 'reunion'].includes(s.product) && s.attr !== 'data-src' && !gated.test(s.url));
  for (const s of shown) assert.equal(s.status, 200, s.attr + ' ' + s.url);
  assert.ok(shown.some((s) => s.product === 'couple' && s.url.startsWith('/compat.html')), 'couple falls back to the old compat page');
});

