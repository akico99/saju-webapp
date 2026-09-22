const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');

test('평생사주 웹툰이 승인된 16컷 에피소드를 제공한다', () => {
  const episodes = require('../public/webtoon/episodes.js');
  const episode = episodes.lifetime;
  assert.equal(episode.title, '한 번은, 내 삶의 지도를 펼쳐보고 싶었다');
  assert.equal(episode.cuts.length, 16);
  assert.deepEqual(episode.cta, {
    href: '/lifetime-report.html?from=lifetime-webtoon',
    label: '내 삶의 지도 펼쳐보기',
    price: '14,900원'
  });
  assert.equal(episode.subCta.href, '/services.html#free');
  assert.equal(episode.midCtaAfter, 10);
});

test('평생사주 모든 컷에 안정적인 접근성 메타데이터가 있다', () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  const validGaps = new Set(['sm', 'md', 'lg', 'xl']);
  lifetime.cuts.forEach((cut, index) => {
    assert.equal(cut.src, `/webtoon/lifetime/cut-${String(index + 1).padStart(2, '0')}.webp`);
    assert.ok(Number.isInteger(cut.width) && cut.width > 0, `cut ${index + 1}: width`);
    assert.ok(Number.isInteger(cut.height) && cut.height > 0, `cut ${index + 1}: height`);
    assert.ok(cut.alt.length >= 8, `cut ${index + 1}: alt`);
    assert.ok(validGaps.has(cut.gap), `cut ${index + 1}: gap`);
    assert.ok(cut.texts.length <= 3, `cut ${index + 1}: too many text blocks`);
    cut.texts.forEach((item) => assert.ok(item.body.length <= 45, `cut ${index + 1}: copy too long`));
  });
  assert.deepEqual(
    lifetime.cuts.map((cut, index) => cut.texts.length === 0 ? index + 1 : null).filter(Boolean),
    [4, 6, 11, 16]
  );
});

test('평생사주 웹툰 골격이 데이터와 렌더러, 메타데이터, noscript 대체 화면을 불러온다', () => {
  const html = fs.readFileSync(path.join(publicDir, 'webtoon', 'lifetime.html'), 'utf8');
  assert.match(html, /<meta name="description" content="[^"]{10,}">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sajuotter\.com\/webtoon\/lifetime\.html">/);
  assert.match(html, /data-webtoon-root/);
  assert.match(html, /<script src="\/webtoon\/episodes\.js"><\/script>/);
  assert.match(html, /<script src="\/webtoon\/webtoon\.js"><\/script>/);
  assert.match(html, /<noscript>[\s\S]*lifetime-report\.html/);
});

test('뷰어가 읽을 수 있는 대체 화면을 유지하고 실패한 이미지를 표시한다', () => {
  const renderer = require('../public/webtoon/webtoon.js');
  assert.equal(renderer.validateEpisode(null), false);
  assert.equal(renderer.validateEpisode({ cuts: [] }), false);
  assert.equal(renderer.loadingMode(0), 'eager');
  assert.equal(renderer.loadingMode(1), 'eager');
  assert.equal(renderer.loadingMode(2), 'lazy');
  assert.match(renderer.fallbackMarkup(), /웹툰을 불러오지 못했어요/);
  assert.match(renderer.fallbackMarkup(), /lifetime-report\.html\?from=lifetime-webtoon/);
  const added = [];
  renderer.markImageMissing({ classList: { add: (name) => added.push(name) } });
  assert.deepEqual(added, ['image-missing']);
});

test('뷰어 CSS가 좁은 화면과 모션 감소 설정을 지원한다', () => {
  const css = fs.readFileSync(path.join(publicDir, 'webtoon', 'webtoon.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*320px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.cut-gap-xl\s*\{[^}]*margin-bottom:\s*140px/);
  assert.match(css, /\.bubble-narration\s*\{[^}]*background:\s*rgba\(255,\s*249,\s*239,/s);
  assert.match(css, /#cut-15\s+\.bubble\s*\{[^}]*max-width:\s*32%/s);
});

test('평생사주 웹툰 그림이 모두 존재하고 전송 용량 제한을 지킨다', () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  let total = 0;
  for (const cut of lifetime.cuts) {
    const file = path.join(publicDir, cut.src.slice(1));
    assert.ok(fs.existsSync(file), `${cut.src}: missing`);
    const size = fs.statSync(file).size;
    assert.ok(size > 20 * 1024, `${cut.src}: unexpectedly small`);
    assert.ok(size < 400 * 1024, `${cut.src}: over per-panel ceiling`);
    total += size;
  }
  assert.ok(total < 4 * 1024 * 1024, `episode is ${(total / 1024 / 1024).toFixed(2)}MB`);
  for (const ref of ['otter-sheet.png', 'jiho-sheet.png']) {
    assert.ok(fs.existsSync(path.join(publicDir, 'webtoon', '_refs', ref)), `${ref}: missing`);
  }
  assert.ok(fs.existsSync(path.join(publicDir, 'webtoon', 'lifetime', 'thumb.webp')));
});

test('홈이 직접 구매 경로를 유지하면서 평생사주 웹툰 경로를 추가한다', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /<a class="tile" href="\/lifetime-report\.html">[\s\S]*?<div class="name">평생사주<\/div>/);
  assert.match(html, /<a class="today-fortune-card" href="\/webtoon\/lifetime\.html\?from=home-lifetime-story">/);
  assert.match(html, /웹툰으로 먼저 보기 →/);
});

test('평생사주 웹툰 CTA가 기존 유료 상품을 가리킨다', () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  assert.equal(lifetime.cta.href, '/lifetime-report.html?from=lifetime-webtoon');
  assert.ok(fs.existsSync(path.join(publicDir, 'lifetime-report.html')));
  const services = fs.readFileSync(path.join(publicDir, 'services.html'), 'utf8');
  assert.match(services, /<section id="free">/);
});
