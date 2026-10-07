'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/track.js'), 'utf8');
function browser({ initial = {}, search = '?utm_source=meta&utm_content=A', referrer = '', clientDate = '2035-01-01' } = {}) {
  const values = new Map(Object.entries(initial).map(([k,v]) => [k, JSON.stringify(v)]));
  const writes = [], events = [];
  let resolveConfig, rejectConfig;
  const config = new Promise((resolve, reject) => { resolveConfig = resolve; rejectConfig = reject; });
  const localStorage = { getItem: k => values.get(k) || null, setItem: (k,v) => { writes.push(k); values.set(k,v); }, removeItem: k => values.delete(k) };
  const window = { gtag: (...args) => events.push(args) };
  class ClientDate extends Date { constructor(...args) { super(...(args.length ? args : [clientDate])); } }
  vm.runInNewContext(source, { window, localStorage, sessionStorage: localStorage, document: { referrer }, location: { search, pathname:'/webtoon/compat.html', host:'sajuotter.com' }, URL, URLSearchParams, Date:ClientDate, fetch: () => config });
  return { track:window.SoTrack, writes, values, events, resolve: c=>resolveConfig({json:()=>Promise.resolve(c)}), reject:()=>rejectConfig(Error('offline')), settle:()=>new Promise(resolve=>setImmediate(resolve)) };
}
test('서버가 시작 전이라고 응답하면 UTM·참조 저장과 기존 값 전달을 막는다', async () => {
  const b=browser({initial:{so_attr_first:{utm_source:'old'},so_attr_last:{utm_source:'old'}}});
  assert.equal(b.track.attribution(),null);
  assert.deepEqual(b.writes,[]);
  b.resolve({attributionEnabled:false,metaPixelId:null,kakaoPixelId:null}); await b.settle();
  assert.equal(b.track.attribution(),null);
  assert.deepEqual(b.writes,[]);
  assert.equal(b.values.has('so_attr_first'),false);
  assert.equal(b.values.has('so_attr_last'),false);
  const ref=browser({search:'',referrer:'https://example.com/article'});
  ref.resolve({attributionEnabled:false}); await ref.settle(); assert.deepEqual(ref.writes,[]);
});
test('시작 후에는 느린 브라우저 시계와 픽셀 ID 없음에도 유입 저장·구매 퍼널을 유지한다', async () => {
  const b=browser({clientDate:'2020-01-01'});
  b.track.beginCheckout({orderId:'o1',productKey:'compat',value:4900});
  b.resolve({attributionEnabled:true,metaPixelId:null,kakaoPixelId:null}); await b.settle();
  assert.equal(b.track.attribution().first.utm_source,'meta');
  assert.equal(b.track.attribution().last.utm_content,'A');
  b.track.purchase({orderId:'o1',productKey:'compat',value:4900});
  b.track.purchase({orderId:'o1',productKey:'compat',value:4900});
  assert.equal(b.events.filter(e=>e[1]==='purchase').length,1);
  assert.equal(b.events.filter(e=>e[1]==='begin_checkout').length,1);
});
test('추적 설정 요청이 실패하면 유입값을 저장하거나 기존 유입값을 전달하지 않는다', async () => {
  const b=browser({initial:{so_attr_first:{utm_source:'old'}}}); b.reject(); await b.settle();
  assert.deepEqual(b.writes,[]); assert.equal(b.track.attribution(),null);
});

test('추적 설정과 주문 저장은 서버의 KST 시작 시각 경계를 함께 따른다', async (t) => {
  process.env.SAJU_DB_PATH = ':memory:';
  process.env.META_PIXEL_ID = 'test_pixel';
  const express = require('express');
  const app = express(); app.use('/api', require('../src/server/routes/tracking'));
  const { cleanAttribution } = require('../src/db/cardPayments');
  const db = require('../src/db/index');
  const server=app.listen(0,'127.0.0.1');
  const originalNow=Date.now;
  t.after(async()=>{Date.now=originalNow; await new Promise(resolve=>server.close(resolve)); db.close();});
  await new Promise(resolve=>server.once('listening',resolve));
  const attr={first:{utm_source:'meta'}};
  for (const [now,want] of [[Date.parse('2026-10-07T14:59:59.999Z'),false],[Date.parse('2026-10-07T15:00:00.000Z'),true]]) {
    Date.now=()=>now;
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/tracking-config');
    const config=await response.json();
    assert.equal(config.attributionEnabled,want);
    assert.equal(config.metaPixelId,want?'test_pixel':null);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal(cleanAttribution(attr,now)!==null,want);
  }
});
