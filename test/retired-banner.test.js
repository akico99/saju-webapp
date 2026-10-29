'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('종료 상품과 가격이 바뀔 수 있는 옛 궁합 배너를 공개 화면에서 숨긴다', () => {
  const sandbox = { window: {}, document: { getElementById: () => null }, location: { origin: 'https://sajuotter.com' }, URL };
  vm.runInNewContext(fs.readFileSync('public/banner-slider.js', 'utf8'), sandbox);
  const allowed = sandbox.window.BannerSlider.isCurrentBanner;
  for (const href of ['quick.html?topic=career', '/life-topics.html?topic=compat', '/compat.html']) assert.equal(allowed({ href }), false, href);
  for (const href of ['/lifetime-report.html', '/life-graph.html']) assert.equal(allowed({ href }), true, href);
});

test('저장된 배너가 없는 새 환경의 기본 배너는 판매 중인 링크만 사용한다', () => {
  const module = { exports: {} };
  const source = fs.readFileSync('src/db/bannerPositions.js', 'utf8');
  const sandbox = { module, exports: module.exports, __dirname: 'src/db', require: (name) => name === 'fs' ? { readFileSync() { throw new Error('no saved banners'); } } : require(name) };
  vm.runInNewContext(source, sandbox);
  assert.deepEqual(Array.from(module.exports.readBanners(), (b) => b.href), ['life-graph.html', 'lifetime-report.html']);
});

test('저장된 평생사주 배너 텍스트의 옛 가격만 새 가격으로 보이고 다른 상품은 유지한다', () => {
  const module = { exports: {} };
  const source = fs.readFileSync('src/db/bannerPositions.js', 'utf8');
  const saved = [
    { image: '/banners/one.jpg', href: '/lifetime-report.html', blocks: [{ type: 'body', text: '평생사주 14,900원' }] },
    { image: '/banners/two.jpg', href: '/love.html', blocks: [{ type: 'body', text: '연애 14,900원' }] }
  ];
  const sandbox = { module, exports: module.exports, __dirname: 'src/db', require: (name) => name === 'fs' ? { readFileSync() { return JSON.stringify(saved); } } : require(name) };
  vm.runInNewContext(source, sandbox);
  const banners = module.exports.readBanners();
  assert.equal(banners[0].blocks[0].text, '평생사주 18,900원');
  assert.equal(banners[1].blocks[0].text, '연애 14,900원');
});
