# Lifetime Webtoon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and connect a 16-panel mobile webtoon that explains the lifetime-saju product through a story and hands readers to the existing 14,900원 report flow.

**Architecture:** Store the episode copy and panel metadata in a browser-loadable data module, render it with a small DOM renderer, and keep all dialogue in accessible HTML overlays rather than inside the artwork. Generate the reference sheets and 16 illustrations from the existing otter asset, optimize them to WebP, then connect only the home page's large lifetime promotion to the webtoon while preserving the direct-purchase tile.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js `node:test`, `sharp`, built-in ImageGen, existing Express static hosting

**Spec:** `docs/superpowers/specs/2026-09-23-lifetime-webtoon-design.md`

## Global Constraints

- The episode has exactly 16 panels and leads to `/lifetime-report.html?from=lifetime-webtoon`.
- Keep the existing small lifetime product tile linked directly to `/lifetime-report.html`.
- Use `#FFF9EF`, `#17243D`, `#425B6B`, and `#D5A542`; do not introduce purple witches, cats, neon, or harsh black shadows.
- Put dialogue, narration, price, buttons, and logos in HTML, never inside generated images.
- Keep one bubble to 45 Korean characters or fewer and no more than three text blocks per panel.
- Use the existing otter in `public/illustrations/otter-field-guide.png` as the identity reference.
- Keep the episode transfer size below 4MB; target an average of 230KB or less per WebP panel.
- The first two panel images load eagerly; panels 3–16 load lazily.
- Every image has explicit `width`, `height`, and meaningful Korean `alt` text.
- Do not change the lifetime report generation, payment, or PDF code.

## Review Focus

- Missing or malformed episode data must show a readable error and direct product link instead of a blank page; Task 2 adds the renderer failure-path test.
- A panel image that fails to load must preserve its narration and alt text; Task 2 adds the image-error behavior test.
- At 320px width, overlays must become normal blocks below images so faces and copy remain readable; Task 2 adds the CSS contract test and Task 5 checks it visually.
- Reduced-motion users must receive no reveal or scrolling animation; Task 2 adds the media-query test.
- Query strings on the two CTAs must not interfere with the existing product page; Task 4 pins the exact links and Task 5 performs the navigation check.

## File Structure

| File | Responsibility |
| --- | --- |
| `public/webtoon/episodes.js` | Lifetime episode metadata, copy, dimensions, alt text, and CTA configuration |
| `public/webtoon/webtoon.js` | Validate data, render figures/text/CTAs, and expose failure behavior |
| `public/webtoon/webtoon.css` | Mobile reading column, text layers, panel rhythm, responsive and reduced-motion behavior |
| `public/webtoon/lifetime.html` | Metadata, header, episode mount point, no-script fallback, and asset loading |
| `public/webtoon/_refs/otter-sheet.png` | Approved otter identity sheet for future episodes |
| `public/webtoon/_refs/jiho-sheet.png` | Approved Jiho identity and expression sheet |
| `public/webtoon/lifetime/cut-01.webp` through `cut-16.webp` | Story artwork without text |
| `public/webtoon/lifetime/thumb.webp` | Episode thumbnail made from the approved artwork |
| `public/index.html` | Large lifetime promo link and copy only |
| `test/webtoon.test.js` | Episode, renderer, assets, accessibility, and home-route contracts |

---

### Task 1: Lock the episode data contract and copy

**Files:**
- Create: `public/webtoon/episodes.js`
- Create: `test/webtoon.test.js`

**Interfaces:**
- Consumes: the 16-panel table in `docs/superpowers/specs/2026-09-23-lifetime-webtoon-design.md`
- Produces: `window.WEBTOON_EPISODES.lifetime` and CommonJS export `{ lifetime: Episode }`

- [ ] **Step 1: Write the failing episode contract tests**

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');

test('lifetime webtoon exposes the approved 16-panel episode', () => {
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

test('every lifetime panel has stable accessible metadata', () => {
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
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test test/webtoon.test.js`  
Expected: FAIL with `Cannot find module '../public/webtoon/episodes.js'`.

- [ ] **Step 3: Implement the episode module with the approved copy**

Use this module shape and fill the 16 entries with the exact panel copy below:

```js
(function exposeEpisodes(root) {
  const lifetime = {
    id: 'lifetime',
    title: '한 번은, 내 삶의 지도를 펼쳐보고 싶었다',
    description: '흩어진 선택을 한 장의 인생 지도로 바라보는 이야기',
    midCtaAfter: 10,
    midCta: { href: '#cut-11', label: '인생 전체의 흐름은 어떻게 이어질까' },
    cta: {
      href: '/lifetime-report.html?from=lifetime-webtoon',
      label: '내 삶의 지도 펼쳐보기',
      price: '14,900원'
    },
    subCta: { href: '/services.html#free', label: '무료 리딩 5종 먼저 보기' },
    cuts: [
      { src: '/webtoon/lifetime/cut-01.webp', width: 1080, height: 1350, alt: '이사 상자에서 오래된 수첩을 꺼내는 지호', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '이 수첩을 펼치면 늘 비슷한 문장이 나온다.' }] },
      { src: '/webtoon/lifetime/cut-02.webp', width: 1080, height: 900, alt: '여러 해에 같은 고민이 적힌 수첩', gap: 'md', texts: [{ type: 'thought', position: 'bottom-left', body: '이직할까. 버틸까. 다시 시작할까.' }] },
      { src: '/webtoon/lifetime/cut-03.webp', width: 1080, height: 1350, alt: '수첩 앞에서 생각에 잠긴 지호', gap: 'lg', texts: [{ type: 'thought', position: 'top-right', body: '왜 나는 중요한 순간마다 같은 자리로 돌아올까.' }] },
      { src: '/webtoon/lifetime/cut-04.webp', width: 1080, height: 900, alt: '휴대폰으로 올해 운세를 넘기는 손', gap: 'sm', texts: [] },
      { src: '/webtoon/lifetime/cut-05.webp', width: 1080, height: 1350, alt: '서로 다른 결과 화면 사이에서 혼란스러운 지호', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '올해의 답은 매번 달랐다.' }] },
      { src: '/webtoon/lifetime/cut-06.webp', width: 1080, height: 900, alt: '휴대폰을 엎고 책상에 기대어 있는 지호', gap: 'xl', texts: [] },
      { src: '/webtoon/lifetime/cut-07.webp', width: 1080, height: 1350, alt: '아침 책상 위에 조용히 앉아 있는 수달', gap: 'md', texts: [{ type: 'talk', position: 'top-left', body: '올해 하나만 떼어 보면 더 헷갈릴 수 있어요.' }] },
      { src: '/webtoon/lifetime/cut-08.webp', width: 1080, height: 1350, alt: '수달에게 오래된 수첩을 건네는 지호', gap: 'md', texts: [{ type: 'talk', position: 'top-right', body: '태어난 날부터 같이 펼쳐 볼까요.' }] },
      { src: '/webtoon/lifetime/cut-09.webp', width: 1080, height: 1350, alt: '종이 위 만세력 여덟 자리가 놓이는 장면', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '태어난 순간의 구조가 먼저 자리를 잡았다.' }] },
      { src: '/webtoon/lifetime/cut-10.webp', width: 1080, height: 1350, alt: '오행과 인생 주제가 한 흐름으로 이어지는 지도', gap: 'lg', texts: [{ type: 'narration', position: 'bottom-left', body: '따로 보였던 일들이 같은 흐름 위에 놓였다.' }] },
      { src: '/webtoon/lifetime/cut-11.webp', width: 1080, height: 1350, alt: '과거의 선택 장면들이 한 흐름선 위에 포개진 모습', gap: 'xl', texts: [] },
      { src: '/webtoon/lifetime/cut-12.webp', width: 1080, height: 1600, alt: '펼쳐진 인생 지도를 바라보는 지호의 얼굴', gap: 'xl', texts: [{ type: 'key', position: 'top-left', body: '한 해씩 답을 찾는 대신, 내 삶 전체의 지도를 한 번 펴보는 편이 빠릅니다.' }] },
      { src: '/webtoon/lifetime/cut-13.webp', width: 1080, height: 1350, alt: '인생 지도에서 반복 지점을 손가락으로 짚는 지호', gap: 'md', texts: [{ type: 'thought', position: 'bottom-left', body: '비슷한 때마다 같은 방식으로 버텼던 거구나.' }] },
      { src: '/webtoon/lifetime/cut-14.webp', width: 1080, height: 1350, alt: '인생 지도의 끝에서 앞으로의 길이 이어지는 모습', gap: 'md', texts: [{ type: 'narration', position: 'top-left', body: '앞으로의 시기는 준비할 순서를 보여 줬다.' }] },
      { src: '/webtoon/lifetime/cut-15.webp', width: 1080, height: 1350, alt: '수달이 독자 쪽으로 금색 나침반을 내미는 모습', gap: 'md', texts: [{ type: 'talk', position: 'top-left', body: '이번에는 당신의 지도를 펼쳐 볼 차례입니다.' }] },
      { src: '/webtoon/lifetime/cut-16.webp', width: 1080, height: 1600, alt: '아침 창가에서 지호와 수달이 펼쳐진 지도를 바라보는 모습', gap: 'md', texts: [] }
    ]
  };
  const episodes = { lifetime };
  root.WEBTOON_EPISODES = episodes;
  if (typeof module !== 'undefined' && module.exports) module.exports = episodes;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the focused tests**

Run: `node --test test/webtoon.test.js`  
Expected: 2 tests PASS.

- [ ] **Step 5: Commit the data contract**

```bash
git add public/webtoon/episodes.js test/webtoon.test.js
git commit -m "평생사주 웹툰 대본과 데이터 계약을 추가한다"
```

---

### Task 2: Build the accessible webtoon viewer

**Files:**
- Create: `public/webtoon/lifetime.html`
- Create: `public/webtoon/webtoon.css`
- Create: `public/webtoon/webtoon.js`
- Modify: `test/webtoon.test.js`

**Interfaces:**
- Consumes: `window.WEBTOON_EPISODES.lifetime`
- Produces: `window.WebtoonRenderer.render(root, episode)` and rendered `<figure id="cut-N">` elements

- [ ] **Step 1: Add failing viewer-shell and failure-path tests**

```js
test('lifetime webtoon shell loads data, renderer, metadata, and noscript fallback', () => {
  const html = fs.readFileSync(path.join(publicDir, 'webtoon', 'lifetime.html'), 'utf8');
  assert.match(html, /<meta name="description" content="[^"]{10,}">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/sajuotter\.com\/webtoon\/lifetime\.html">/);
  assert.match(html, /data-webtoon-root/);
  assert.match(html, /<script src="\/webtoon\/episodes\.js"><\/script>/);
  assert.match(html, /<script src="\/webtoon\/webtoon\.js"><\/script>/);
  assert.match(html, /<noscript>[\s\S]*lifetime-report\.html/);
});

test('viewer preserves a readable fallback and marks failed images', () => {
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

test('viewer CSS supports narrow screens and reduced motion', () => {
  const css = fs.readFileSync(path.join(publicDir, 'webtoon', 'webtoon.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*320px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /\.cut-gap-xl\s*\{[^}]*margin-bottom:\s*140px/);
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `node --test test/webtoon.test.js`  
Expected: FAIL because `lifetime.html`, `webtoon.css`, and `webtoon.js` do not exist.

- [ ] **Step 3: Create the semantic page shell**

`lifetime.html` must include this structure, plus canonical/OG/Twitter metadata using the existing `/og-cover.jpg` until the episode thumbnail is validated:

```html
<body class="webtoon-page">
  <header class="toon-header">
    <a href="/" aria-label="사주보는 수달 홈"><img src="/logo.png" alt="사주보는 수달"></a>
    <span>평생사주 이야기</span>
  </header>
  <main>
    <section class="toon-intro" aria-labelledby="episodeTitle">
      <p>평생사주 · WEBTOON</p>
      <h1 id="episodeTitle">한 번은,<br>내 삶의 지도를 펼쳐보고 싶었다</h1>
    </section>
    <div class="toon" data-webtoon-root aria-live="polite"></div>
    <noscript>
      <p>웹툰을 보려면 JavaScript를 켜 주세요.</p>
      <a href="/lifetime-report.html?from=lifetime-webtoon">평생사주 리포트 바로 보기</a>
    </noscript>
  </main>
  <script src="/webtoon/episodes.js"></script>
  <script src="/webtoon/webtoon.js"></script>
</body>
```

- [ ] **Step 4: Implement rendering and explicit failure states**

Use these helpers and export them for both the browser and Node tests:

```js
function validateEpisode(episode) {
  return Boolean(episode && Array.isArray(episode.cuts) && episode.cuts.length);
}

function fallbackMarkup() {
  return '<section class="toon-error"><p>웹툰을 불러오지 못했어요.</p><a href="/lifetime-report.html?from=lifetime-webtoon">평생사주 리포트 바로 보기</a></section>';
}

function markImageMissing(figure) {
  figure.classList.add('image-missing');
}

function loadingMode(index) {
  return index < 2 ? 'eager' : 'lazy';
}

function createTextBlock(documentRef, item, cutNumber) {
  const node = documentRef.createElement('figcaption');
  node.className = `bubble bubble-${item.type} pos-${item.position}`;
  node.id = `cut-${cutNumber}-text`;
  node.textContent = item.body;
  return node;
}

function createCut(documentRef, cut, index) {
  const figure = documentRef.createElement('figure');
  figure.id = `cut-${index + 1}`;
  figure.className = `cut cut-gap-${cut.gap}`;
  const image = documentRef.createElement('img');
  image.src = cut.src;
  image.width = cut.width;
  image.height = cut.height;
  image.alt = cut.alt;
  image.decoding = 'async';
  image.loading = loadingMode(index);
  image.addEventListener('error', () => markImageMissing(figure));
  figure.append(image, ...cut.texts.map((item) => createTextBlock(documentRef, item, index + 1)));
  return figure;
}

function createMidCta(documentRef, config) {
  const aside = documentRef.createElement('aside');
  aside.className = 'toon-mid-cta';
  const link = documentRef.createElement('a');
  link.href = config.href;
  link.textContent = config.label;
  aside.append(link);
  return aside;
}

function createFinalCta(documentRef, episode) {
  const aside = documentRef.createElement('aside');
  aside.className = 'toon-cta';
  const lead = documentRef.createElement('p');
  lead.textContent = '이번에는 당신의 삶을 한 권으로 펼쳐보세요.';
  const primary = documentRef.createElement('a');
  primary.className = 'primary';
  primary.href = episode.cta.href;
  primary.textContent = `${episode.cta.label} · ${episode.cta.price}`;
  const secondary = documentRef.createElement('a');
  secondary.className = 'toon-cta-sub';
  secondary.href = episode.subCta.href;
  secondary.textContent = episode.subCta.label;
  aside.append(lead, primary, secondary);
  return aside;
}

function render(root, episode) {
  if (!root || !validateEpisode(episode)) {
    if (root) root.innerHTML = fallbackMarkup();
    return false;
  }
  const documentRef = root.ownerDocument;
  const fragment = documentRef.createDocumentFragment();
  episode.cuts.forEach((cut, index) => {
    fragment.append(createCut(documentRef, cut, index));
    if (index + 1 === episode.midCtaAfter) fragment.append(createMidCta(documentRef, episode.midCta));
  });
  fragment.append(createFinalCta(documentRef, episode));
  root.replaceChildren(fragment);
  return true;
}
```

Wrap these helpers in an IIFE that exposes `{ validateEpisode, fallbackMarkup, markImageMissing, loadingMode, createCut, render }` as both `window.WebtoonRenderer` and `module.exports`. In the browser branch only, run `render(document.querySelector('[data-webtoon-root]'), window.WEBTOON_EPISODES?.lifetime)` on `DOMContentLoaded`. The Node branch must not touch `window` or `document` during `require()`.

- [ ] **Step 5: Add the mobile visual system**

Implement `webtoon.css` with these fixed contracts:

```css
@import url('/theme.css');
.webtoon-page { margin: 0; background: var(--bg-outer); color: var(--ink); }
.toon-header, .toon-intro, .toon { width: min(560px, 100%); margin-inline: auto; }
.toon-header { min-height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 10px 18px; background: var(--bg); }
.toon-header img { display: block; width: 116px; height: auto; }
.toon-intro { padding: 72px 24px 56px; text-align: center; background: var(--bg); }
.toon-intro h1 { margin: 8px 0 0; font-family: var(--font-serif); line-height: 1.35; }
.toon { background: var(--bg); overflow: hidden; }
.cut { position: relative; margin: 0; }
.cut img { display: block; width: 100%; height: auto; }
.cut-gap-sm { margin-bottom: 8px; }
.cut-gap-md { margin-bottom: 28px; }
.cut-gap-lg { margin-bottom: 72px; }
.cut-gap-xl { margin-bottom: 140px; }
.bubble { position: absolute; z-index: 2; max-width: 78%; padding: 13px 17px; color: var(--ink); font-size: clamp(15px, 4vw, 18px); line-height: 1.55; word-break: keep-all; }
.bubble-talk { background: rgba(255,253,250,.96); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow-1); }
.bubble-thought { background: rgba(243,234,217,.94); border-radius: 20px; }
.bubble-narration, .bubble-key { font-family: var(--font-serif); text-shadow: 0 1px 8px var(--bg); }
.bubble-key { border-bottom: 2px solid var(--gold); }
.pos-top-left { top: 6%; left: 7%; }
.pos-top-right { top: 7%; right: 7%; }
.pos-bottom-left { bottom: 7%; left: 7%; }
.image-missing img { visibility: hidden; }
.image-missing { min-height: 300px; background: var(--surface-2); }
.toon-cta { padding: 56px 24px 72px; text-align: center; background: var(--bg); }
.toon-cta .primary { display: flex; min-height: 54px; align-items: center; justify-content: center; border-radius: var(--radius-btn); color: #fff; background: var(--accent); text-decoration: none; }
@media (max-width: 320px) { .bubble { position: static; display: block; max-width: none; margin: 10px 14px 0; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { animation: none !important; transition: none !important; } }
```

- [ ] **Step 6: Run focused tests and syntax checks**

Run: `node --test test/webtoon.test.js`  
Expected: all Task 1 and Task 2 tests PASS.

Run: `node --check public/webtoon/episodes.js` and `node --check public/webtoon/webtoon.js`  
Expected: no output and exit code 0.

- [ ] **Step 7: Commit the viewer**

```bash
git add public/webtoon/lifetime.html public/webtoon/webtoon.css public/webtoon/webtoon.js test/webtoon.test.js
git commit -m "평생사주 웹툰 뷰어를 추가한다"
```

---

### Task 3: Generate and optimize the character references and 16 panels

**Files:**
- Create: `public/webtoon/_refs/otter-sheet.png`
- Create: `public/webtoon/_refs/jiho-sheet.png`
- Create: `public/webtoon/lifetime/cut-01.webp` through `cut-16.webp`
- Create: `public/webtoon/lifetime/thumb.webp`
- Modify: `test/webtoon.test.js`

**Interfaces:**
- Consumes: existing `public/illustrations/otter-field-guide.png`, Task 1 panel metadata, and approved visual tokens
- Produces: all image paths referenced by `episodes.js`

- [ ] **Step 1: Add failing asset-integrity tests**

```js
test('lifetime webtoon artwork exists within the delivery budget', () => {
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
```

- [ ] **Step 2: Run the test and confirm missing assets fail**

Run: `node --test test/webtoon.test.js`  
Expected: FAIL on `cut-01.webp: missing`.

- [ ] **Step 3: Generate the otter and Jiho reference sheets with built-in ImageGen**

Inspect `public/illustrations/otter-field-guide.png` first. Use it as a reference image, not an edit target.

Otter sheet prompt:

```text
Use case: illustration-story
Asset type: webtoon character identity sheet
Primary request: Create a clean identity sheet of the exact referenced brown otter in five poses: front, three-quarter, back, seated, and a close-up of one paw holding the golden compass.
Input image: otter-field-guide.png is the identity reference; preserve face, fur color, dusty blue hanbok-style robe, fine gold constellation embroidery, cream inner garment, pale lavender sash, and golden compass.
Style: soft Korean webtoon illustration, gentle watercolor shading, subtle cream paper grain, navy ink linework.
Composition: five separate full-body pose studies on one neutral cream sheet with generous spacing.
Constraints: no text, labels, letters, speech bubbles, logo, or watermark; no new accessories; transparent or plain cream background.
```

Jiho sheet prompt:

```text
Use case: illustration-story
Asset type: webtoon character identity sheet
Primary request: Create a consistent identity sheet for Jiho, a 33-year-old Korean male office worker, with front and three-quarter views and six expressions: neutral, tired, confused, moved, understanding, and a faint smile.
Subject: short neat black hair, black horn-rim glasses, cream shirt, muted navy-gray cardigan, ordinary approachable appearance, restrained acting through shoulders, hands, and gaze.
Style: soft Korean webtoon illustration, gentle watercolor shading, subtle cream paper grain, navy ink linework.
Composition: clean pose and expression studies on one neutral cream sheet with generous spacing.
Constraints: no text, labels, letters, speech bubbles, logo, or watermark.
```

Copy the selected outputs to the exact `_refs` paths without overwriting any pre-existing file.

If built-in ImageGen fails or is unavailable, stop and report that the CLI fallback requires an explicitly approved API-key workflow. Do not silently switch tools or models.

- [ ] **Step 4: Generate and approve cut 01 as the style anchor**

Use both reference sheets. Generate a 4:5 portrait composition with the common constraints below and the cut 01 scene.

```text
Use case: illustration-story
Asset type: vertical mobile webtoon panel
Style: soft Korean webtoon illustration, warm cream paper background, navy ink linework, gentle watercolor shading, subtle paper grain, muted cream #FFF9EF, deep navy #17243D, dusty blue #425B6B, one restrained gold accent #D5A542.
Identity: preserve Jiho exactly from the reference sheet; preserve the otter exactly when present.
Scene: Late at night in a half-unpacked apartment, Jiho kneels beside a moving box and lifts out an old notebook. The notebook is the visual focus. A warm desk lamp creates a narrow pool of light while the room falls into cool navy shadow.
Camera: slightly high eye level, medium-wide portrait composition.
Lighting: 4500K mixed late-night light, one clear source, subtle navy environmental overlay.
Composition: leave the top 25 percent as a simple wall and shadow for later HTML narration.
Constraints: no text, letters, numbers, speech bubbles, price, button, logo, watermark, purple, witch, cat, neon, or harsh black shadow.
```

Reject and regenerate cut 01 until Jiho matches the sheet, the notebook reads clearly, no text-like marks appear, and the top 25% remains usable.

- [ ] **Step 5: Generate cuts 02–16 in groups of at most four**

For every call, include the two reference sheets and the approved cut 01. Reuse the common style/identity/constraints from Step 4 and append exactly one scene from this list per image call:

```text
02: Extreme close-up of the old notebook opened across several dated pages; repeated circles and underlines with no legible writing; Jiho's fingers hold the page; narrow warm light; simple lower area for thought text.
03: Jiho sits still at the desk facing the notebook, shoulders slightly collapsed, half his face in soft shadow; large quiet negative space above-right; 4800K cool night.
04: Close-up of Jiho's hand scrolling a smartphone fortune page; interface is abstract blank shapes with no letters; cold 6000K screen light; no character face required.
05: Jiho seen through overlapping translucent blank phone cards, visually confused but restrained; cool navy environmental light; simple top-left area.
06: Jiho places the phone face-down and leans on the desk in near-darkness; wide quiet composition; no dialogue space required; deepest navy value without pure black.
07: Morning in the same room; the small otter calmly sits on the desk as though always present; Jiho looks over; warm 4000K window light; simple top-left area.
08: Jiho hands the old notebook to the otter across the desk; both identities clear; cream reflected light; simple top-right area.
09: Top-down view of cream paper as eight abstract geometric places settle into a traditional life-chart arrangement; no characters, letters, or readable symbols; gold accent at the center; simple top-left area.
10: A poetic map connects five elemental colors, life cycles, relationships, money, and work using navy flowing lines with one gold node; no words or icons with text; simple bottom-left area.
11: Three quiet memories of Jiho's past decisions layered along the same flowing line: an office doorway, a packed box, and an unanswered phone; watercolor montage; no text; warm-neutral transition.
12: Close portrait of Jiho looking at the unfolded life map, recognition rather than surprise; soft morning light on one cheek; very large cream negative space at the top; 4:5 expanded portrait feeling.
13: Jiho's hand points to a repeated bend on the life map while his shoulders relax; warmer 3400K light; simple bottom-left area.
14: The life map continues toward an unwritten road beyond the paper and into morning light; Jiho and otter seen small from behind; restrained gold trail; simple top-left area.
15: The otter offers the golden compass toward the viewer, identity and robe preserved exactly; compass centered, soft highlight; simple top-left area.
16: Wide final scene at an open morning window; Jiho and the otter stand beside the unfolded map facing a cream-gold sky; peaceful, not triumphant; top 30 percent is clean sky for the CTA transition; 3000K warm light.
```

Generate only 3–4 cuts before inspecting. If a face drifts, regenerate that cut together with its adjacent cut using both sheets and cut 01.

- [ ] **Step 6: Copy and optimize selected outputs**

Copy selected PNG outputs from the built-in ImageGen save paths into a workspace staging folder, then convert them with the installed `sharp` dependency. Use the correct target height from `episodes.js`:

```powershell
node -e "const sharp=require('sharp'); const fs=require('fs'); const episode=require('./public/webtoon/episodes.js').lifetime; Promise.all(episode.cuts.map((cut,i)=>sharp('public/webtoon/lifetime-src/cut-'+String(i+1).padStart(2,'0')+'.png').resize(cut.width,cut.height,{fit:'cover',position:'attention'}).webp({quality:82}).toFile('public'+cut.src))).catch(e=>{console.error(e);process.exit(1)})"
```

Create `thumb.webp` from cut 15 with a centered 4:3 crop at 82 quality:

```powershell
node -e "require('sharp')('public/webtoon/lifetime/cut-15.webp').resize(1200,900,{fit:'cover',position:'centre'}).webp({quality:82}).toFile('public/webtoon/lifetime/thumb.webp').catch(e=>{console.error(e);process.exit(1)})"
```

Remove only the explicitly verified staging directory `public/webtoon/lifetime-src` after all final WebP files and `thumb.webp` exist.

- [ ] **Step 7: Run asset checks and inspect every final image**

Run: `node --test test/webtoon.test.js`  
Expected: all tests PASS and total image size is below 4MB.

Open each final WebP and check: identity, clothing, compass, light direction, missing text-like artifacts, and reserved copy space. Regenerate any failed panel before continuing.

- [ ] **Step 8: Commit the approved artwork**

```bash
git add public/webtoon/_refs public/webtoon/lifetime test/webtoon.test.js
git commit -m "평생사주 웹툰 16컷 이미지를 추가한다"
```

---

### Task 4: Connect the home promotion and pin the live route

**Files:**
- Modify: `public/index.html`
- Modify: `test/webtoon.test.js`
- Modify: `test/ui-pages.test.js`

**Interfaces:**
- Consumes: `/webtoon/lifetime.html` and its final CTA
- Produces: one story-first home entry point while retaining one direct product entry point

- [ ] **Step 1: Add failing route and copy tests**

```js
test('home preserves direct purchase and adds the lifetime story route', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /<a class="tile" href="\/lifetime-report\.html">[\s\S]*?<div class="name">평생사주<\/div>/);
  assert.match(html, /<a class="today-fortune-card" href="\/webtoon\/lifetime\.html\?from=home-lifetime-story">/);
  assert.match(html, /웹툰으로 먼저 보기 →/);
});

test('lifetime story CTA points to the existing paid product', () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  assert.equal(lifetime.cta.href, '/lifetime-report.html?from=lifetime-webtoon');
  assert.ok(fs.existsSync(path.join(publicDir, 'lifetime-report.html')));
  const services = fs.readFileSync(path.join(publicDir, 'services.html'), 'utf8');
  assert.match(services, /<section id="free">/);
});
```

Add `webtoon/lifetime` to the `shared` array in the shared-page metadata test in `test/ui-pages.test.js`. The existing `path.join(publicDir, `${name}.html`)` and canonical construction already support the nested path.

- [ ] **Step 2: Run focused tests and confirm the home-link test fails**

Run: `node --test test/webtoon.test.js test/ui-pages.test.js`  
Expected: FAIL because the large promo still points directly to `/lifetime-report.html` and the shared-page list does not include the webtoon.

- [ ] **Step 3: Change only the large home promotion**

In `public/index.html`, preserve the small product tile exactly. Change the large card opening tag and final label:

```html
<a class="today-fortune-card" href="/webtoon/lifetime.html?from=home-lifetime-story">
  <!-- existing eyebrow, badge, heading, and price copy stay unchanged -->
  <span class="login-cta">웹툰으로 먼저 보기 →</span>
</a>
```

Ensure `lifetime.html` contains matching Open Graph, Twitter, description, and canonical tags. Keep the initial OG image as the absolute existing `https://sajuotter.com/og-cover.jpg`; changing it to the episode thumbnail is a separate optimization after deployment confirms crawler support for WebP.

- [ ] **Step 4: Run route and metadata tests**

Run: `node --test test/webtoon.test.js test/ui-pages.test.js`  
Expected: all tests PASS.

- [ ] **Step 5: Commit the home connection**

```bash
git add public/index.html public/webtoon/lifetime.html test/webtoon.test.js test/ui-pages.test.js
git commit -m "홈에서 평생사주 웹툰으로 연결한다"
```

---

### Task 5: Verify the complete episode and existing product flow

**Files:**
- Modify if defects are found: `public/webtoon/lifetime.html`, `public/webtoon/webtoon.css`, `public/webtoon/webtoon.js`, `public/webtoon/episodes.js`, or individual failed artwork files
- Test: all `test/*.test.js`

**Interfaces:**
- Consumes: the completed episode, home route, and existing report page
- Produces: verified local behavior and final QA evidence

- [ ] **Step 1: Run syntax and full automated checks**

Run:

```powershell
node --check public/webtoon/episodes.js
node --check public/webtoon/webtoon.js
node --test @(Get-ChildItem test -Filter '*.test.js' | ForEach-Object { $_.FullName })
```

Expected: every check exits 0; existing paid-form and free-result tests remain green.

- [ ] **Step 2: Start the local server and verify HTTP routes**

Run: `npm start`  
Expected: server starts without changing the port contract already used by the project.

Verify:

```text
GET /webtoon/lifetime.html?from=home-lifetime-story → 200
GET /webtoon/episodes.js → 200
GET /webtoon/webtoon.js → 200
GET /webtoon/lifetime/cut-01.webp → 200
GET /lifetime-report.html?from=lifetime-webtoon → 200
```

- [ ] **Step 3: Perform mobile visual QA at 360px and 430px**

At each width, scroll from the title through the final CTA and capture a full-page screenshot. Confirm:

- The first panel appears without a layout shift.
- Jiho's face, glasses, shirt, and cardigan stay consistent.
- The otter keeps the same robe, constellation embroidery, sash, and compass.
- Bubbles never cover a face or the compass.
- Panels 4, 6, 11, and 16 remain silent.
- The largest pauses occur after panels 6 and 12.
- The midpoint link moves to panel 11.
- At 320px, text blocks sit below images.
- Reduced-motion emulation removes smooth scrolling and transitions.

- [ ] **Step 4: Verify the product handoff and home split**

From the home page:

1. Open the small lifetime tile and confirm it reaches `/lifetime-report.html` directly.
2. Open the large lifetime promotion and confirm it reaches `/webtoon/lifetime.html?from=home-lifetime-story`.
3. Complete the webtoon and follow the main CTA to `/lifetime-report.html?from=lifetime-webtoon`.
4. Confirm the form retains `id="sajuForm"`, submit button, existing scripts, and 14,900원 product behavior.

- [ ] **Step 5: Check the delivered image budget**

Run:

```powershell
Get-ChildItem public/webtoon/lifetime -Filter '*.webp' | Measure-Object Length -Sum
```

Expected: the 16 panels total less than 4,194,304 bytes. Record the exact total in the completion report.

- [ ] **Step 6: Fix only observed defects and repeat affected checks**

For a code or layout defect, write or tighten the owning test before changing the implementation. For an illustration defect, regenerate only the failed panel plus one adjacent context panel, then rerun the asset budget test and visual QA for that transition.

- [ ] **Step 7: Commit verification fixes if any**

```bash
git add public/webtoon public/index.html test/webtoon.test.js test/ui-pages.test.js
git commit -m "평생사주 웹툰 모바일 검수를 마친다"
```

If no files changed during QA, do not create an empty commit.
