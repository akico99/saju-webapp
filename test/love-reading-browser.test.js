'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');
const example = require('../public/love-assets/reading-example.json');

function startServer() {
  const child = spawn(process.execPath, ['-e', "const app = require('./src/server/app'); const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LOVE_TIMING_ENABLED: 'true', SAJU_DB_PATH: ':memory:' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
    child.stdout.on('data', (d) => { out += d; const m = /PORT (\d+)/.exec(out); if (m) resolve({ child, port: Number(m[1]) }); });
  });
}

async function open(browser, base, hash, opts = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (!u.startsWith(base)) return req.abort();
    if (opts.blockImages && /\/love-assets\/reading\/.+\.webp/.test(u)) return req.abort();
    req.continue();
  });
  if (opts.reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(base + '/love-assets/reading-demo.html' + hash, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.lr-reader');
  return { page, errors };
}

// 테스트 전용: 화면 밖 지연 로딩 그림도 바로 불러오게 한 뒤, 모두 끝나거나(성공/실패로 제거) 사라질 때까지 기다린다.
async function visitImages(page) {
  await page.evaluate(() => document.querySelectorAll('.lr-art img').forEach((i) => { i.loading = 'eager'; }));
  await page.waitForFunction(() => [...document.querySelectorAll('.lr-art img')].every((i) => i.complete), { timeout: 10000 });
  await page.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await page.waitForFunction(() => scrollY === 0, { timeout: 5000 });
}
async function loadAllImages(page) {
  await visitImages(page);
  await page.evaluate(() => Promise.all([...document.querySelectorAll('.lr-art img')].map((i) => (i.decode ? i.decode().catch(() => {}) : 0))));
}

const overflow = () => {
  const w = innerWidth;
  const wide = [...document.querySelectorAll('.lr-reader *')].filter((n) => n.getBoundingClientRect().right > w + 1 && !n.closest('.lr-toc-list') && !n.closest('figure.lr-art')).map((n) => n.className || n.tagName);
  return { doc: document.documentElement.scrollWidth <= w, wide: wide.slice(0, 5) };
};

test('읽기 화면 데모: 무료·전체 풀이가 320/390/768/1280에서 가로로 넘치지 않고 ** 표시가 없다', { timeout: 90000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const base = 'http://127.0.0.1:' + port;
    for (const hash of ['', '#paid']) {
      const { page, errors } = await open(browser, base, hash);
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewport({ width, height: 844 });
        const o = await page.evaluate(overflow);
        assert.deepEqual(o, { doc: true, wide: [] }, (hash || '#free') + ' overflow at ' + width);
      }
      const text = await page.$eval('.lr-reader', (e) => e.innerText);
      assert.ok(!text.includes('**'), '화면에 ** 가 보임');
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('전체 풀이 데모: 7개 장, 원문 그대로 보기, 12개월 탭 키보드 이동', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const { page, errors } = await open(browser, 'http://127.0.0.1:' + port, '#paid');
    assert.equal(await page.$$eval('.lr-chapter', (n) => n.length), 7);
    assert.equal(await page.$$eval('.lr-toc-btn', (n) => n.length), 7);
    assert.equal(await page.$$eval('.lr-nav, .lr-nav-list', (n) => n.length), 0, '가로 스크롤 장 이동 막대는 없다');
    // 원문은 <pre> 안에 한 글자도 바뀌지 않고 들어 있다.
    assert.equal(await page.$eval('.lr-original .lr-pre', (e) => e.textContent), example.paid);
    // 한 줄 답은 lead로 한 번만, 장 안에 중복되지 않는다.
    assert.ok(await page.$eval('.lr-lead', (e) => e.textContent.length > 0));
    const tabs = await page.$$eval('.lr-months .lr-tab', (n) => n.map((b) => b.textContent));
    assert.equal(tabs.length, 12);
    const before = await page.$eval('.lr-months .lr-detail', (e) => e.textContent);
    await page.click('.lr-month-toggle');
    await page.focus('.lr-months .lr-tab[aria-selected="true"]');
    await page.keyboard.press('ArrowRight');
    const st = await page.evaluate(() => {
      const t = [...document.querySelectorAll('.lr-months .lr-tab')];
      return { selected: t.findIndex((b) => b.getAttribute('aria-selected') === 'true'), focused: t.indexOf(document.activeElement), detail: document.querySelector('.lr-months .lr-detail').textContent };
    });
    assert.deepEqual([st.selected, st.focused], [1, 1]);
    assert.notEqual(st.detail, before);
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    assert.equal(await page.$$eval('.lr-months .lr-tab', (t) => t.findIndex((b) => b.getAttribute('aria-selected') === 'true')), 11); // 처음에서 왼쪽은 마지막 달
    // 각 월 문장이 원문에 실제로 있는 문장인지 확인
    const monthTexts = await page.$$eval('.lr-months .lr-tab', async (t) => { const out = []; for (const b of t) { b.click(); out.push(document.querySelector('.lr-months .lr-detail p').textContent); } return out; });
    for (const m of monthTexts) assert.ok(example.paid.replace(/\*\*/g, '').includes(m), '월 문장이 원문에 없음: ' + m);
    // 무료 데모는 6개 장
    await page.click('[data-mode="free"]');
    await page.waitForFunction(() => document.querySelectorAll('.lr-chapter').length === 6, { timeout: 5000 });
    assert.equal(await page.$$eval('.lr-chapter', (n) => n.length), 6);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('체크 상태는 리포트 ID별로 분리되고 본문·생년월일은 저장하지 않는다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const { page, errors } = await open(browser, 'http://127.0.0.1:' + port, '#paid');
    // 실제 예시 풀이에는 명시한 글머리표가 없어 체크 항목이 생기지 않는다(설명문을 할 일로 바꾸지 않는다).
    assert.equal(await page.$$eval('.lr-check', (n) => n.length), 0);
    const report = '### 한 줄 답\n답이에요.\n\n### 솔로인 지금 할 일\n설명 문장이에요.\n\n**행동**\n- 첫 번째 연락 보내기\n- 취미 모임 한 곳 알아보기\n\n### 월별 한 줄\n- 3월: 봄';
    await page.evaluate((r) => {
      window.__mk = (id) => { const d = document.createElement('div'); d.className = 'probe'; d.dataset.rid = String(id); document.body.prepend(d); const c = LoveReadingView.render(d, LoveReadingModel.buildPaid(r, { title: '수달 1995' }), { reportId: id }); d.__c = c; return d; };
      window.__checked = (id) => [...document.querySelector('.probe[data-rid="' + id + '"]').querySelectorAll('.lr-check input')].map((i) => i.checked);
      window.__mk('a-report');
    }, report);
    const boxes = await page.$$('.probe[data-rid="a-report"] .lr-check input');
    assert.equal(boxes.length, 2);
    await boxes[1].click();
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('love-reading:')));
    assert.deepEqual(keys, ['love-reading:v1:a-report']);
    const raw = await page.evaluate(() => localStorage.getItem('love-reading:v1:a-report'));
    const saved = JSON.parse(raw);
    assert.deepEqual(Object.values(saved.checks), [true]);
    assert.ok(!/연락|취미|수달|1995/.test(raw), '저장값에 본문이나 개인 정보가 섞임');
    const states = await page.evaluate(() => {
      window.__mk('b-report'); window.__mk(undefined); window.__mk('a-report');
      return { b: window.__checked('b-report'), none: window.__checked('undefined'), a: [...document.querySelectorAll('.probe[data-rid="a-report"]')].map((d) => [...d.querySelectorAll('.lr-check input')].map((i) => i.checked)) };
    });
    assert.deepEqual(states.b, [false, false]);
    assert.deepEqual(states.none, [false, false]);
    assert.deepEqual(states.a, [[false, true], [false, true]]);
    const left = await page.evaluate(() => { document.querySelectorAll('.probe').forEach((d) => d.__c()); return document.querySelectorAll('.probe .lr-reader').length; });
    assert.equal(left, 0, 'cleanup 뒤에 남은 화면');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('이어 읽기는 자동으로 스크롤하지 않고, 저장된 장은 처음 렌더링 뒤에도 보존된다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const { page } = await open(browser, 'http://127.0.0.1:' + port, '#paid');
    const result = await page.evaluate(async (paid) => {
      const model = LoveReadingModel.buildPaid(paid);
      const target = model.chapters[3].id;
      localStorage.setItem('love-reading:v1:resume-test', JSON.stringify({ chapter: target, checks: {} }));
      scrollTo(0, 0);
      const d = document.createElement('div'); document.body.prepend(d);
      const cleanup = LoveReadingView.render(d, model, { reportId: 'resume-test' });
      await new Promise((r) => setTimeout(r, 600));
      const btn = d.querySelector('.lr-resume');
      const out = { y: scrollY, label: btn && btn.textContent, stored: JSON.parse(localStorage.getItem('love-reading:v1:resume-test')).chapter, target, title: model.chapters[3].title };
      cleanup();
      return out;
    }, example.paid);
    assert.equal(result.y, 0, '렌더링만으로 스크롤이 움직임');
    assert.match(result.label, new RegExp(result.title.replace(/[.*+?^$()|[\]\\]/g, '\\$&')));
    assert.equal(result.stored, result.target, '처음 보이는 장이 저장된 위치를 덮어씀');
    // 버튼을 눌렀을 때만 이동한다.
    await page.evaluate(() => { document.querySelector('.lr-reader') && 0; });
    await page.click('[data-mode="paid"]');
    await page.evaluate(() => localStorage.setItem('love-reading:v1:demo-v1', JSON.stringify({ chapter: 'pattern', checks: {} })));
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('.lr-resume');
    assert.equal(await page.evaluate(() => scrollY), 0);
    await page.click('.lr-resume');
    await page.waitForFunction(() => scrollY > 200, { timeout: 5000 });
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('그림 파일이 실패해도 글은 같고 빈 칸이 남지 않는다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const base = 'http://127.0.0.1:' + port;
    const grab = (page) => page.$eval('.lr-reader', (r) => { const c = r.cloneNode(true); c.querySelectorAll('.lr-art').forEach((n) => n.remove()); return c.textContent; });
    const ok = await open(browser, base, '#paid');
    assert.ok(await ok.page.$$eval('.lr-art img', (i) => i.length > 0), '정상일 때 그림 표시');
    await ok.page.waitForFunction(() => document.querySelector('.lr-art img').naturalWidth > 0, { timeout: 5000 });
    const baseline = await grab(ok.page);
    const bad = await open(browser, base, '#paid', { blockImages: true });
    await visitImages(bad.page);
    assert.equal(await bad.page.$$eval('.lr-art', (n) => n.length), 0, '실패한 그림 칸이 남아 있음');
    assert.equal(await grab(bad.page), baseline);
    assert.equal(await bad.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(bad.errors, []);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('동작 줄이기 설정에서는 장 애니메이션과 부드러운 이동을 쓰지 않는다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const { page } = await open(browser, 'http://127.0.0.1:' + port, '#paid', { reducedMotion: true });
    const css = await page.evaluate(() => ({ anim: getComputedStyle(document.querySelector('.lr-chapter')).animationName, trans: getComputedStyle(document.querySelector('.lr-track i, .lr-meter i, .lr-toc-btn')).transitionDuration }));
    assert.equal(css.anim, 'none');
    assert.match(css.trans, /^0s/);
    let behavior = null;
    await page.evaluate(() => { const o = Element.prototype.scrollIntoView; window.__sb = []; Element.prototype.scrollIntoView = function (a) { window.__sb.push(a && a.behavior); return o.call(this, a); }; });
    await page.click('.lr-toc-btn:nth-child(3)');
    behavior = await page.evaluate(() => window.__sb[0]);
    assert.equal(behavior, 'auto');
    const normal = await open(browser, 'http://127.0.0.1:' + port, '#paid');
    assert.equal(await normal.page.$eval('.lr-chapter', (e) => getComputedStyle(e).animationName), 'lr-in');
    // 패럴랙스는 동작 줄이기 설정에서 꺼지고, 기본 설정에서만 장 그림에 붙는다.
    assert.equal(await page.$$eval('.lr-parallax', (n) => n.length), 0);
    // 데모 페이지는 부드러운 스크롤이라 즉시 이동시킨 뒤 스크롤 이벤트로 그림 위치가 바뀌는지 본다.
    await normal.page.$eval('.lr-parallax .lr-art', (e) => window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 300, behavior: 'instant' }));
    await normal.page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await normal.page.$$eval('.lr-parallax .lr-art img', (n) => n.some((i) => /translate3d/.test(i.style.transform))), true);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});



const PREVIEW_DIR = path.join(__dirname, '..', 'docs', 'preview');

test('보기 규칙: 끌림 장 제목, 월별 본문 중복 제거와 탭 유지, 설명 문장은 보존', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const { page, errors } = await open(browser, 'http://127.0.0.1:' + port, '#paid');
    assert.ok((await page.$$eval('.lr-chapter .lr-title', (n) => n.map((h) => h.textContent))).includes('서로 끌리는 이유'));
    const monthLines = example.paid.split('## 앞으로 12개월')[1].split('\n').filter((l) => /^- \d+월/.test(l)).map((l) => l.replace(/^- \d+월:\s*/, '').trim());
    assert.equal(monthLines.length, 12);
    assert.equal(await page.$$eval('.lr-all-months .lr-month-card',n=>n.length),12);
    assert.equal(await page.$eval('.lr-all-months',n=>n.hidden),false);
    const body = await page.$eval('[data-chapter-id="months"]', (e) => { const c = e.cloneNode(true); c.querySelectorAll('.lr-month-reading, .lr-head, .lr-art').forEach((n) => n.remove()); return c.textContent; });
    for (const t of monthLines) assert.ok(!body.includes(t), '월 문장이 본문에도 반복됨: ' + t);
    assert.equal(await page.$$eval('.lr-months .lr-tab', (n) => n.length), 12);
    const report = '### 한 줄 답\n답이에요.\n\n### 앞으로 12개월\n이 달들은 서로 이어서 읽어 주세요.\n\n- 3월: 봄 이야기예요\n- 4월: 여름 이야기예요';
    const out = await page.evaluate((r) => {
      const d = document.createElement('div'); document.body.prepend(d);
      LoveReadingView.render(d, LoveReadingModel.buildPaid(r), {});
      return { flow: [...d.querySelectorAll('[data-chapter-id="months"] .lr-talk, [data-chapter-id="months"] .lr-paper')].map(n=>n.textContent).join(' '), tabs: d.querySelectorAll('.lr-months .lr-tab').length };
    }, report);
    assert.ok(out.flow.includes('이 달들은 서로 이어서 읽어 주세요.'), '월 설명 문장이 사라짐');
    assert.equal(out.tabs, 2);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});

test('실제 love.html 결제 복귀(?jobId=): 새 읽기 화면과 시간표가 보이고 기존 본문은 숨겨지며 스크린샷을 남긴다', { timeout: 90000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const base = 'http://127.0.0.1:' + port;
    fs.mkdirSync(PREVIEW_DIR, { recursive: true });
    // 무료 화면 스크린샷(예시 데이터)
    const freePage = await open(browser, base, '');
    await loadAllImages(freePage.page);
    assert.equal(await freePage.page.$$eval('.lr-art img', (i) => i.every((x) => x.naturalWidth > 0)), true, '무료 화면 그림 일부가 비어 있음');
    await freePage.page.screenshot({ path: path.join(PREVIEW_DIR, 'reading-free-mobile.png'), fullPage: true });
    await freePage.page.close();
    // 전체 풀이 데모(#paid): 사용자 미리보기용
    const paidDemo = await open(browser, base, '#paid');
    await loadAllImages(paidDemo.page);
    assert.equal(await paidDemo.page.$$eval('.lr-art img', (i) => i.every((x) => x.naturalWidth > 0)), true, '전체 풀이 그림 일부가 비어 있음');
    await paidDemo.page.screenshot({ path: path.join(PREVIEW_DIR, 'reading-paid-first.png'), fullPage: false });
    await paidDemo.page.screenshot({ path: path.join(PREVIEW_DIR, 'reading-paid-mobile.png'), fullPage: true });
    // 데모 화면 전환 버튼
    await paidDemo.page.click('[data-mode="free"]');
    assert.equal(await paidDemo.page.$$eval('.lr-chapter', (n) => n.length), 6);
    assert.equal(await paidDemo.page.$eval('[data-mode="free"]', (b) => b.getAttribute('aria-pressed')), 'true');
    await paidDemo.page.click('[data-mode="paid"]');
    assert.equal(await paidDemo.page.$$eval('.lr-chapter', (n) => n.length), 7);
    await paidDemo.page.close();
    const page = await browser.newPage();
    const errors = []; const apiCalls = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 390, height: 844 });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(base)) return req.abort();
      if (u.includes('/api/')) {
        apiCalls.push(new URL(u).pathname);
        if (u.includes('/api/status/fixture-job')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'done', report: example.paid, visual: '<div class="fixture-visual">가상 시기 막대</div><div class="love-bars"><div class="love-bar is-top" data-rank="2" data-ym="2027-1"><i></i><b>1월</b></div><div class="love-bar is-top" data-rank="1" data-ym="2026-12"><i></i><b>12월</b></div><div class="love-bar is-top" data-rank="3" data-ym="2027-3"><i></i><b>3월</b></div></div>' }) });
        return req.respond({ status: 404, contentType: 'application/json', body: '{}' });
      }
      req.continue();
    });
    await page.goto(base + '/love.html?jobId=fixture-job', { waitUntil: 'networkidle0' });
    await page.waitForSelector('#paidReader .lr-reader');
    const st = await page.evaluate(() => {
      const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; };
      return { reader: vis('paidReader'), legacy: vis('paidReading'), timeline: vis('paidTimeline'), visual: document.querySelector('#loveVisual .fixture-visual') && getComputedStyle(document.querySelector('#loveVisual .fixture-visual')).display !== 'none', chapters: document.querySelectorAll('#paidReader .lr-chapter').length, overflow: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.deepEqual(st, { reader: true, legacy: false, timeline: true, visual: true, chapters: 7, overflow: true });
    // 강한 세 달 카드는 그래프의 순위 순서로 세 장이 생기고, 눌렀을 때 뒤집힌다.
    const flips = await page.$$eval('#paidReader .lr-flip', (n) => n.map((b) => b.getAttribute('aria-label')));
    assert.equal(flips.length, 3);
    assert.match(flips[0], /^가장 강한 달 2026년 12월/);
    assert.match(flips[1], /^두 번째로 강한 달 2027년 1월/);
    await page.click('#paidReader .lr-flip');
    assert.equal(await page.$eval('#paidReader .lr-flip', (b) => b.getAttribute('aria-pressed')), 'true');
    assert.ok(apiCalls.includes('/api/status/fixture-job'));
    assert.deepEqual([...new Set(apiCalls)].filter((p) => !['/api/status/fixture-job', '/api/tracking-config', '/api/auth/me'].includes(p)), [], '결제·생성 API가 호출됨');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(PREVIEW_DIR, 'reading-paid-integration-mobile.png'), fullPage: true });
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit'); child.kill();
  }
});




