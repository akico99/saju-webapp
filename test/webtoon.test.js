const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');

test('평생사주 웹툰이 승인된 16컷 에피소드를 제공한다', () => {
  const episodes = require('../public/webtoon/episodes.js');
  const episode = episodes.lifetime;
  assert.equal(episode.title, '올해 운세만 다섯 번 봤다');
  assert.equal(episode.cuts.length, 16);
  assert.equal(episode.cta.href, '/lifetime-report.html?from=lifetime-webtoon');
  assert.equal(episode.cta.label, '내 평생사주 펼쳐보기');
  assert.equal(episode.cta.price, '14,900원');
  assert.match(episode.cta.spec, /100쪽 PDF/);
  assert.equal(episode.subCta.href, '/services.html#free');
  assert.equal(episode.midCtaAfter, 12);
  assert.equal(episode.midCta.href, '/lifetime-report.html?from=lifetime-webtoon-mid');
});

test('평생사주 모든 컷에 안정적인 접근성 메타데이터가 있다', () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  const validGaps = new Set(['none', 'beat', 'breath']);
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
    [11, 16]
  );
  // 간격은 연출 장치다. 기본은 붙이고, 멈춰야 하는 두 지점에만 'breath'를 쓴다.
  assert.deepEqual(
    lifetime.cuts.map((cut, index) => cut.gap === 'breath' ? index + 1 : null).filter(Boolean),
    [6, 12]
  );
  assert.ok(lifetime.cuts.filter((cut) => cut.gap === 'none').length >= 8);
});

test('평생사주 웹툰 골격이 데이터와 렌더러, 메타데이터, noscript 대체 화면을 불러온다', () => {
  const html = fs.readFileSync(path.join(publicDir, 'webtoon', 'lifetime.html'), 'utf8');
  assert.match(html, /<meta name="description" content="[^"]{10,}">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sajuotter\.com\/webtoon\/lifetime\.html">/);
  assert.match(html, /data-webtoon-root/);
  assert.match(html, /<script src="\/webtoon\/episodes\.js"><\/script>/);
  assert.match(html, /<script src="\/webtoon\/webtoon\.js"><\/script>/);
  assert.match(html, /<noscript>[\s\S]*lifetime-report\.html/);
  assert.doesNotMatch(html, /data-webtoon-root[^>]*aria-live/);
  assert.match(html, /G-THWHBPH5WR/);
  const gaScript = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'injectGA.js'), 'utf8');
  assert.match(gaScript, /'webtoon\/lifetime\.html'/);
});

test('뷰어가 읽을 수 있는 대체 화면을 유지하고 실패한 이미지를 표시한다', () => {
  const renderer = require('../public/webtoon/webtoon.js');
  const { lifetime } = require('../public/webtoon/episodes.js');
  assert.equal(renderer.validateEpisode(null), false);
  assert.equal(renderer.validateEpisode({ cuts: [] }), false);
  assert.equal(renderer.validateEpisode({ cuts: [{}] }), false);
  // 가격만 있고 사양이 빠진 CTA는 렌더하지 않는다.
  const noSpec = JSON.parse(JSON.stringify(lifetime));
  delete noSpec.cta.spec;
  assert.equal(renderer.validateEpisode(noSpec), false);
  assert.equal(renderer.loadingMode(0), 'eager');
  assert.equal(renderer.loadingMode(1), 'eager');
  assert.equal(renderer.loadingMode(2), 'lazy');
  assert.match(renderer.fallbackMarkup(), /웹툰을 불러오지 못했어요/);
  assert.match(renderer.fallbackMarkup(), /lifetime-report\.html\?from=lifetime-webtoon/);
  assert.match(renderer.fallbackMarkup(), /role="status"/);

  const fakeDocument = {
    createDocumentFragment() {
      return {
        children: [],
        append(...children) { this.children.push(...children); }
      };
    },
    createElement(tagName) {
      const listeners = {};
      const attributes = {};
      const classes = new Set();
      return {
        tagName,
        children: [],
        hidden: false,
        classList: { add: (name) => classes.add(name), contains: (name) => classes.has(name) },
        append(...children) { this.children.push(...children); },
        addEventListener(type, listener) { listeners[type] = listener; },
        dispatch(type) { listeners[type](); },
        setAttribute(name, value) { attributes[name] = String(value); },
        getAttribute(name) { return attributes[name]; }
      };
    }
  };
  const failedCut = renderer.createCut(fakeDocument, lifetime.cuts[3], 3);
  const failedImage = failedCut.children[0];
  const imageFallback = failedCut.children[1];
  failedImage.dispatch('error');
  assert.equal(failedCut.classList.contains('image-missing'), true);
  assert.equal(failedImage.getAttribute('aria-hidden'), 'true');
  assert.equal(imageFallback.hidden, false);
  assert.equal(imageFallback.getAttribute('role'), 'img');
  assert.equal(imageFallback.getAttribute('aria-label'), lifetime.cuts[3].alt);
  assert.equal(imageFallback.textContent, lifetime.cuts[3].alt);

  const renderedRoot = {
    ownerDocument: fakeDocument,
    children: [],
    replaceChildren(...children) { this.children = children; }
  };
  assert.equal(renderer.render(renderedRoot, lifetime), true);
  const rendered = renderedRoot.children[0].children;
  assert.equal(rendered.length, 18);
  assert.equal(rendered[0].children[0].loading, 'eager');
  assert.equal(rendered[2].children[0].loading, 'lazy');
  assert.equal(rendered[12].className, 'toon-mid-cta');
  assert.equal(rendered[17].className, 'toon-cta');
  assert.equal(rendered[17].children[1].className, 'toon-cta-spec');

  const malformedRoot = { innerHTML: '', ownerDocument: null };
  assert.equal(renderer.render(malformedRoot, { cuts: [{}] }), false);
  assert.match(malformedRoot.innerHTML, /웹툰을 불러오지 못했어요/);

  const explodingRoot = {
    innerHTML: '',
    ownerDocument: { createDocumentFragment: () => { throw new Error('render failed'); } }
  };
  assert.doesNotThrow(() => renderer.render(explodingRoot, lifetime));
  assert.match(explodingRoot.innerHTML, /웹툰을 불러오지 못했어요/);
});

test('뷰어 CSS가 좁은 화면과 모션 감소 설정을 지원한다', () => {
  const css = fs.readFileSync(path.join(publicDir, 'webtoon', 'webtoon.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*320px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  // 컷은 기본적으로 붙어 있어야 한 편으로 읽힌다.
  assert.match(css, /\.cut-gap-none\s*\{\s*margin-bottom:\s*0;/);
  assert.match(css, /\.cut-gap-breath\s*\{\s*margin-bottom:\s*120px;/);
  // 대사는 본문 UI 폰트가 아니라 웹툰용 고딕을 쓰고, 말풍선에는 꼬리가 있어야 한다.
  assert.match(css, /--font-toon:\s*'Gothic A1'/);
  assert.match(css, /\.bubble\s*\{[^}]*font-family:\s*var\(--font-toon\)/s);
  assert.match(css, /\.bubble-talk\.pos-top-right::after/);
  assert.match(css, /\.bubble-thought\s*\{[^}]*border:\s*2px dashed/s);
  assert.match(css, /\.bubble-narration\s*\{[^}]*background:\s*rgba\(255,\s*249,\s*239,/s);
  assert.doesNotMatch(css, /#cut-15\s+\.bubble/);
  assert.match(css, /\.toon-intro \.eyebrow\s*\{[^}]*color:\s*#8A6412/s);
  assert.match(css, /\.toon-intro h1\s*\{[^}]*word-break:\s*keep-all/s);
  assert.match(css, /a:focus-visible\s*\{[^}]*outline:\s*3px solid #8A6412/s);
});

test('평생사주 웹툰 그림이 모두 존재하고 전송 용량 제한을 지킨다', async () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  let total = 0;
  for (const cut of lifetime.cuts) {
    const file = path.join(publicDir, cut.src.slice(1));
    assert.ok(fs.existsSync(file), `${cut.src}: missing`);
    const size = fs.statSync(file).size;
    assert.ok(size > 20 * 1024, `${cut.src}: unexpectedly small`);
    assert.ok(size < 400 * 1024, `${cut.src}: over per-panel ceiling`);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.format, 'webp', `${cut.src}: format`);
    assert.equal(metadata.width, cut.width, `${cut.src}: width`);
    assert.equal(metadata.height, cut.height, `${cut.src}: height`);
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
