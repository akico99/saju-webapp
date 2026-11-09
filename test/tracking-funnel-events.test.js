'use strict';
/* 대표 상품 페이지의 상품 조회 자동 전송과 무료 결과(Lead)·잠금 해제 클릭(UnlockClick) 이벤트.
   소액 메타 광고의 최적화 신호이므로 상품 키·금액·세션당 1회 규칙을 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/track.js'), 'utf8');

const CONFIG = {
  attributionEnabled: true, metaPixelId: 'test_pixel', kakaoPixelId: null,
  products: {
    love_timing: { name: '연애 시기 리포트', price: 14900 },
    reunion_v2: { name: '다시, 우리 — 재회 리포트', price: 14900 },
    compat_v2: { name: '두 사람의 궁합', price: 14900 },
    new_year_2027: { name: '2027년 신년운세', price: 14900 }
  }
};

async function page(pathname, search = '') {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const fb = [], ga = [];
  const window = { gtag: (...a) => ga.push(a) };
  const document = { referrer: '', head: { appendChild: () => {} }, createElement: () => ({}) };
  vm.runInNewContext(source, {
    window, document, localStorage: storage, sessionStorage: storage,
    location: { search, pathname, host: 'sajuotter.com' }, URL, URLSearchParams, Date,
    fetch: () => Promise.resolve({ json: () => Promise.resolve(CONFIG) })
  });
  // 실제 fbevents.js 대신 호출만 기록한다.
  window.fbq = (...a) => fb.push(a);
  await new Promise((r) => setImmediate(r));
  return { track: window.SoTrack, fb, ga, settle: () => new Promise((r) => setImmediate(r)) };
}

for (const [p, key] of [['/love.html', 'love_timing'], ['/reunion.html', 'reunion_v2'], ['/couple.html', 'compat_v2'], ['/new-year.html', 'new_year_2027']]) {
  test(`${p} 는 ${key} 상품 조회를 자동으로 보낸다`, async () => {
    const b = await page(p);
    const vc = b.fb.filter((e) => e[1] === 'ViewContent');
    assert.equal(vc.length, 1);
    assert.deepEqual([...vc[0][2].content_ids], [key]);
    assert.equal(vc[0][2].value, 14900);
    assert.equal(vc[0][2].currency, 'KRW');
  });
}

test('결제 후 결과 열람(jobId)은 상품 조회로 보내지 않는다', async () => {
  const b = await page('/love.html', '?jobId=abc');
  assert.equal(b.fb.filter((e) => e[1] === 'ViewContent').length, 0);
});

test('무료 결과는 상품별로 세션당 한 번 Lead 로 보낸다', async () => {
  const b = await page('/love.html');
  b.track.freeResult('love_timing');
  b.track.freeResult('love_timing');
  b.track.freeResult('new_year_2027');
  await b.settle();
  const leads = b.fb.filter((e) => e[0] === 'track' && e[1] === 'Lead');
  assert.equal(leads.length, 2);
  assert.deepEqual([...leads[0][2].content_ids], ['love_timing']);
  assert.equal(leads[0][2].content_category, 'free_result');
  assert.equal(b.ga.filter((e) => e[1] === 'generate_lead').length, 2);
});

test('잠금 해제 클릭은 상품 가격과 함께 UnlockClick 맞춤 이벤트로 한 번 보낸다', async () => {
  const b = await page('/reunion.html');
  b.track.unlockClick('reunion_v2');
  b.track.unlockClick('reunion_v2');
  await b.settle();
  const clicks = b.fb.filter((e) => e[0] === 'trackCustom' && e[1] === 'UnlockClick');
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0][2].value, 14900);
  assert.equal(b.ga.filter((e) => e[1] === 'unlock_click').length, 1);
});

test('상품 키가 없으면 아무것도 보내지 않는다', async () => {
  const b = await page('/love.html');
  const before = b.fb.length;
  b.track.freeResult();
  b.track.unlockClick('');
  await b.settle();
  assert.equal(b.fb.length, before);
});
