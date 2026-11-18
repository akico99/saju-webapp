'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/track.js'), 'utf8');
const CONFIG = { attributionEnabled: true, metaPixelId: 'meta_test', kakaoPixelId: 'kakao_test', products: { love_timing: { name: '인연의 시기', price: 14900 } } };

async function browser({ config = CONFIG, pathname = '/love.html', search = '?utm_content=L1_timing_v4', metadata = { 'so-product-key': 'love_timing', 'so-page-version': 'love-value-v5' }, local = new Map(), session = new Map(), fail = false } = {}) {
  const storage = (map) => ({ getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) });
  const ga = [], meta = [], kakao = [], scripts = [];
  const window = { gtag: (...args) => ga.push(args), fbq: (...args) => meta.push(args) };
  const document = {
    referrer: '', createElement: () => ({}), head: { appendChild: s => scripts.push(s) },
    querySelector: selector => { const m = /meta\[name="([^"]+)"\]/.exec(selector); return m && metadata[m[1]] ? { content: metadata[m[1]] } : null; }
  };
  vm.runInNewContext(source, { window, document, localStorage: storage(local), sessionStorage: storage(session), location: { search, pathname, host: 'sajuotter.com' }, URL, URLSearchParams, Date, fetch: () => fail ? Promise.reject(Error('offline')) : Promise.resolve({ json: () => Promise.resolve(config) }) });
  const track = window.SoTrack;
  // 설정 응답보다 먼저 생기는 행동도 실제 공개 API로 넣는다.
  track.freeResult('love_timing');
  track.unlockClick('love_timing', 'hook');
  await new Promise(resolve => setImmediate(resolve));
  const loadKakao = () => {
    window.kakaoPixel = () => ({ pageView: () => kakao.push('page'), viewContent: () => kakao.push('view'), participation: () => kakao.push('lead') });
    scripts[0].onload();
  };
  return { track, ga, meta, kakao, scripts, loadKakao, local, session };
}

test('카카오 스크립트가 대기 중이어도 Meta와 GA의 상품·무료 결과·구매 관심은 전달된다', async () => {
  const b = await browser();
  for (const event of ['ViewContent', 'Lead', 'UnlockClick']) assert.equal(b.meta.filter(e => e[1] === event).length, 1, event);
  for (const event of ['view_item', 'generate_lead', 'unlock_click']) assert.equal(b.ga.filter(e => e[1] === event).length, 1, event);
  assert.deepEqual(b.kakao, []);
});

test('이메일 단계 통과(EmailSubmit/email_submit)는 세션당 한 번이고 이메일 값을 싣지 않는다', async () => {
  const b = await browser({ config: { ...CONFIG, kakaoPixelId: null } });
  assert.equal(typeof b.track.emailSubmit, 'function');
  b.track.emailSubmit('love_timing', 'person@example.test'); b.track.emailSubmit('love_timing');
  assert.equal(b.ga.filter(e => e[1] === 'email_submit').length, 1);
  assert.equal(b.meta.filter(e => e[1] === 'EmailSubmit').length, 1);
  assert.equal(b.meta.find(e => e[1] === 'EmailSubmit')[0], 'trackCustom');
  assert.equal(b.ga.find(e => e[1] === 'email_submit')[2].creative_id, 'L1_timing_v4');
  const everything = JSON.stringify([b.ga, b.meta, [...b.local], [...b.session]]);
  assert.ok(!/person@example|@/.test(everything.replace(/"[^"]*mail\.com"/g, '')), '이메일 값이 이벤트·저장소에 없다');
  b.track.emailSubmit(); // 상품 키 없으면 무시
  assert.equal(b.ga.filter(e => e[1] === 'email_submit').length, 1);
});

test('늦게 로드된 카카오는 대기한 행동을 한 번만 받고 다른 플랫폼은 중복되지 않는다', async () => {
  const b = await browser();
  b.loadKakao(); b.loadKakao();
  assert.deepEqual(b.kakao, ['page', 'lead', 'view']);
  assert.equal(b.meta.filter(e => e[1] === 'Lead').length, 1);
});

test('구매 창 망설인 이유는 이벤트 이름으로 세션당 한 번만 보내고 모르는 이유는 버린다', async () => {
  const b = await browser({ config: { ...CONFIG, kakaoPixelId: null } });
  b.track.checkoutExit('love_timing', 'nope');
  assert.equal(b.ga.filter(e => e[1] === 'checkout_exit').length, 0);
  b.track.checkoutExit('love_timing', 'price'); b.track.checkoutExit('love_timing', 'trust');
  const exits = b.meta.filter(e => /^Exit/.test(e[1]));
  assert.deepEqual(exits.map(e => [e[0], e[1]]), [['trackCustom', 'ExitPrice']]);
  assert.equal(b.ga.find(e => e[1] === 'checkout_exit')[2].reason, 'price');
});

test('카카오 로드 실패는 다른 플랫폼 행동 전송을 막지 않는다', async () => {
  const b = await browser();
  b.scripts[0].onerror();
  b.track.readDepth('love_timing', 25);
  assert.equal(b.meta.filter(e => e[1] === 'FreeRead25').length, 1);
});

test('입력 시작과 무료·구매 관심 이벤트에 소재 및 화면 버전이 연결되며 중복 입력은 세지 않는다', async () => {
  const b = await browser({ config: { ...CONFIG, kakaoPixelId: null } });
  assert.equal(typeof b.track.inputStart, 'function');
  b.track.inputStart('love_timing'); b.track.inputStart('love_timing');
  b.track.readDepth('love_timing', 50);
  for (const name of ['view_item', 'input_start', 'generate_lead', 'unlock_click', 'free_read_depth']) {
    const events = b.ga.filter(e => e[1] === name);
    assert.equal(events.length, 1, name);
    assert.equal(events[0][2].creative_id, 'L1_timing_v4');
    assert.equal(events[0][2].page_version, 'love-value-v5');
  }
  assert.equal(b.meta.find(e => e[1] === 'InputStart')[2].page_version, 'love-value-v5');
  const checkout = await browser({ config: { ...CONFIG, kakaoPixelId: null }, pathname: '/pay.html', search: '?orderId=example', metadata: {}, local: b.local, session: b.session });
  checkout.track.beginCheckout({ orderId: 'example', productKey: 'love_timing', value: 14900 });
  assert.equal(checkout.ga.find(e => e[1] === 'begin_checkout')[2].page_version, 'love-value-v5');
  checkout.track.viewItem({ productKey: 'compat_v2', value: 14900 });
  assert.equal(checkout.ga.find(e => e[1] === 'view_item')[2].page_version, undefined);
});

test('정책 게이트가 닫혔거나 설정 실패면 유입·화면 버전을 저장하거나 이벤트에 실어 보내지 않는다', async () => {
  for (const options of [{ config: { attributionEnabled: false } }, { fail: true }]) {
    const b = await browser(options);
    assert.equal(b.local.has('so_attr_first'), false);
    assert.equal([...b.session.keys()].some(k => k.startsWith('so_page_version_')), false);
    for (const e of b.ga) { assert.equal(e[2].creative_id, undefined); assert.equal(e[2].page_version, undefined); }
  }
});

test('소재·버전 표기에 이메일이나 자유 입력 문자열을 그대로 전송하지 않는다', async () => {
  const b = await browser({ config: { ...CONFIG, kakaoPixelId: null }, search: '?utm_content=person%40example.com', metadata: { 'so-product-key': 'love_timing', 'so-page-version': '<script>' } });
  for (const e of b.ga) { assert.equal(e[2].creative_id, undefined); assert.equal(e[2].page_version, undefined); }
});

test('예전 방문에 남은 광고 소재는 광고 주소 없이 다시 들어온 새 세션의 이벤트에 붙지 않는다', async () => {
  const local = new Map([['so_attr_first', JSON.stringify({ utm_content: 'L1_old' })], ['so_attr_last', JSON.stringify({ utm_content: 'L1_old' })]]);
  const b = await browser({ config: { ...CONFIG, kakaoPixelId: null }, search: '', local });
  for (const e of b.ga) assert.equal(e[2].creative_id, undefined, e[1]);
  assert.equal(b.ga.find(e => e[1] === 'generate_lead')[2].page_version, 'love-value-v5');
});

test('다른 상품 광고로 들어온 소재 이름은 같은 탭의 연애 이벤트에 붙지 않는다', async () => {
  const local = new Map(), session = new Map();
  await browser({ config: { ...CONFIG, kakaoPixelId: null }, pathname: '/reunion.html', search: '?utm_content=R1_reunion', metadata: { 'so-product-key': 'reunion_v2', 'so-page-version': 'reunion-v1' }, local, session });
  const love = await browser({ config: { ...CONFIG, kakaoPixelId: null }, search: '', local, session });
  for (const e of love.ga) assert.equal(e[2].creative_id, undefined, e[1]);
});
