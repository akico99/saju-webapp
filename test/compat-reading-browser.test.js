'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');
const { computeSaju } = require('../src/engine');
const { analyzeCompatibility } = require('../src/engine/compatibility');
const { buildCompatTiming } = require('../src/llm/compatTiming');
const { buildCompatVisuals, compatWebHtml } = require('../src/pdf/renderCompatHtml');

const SAMPLES = path.join(__dirname, '..', 'public', 'samples', 'compat');
const PREVIEW = path.join(__dirname, '..', 'docs', 'preview');
const JOB = 'job-compat-reader-1';

// 실제 생성기가 만드는 형식: 관계별 소제목 "### …" + 문단 + 끝의 "### 지금 할 것/피할 것". 본문은 게시된 샘플 원고를 쓴다.
const report = fs.readFileSync(path.join(SAMPLES, '연애-본문.md'), 'utf8');
const personA = { name: '홍길동' }, personB = { name: '김영희' };
const engineA = computeSaju({ year: 1994, month: 5, day: 17, hour: 9, minute: 30, gender: '남' });
const engineB = computeSaju({ year: 1992, month: 11, day: 3, hour: 14, minute: 0, gender: '여' });
const compat = analyzeCompatibility(engineA, engineB);
const timing = buildCompatTiming(engineA, engineB, 'dating');
const visual = compatWebHtml(buildCompatVisuals(engineA, engineB, personA, personB, compat, timing));
const fixture = { status: 'done', progress: { current: 1, total: 1 }, error: null, report, visual, hasCard: false, chaptersReady: [] };

function startServer(enabled) {
  const child = spawn(process.execPath, ['-e', "const app = require('./src/server/app'); const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, SAJU_DB_PATH: ':memory:', SCENE_READER_ENABLED: enabled === false ? 'false' : 'true' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
    child.stdout.on('data', (d) => { out += d; const m = /PORT (\d+)/.exec(out); if (m) resolve({ child, port: Number(m[1]) }); });
  });
}

async function open(browser, base, opts = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // 외부 사이트(테스트가 막아 둔 글꼴·분석)와 로그인 전 프로필 조회의 401은 기존부터 있던 것이라 제외한다.
  page.on('console', (m) => {
    const url = (m.location() && m.location().url) || '';
    if (m.type() === 'error' && url.startsWith(base) && !/\/api\/(profiles|auth\/me|tracking-config)/.test(url) && !opts.blockImages && !opts.blockScript) errors.push('console: ' + m.text() + ' ' + url);
  });
  page.requested = [];
  page.on('request', (r) => page.requested.push(r.url()));
  await page.setViewport({ width: 390, height: 844 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (!u.startsWith(base)) return req.abort();
    if (u.includes('/api/status/' + JOB)) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
    if (opts.blockImages && /\/reading-assets\/reading\/.+\.webp/.test(u)) return req.abort();
    if (opts.blockScript && u.includes(opts.blockScript)) return req.abort();
    req.continue();
  });
  if (opts.reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(base + '/compat.html?jobId=' + JOB, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !document.getElementById('compatReading').classList.contains('hidden'), { timeout: 15000 });
  return { page, errors };
}

async function loadAllImages(page) {
  await page.evaluate(() => document.querySelectorAll('.lr-art img').forEach((i) => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('.lr-art img')].every((i) => i.complete), { timeout: 15000 });
  await page.evaluate(() => Promise.all([...document.querySelectorAll('.lr-art img')].map((i) => (i.decode ? i.decode().catch(() => {}) : 0))));
  await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.waitForFunction(() => scrollY === 0, { timeout: 5000 });
}

const overflow = () => {
  const w = innerWidth;
  const wide = [...document.querySelectorAll('#compatReading *')].filter((n) => n.getBoundingClientRect().right > w + 1 && !n.closest('.lr-nav-list')).map((n) => n.className || n.tagName);
  return { doc: document.documentElement.scrollWidth <= w, wide: wide.slice(0, 5) };
};

async function withPage(opts, fn) {
  const { child, port } = await startServer(opts.enabled);
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const { page, errors } = await open(browser, 'http://127.0.0.1:' + port, opts);
    await fn(page, errors, browser, 'http://127.0.0.1:' + port);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
}

test('궁합 결과: 장면형 읽기 화면이 장·원문·그래프·카드를 모두 보여 주고 어떤 폭에서도 넘치지 않는다', { timeout: 120000 }, async () => {
  await withPage({}, async (page, errors) => {
    const headings = report.split(/\r?\n/).filter((l) => /^###\s/.test(l) && !/^###\s*(지금 할 것|피할 것)\s*$/.test(l)).length;
    assert.ok(headings >= 8);
    assert.equal(await page.$$eval('#compatReader .lr-chapter', (n) => n.length), headings);
    assert.equal(await page.$$eval('#compatReader .lr-nav-btn', (n) => n.length), headings);
    assert.equal(await page.$eval('#compatProse', (e) => e.children.length), 0, '읽기 화면이 뜨면 기존 본문은 비어 있다');
    // 원문은 한 글자도 바뀌지 않는다.
    assert.equal(await page.$eval('.lr-original .lr-pre', (e) => e.textContent), report);
    // 서버가 만든 그래프가 보이고, 할 것/피할 것 카드도 그대로 있다.
    assert.ok(await page.$eval('#compatVisual', (e) => e.offsetHeight > 100 && e.querySelector('svg, table, .vz-timing, [class*=vz]') !== null));
    assert.equal(await page.$$eval('#compatDd .vz-dd', (n) => n.length), 2);
    // 본문이 지시한 서식: keep-all, 줄간격, 본문 17px
    const css = await page.$eval('#compatReader .lr-pt', (e) => { const s = getComputedStyle(e); return { wb: s.wordBreak, ow: s.overflowWrap, fs: parseFloat(s.fontSize), lh: parseFloat(s.lineHeight) / parseFloat(s.fontSize) }; });
    assert.equal(css.wb, 'keep-all'); assert.equal(css.ow, 'anywhere');
    assert.ok(css.fs >= 16 && css.fs <= 18, '글자 크기 ' + css.fs);
    assert.ok(css.lh >= 1.8 && css.lh <= 1.9, '줄간격 ' + css.lh);
    // 그림 위에는 짧은 고정 문구만 올라간다.
    const caps = await page.$$eval('#compatReader .lr-art-label', (n) => n.map((e) => e.textContent));
    assert.ok(caps.length > 0 && caps.every((t) => t.length <= 10), caps.join());
    // 화면에 ** 가 남지 않는다.
    assert.ok(!(await page.$eval('#compatReader .lr-chapter', (e) => e.innerText)).includes('**'));
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.deepEqual(await page.evaluate(overflow), { doc: true, wide: [] }, 'overflow at ' + width);
    }
    assert.deepEqual(errors, []);
  });
});

test('궁합 결과: 장 이동·이어 읽기(자동 스크롤 없음)·저장은 장 id만', { timeout: 120000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const base = 'http://127.0.0.1:' + port;
    const { page, errors } = await open(browser, base, { reducedMotion: true });
    assert.equal(await page.$('#compatReader .lr-resume'), null);
    // 결제 후 복귀 시 페이지가 결과 영역으로 한 번 스크롤하는 것은 기존 동작이다. 읽던 장으로 더 내려가지 않는지만 본다.
    const settle = () => page.evaluate(() => new Promise((ok) => { let last = -1, n = 0; const t = setInterval(() => { if (scrollY === last) { if (++n >= 5) { clearInterval(t); ok(scrollY); } } else { n = 0; last = scrollY; } }, 100); }));
    const firstY = await settle();
    await page.focus('#compatReader .lr-nav-btn:nth-child(4)');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement && document.activeElement.classList.contains('lr-title'), { timeout: 5000 });
    assert.equal(await page.evaluate(() => document.activeElement.textContent), await page.$eval('#compatReader .lr-chapter:nth-of-type(4) .lr-title', (e) => e.textContent));
    const saved = await page.evaluate((j) => localStorage.getItem('compat-reading:v1:' + j), JOB);
    assert.equal(JSON.parse(saved).chapter, 'c4');
    assert.deepEqual(Object.keys(JSON.parse(saved)), ['chapter']);
    await page.goto(base + '/compat.html?jobId=' + JOB, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#compatReader .lr-resume');
    assert.equal(await settle(), firstY, '읽던 장으로 자동 스크롤하지 않는다');
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('궁합 결과: 그림이 실패해도 글은 그대로, 읽기 화면 스크립트가 실패하면 기존 본문으로 돌아간다', { timeout: 120000 }, async () => {
  await withPage({ blockImages: true }, async (page, errors) => {
    await page.evaluate(() => document.querySelectorAll('.lr-art img').forEach((i) => { i.loading = 'eager'; }));
    await page.waitForFunction(() => document.querySelectorAll('.lr-art').length === 0, { timeout: 15000 });
    assert.ok(await page.$$eval('#compatReader .lr-pt', (n) => n.length) > 20);
    assert.ok(await page.$eval('#compatReader', (e) => e.innerText.includes('식신과 편인이라는 비대칭 구도')));
    assert.deepEqual(errors, []);
  });
  await withPage({ blockScript: '/reading-view.js' }, async (page) => {
    assert.equal(await page.$('#compatReader .lr-reader'), null);
    assert.ok(await page.$$eval('#compatProse p, #compatProse h4', (n) => n.length) > 10, '기존 본문이 그려진다');
    assert.ok(await page.$eval('#compatProse', (e) => e.innerText.includes('식신과 편인이라는 비대칭 구도')));
    assert.equal(await page.$$eval('#compatDd .vz-dd', (n) => n.length), 2);
  });
});

test('장면형 읽기 화면이 꺼져 있으면 기존 화면 그대로이고 읽기 화면 파일을 요청하지 않으며 오류가 없다', { timeout: 120000 }, async () => {
  await withPage({ enabled: false }, async (page, errors) => {
    assert.equal(await page.$('#compatReader .lr-reader'), null);
    assert.equal(await page.$eval('#compatReader', (e) => e.offsetHeight), 0, '빈 자리표시가 공간을 차지하지 않는다');
    assert.ok(await page.$$eval('#compatProse p, #compatProse h4', (n) => n.length) > 10, '기존 본문이 그려진다');
    assert.ok(await page.$eval('#compatProse', (e) => e.innerText.includes('식신과 편인이라는 비대칭 구도')));
    assert.equal(await page.$$eval('#compatDd .vz-dd', (n) => n.length), 2);
    assert.ok(await page.$eval('#compatVisual', (e) => e.offsetHeight > 100));
    assert.equal(await page.$('link[href*="reading-view"], script[src*="reading-"]'), null);
    assert.deepEqual(page.requested.filter((u) => /\/reading-(?:view|model|assets)/.test(u)), []);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.deepEqual(await page.evaluate(overflow), { doc: true, wide: [] }, 'overflow at ' + width);
    }
    assert.deepEqual(errors, []);
  });
});

test('궁합 결과 화면 캡처', { timeout: 120000 }, async () => {
  await withPage({}, async (page) => {
    fs.mkdirSync(PREVIEW, { recursive: true });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await loadAllImages(page);
    await page.evaluate(() => document.querySelector('#compatReader .lr-chapter').scrollIntoView({ behavior: 'instant', block: 'start' }));
    await page.screenshot({ path: path.join(PREVIEW, 'compat-reader-first.png') });
    await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.screenshot({ path: path.join(PREVIEW, 'compat-reader-mobile.png'), fullPage: true });
  });
});
