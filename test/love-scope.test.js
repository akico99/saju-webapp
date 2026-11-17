'use strict';
/* 무료 범위 줄이기: 소개는 첫 문단만, 매력 카드의 조심할 점과 연애 습관 설명은 전체 풀이로 남긴다. 실제 렌더로 확인한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

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
const P1 = '당신은 한낮의 해처럼 머무는 자리를 환하게 만드는 사람이에요.';
const P2 = '두번째문단표식 관계에서 내 방식이 먼저 나오기 쉬워요.';
const P3 = '세번째문단표식 속마음을 말로 꺼내는 일은 어려울 수 있어요.';

test('무료 결과는 소개 첫 문단만, 조심할 점·습관 설명 없이 잠금 줄로 이어지고 버튼이 결제 창을 연다', { timeout: 90000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const base = 'http://127.0.0.1:' + port;
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(base)) return r.abort();
      if (u === base + '/api/love/intro') return r.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ intro: [P1, P2, P3].join('\n\n') }) });
      r.continue();
    });
    await page.evaluateOnNewDocument(() => { window.__unlock = []; });
    await page.goto(base + '/love.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => { window.SoTrack = window.SoTrack || {}; const o = window.SoTrack.unlockClick; window.SoTrack.unlockClick = function (k, f) { window.__unlock.push(f); return o && o.apply(this, arguments); }; });
    await page.click('#startLove');
    await page.click('[data-gender="여"]');
    await page.type('[name="year"]', '1995'); await page.type('[name="month"]', '5'); await page.type('[name="day"]', '15');
    await page.click('[data-step="1"] [data-next]');
    await page.click('[name="hourUnknown"]');
    await page.click('[data-step="2"] [data-next]');
    await page.click('[data-situation="some"]');
    await page.click('#skipFocus');
    await page.type('[name="name"]', '서연');
    await page.click('[data-step="5"] [data-next]');
    await page.type('[name="leadEmail"]', 'seoyeon@example.test');
    await page.click('[name="agreeLeadPrivacy"]');
    await page.click('[data-step="6"] [data-next]');
    await page.click('#previewBtn');
    await page.waitForSelector('#freeReader .free-intro .free-intro-lock', { visible: true, timeout: 30000 });
    // 소개: 첫 문단만, 둘째·셋째 문단은 DOM에도 없다. 잠금 줄과 버튼이 있다.
    const intro = await page.$eval('#freeReader .free-intro', (e) => ({ text: e.textContent, ps: [...e.querySelectorAll('p.lr-pt')].map((p) => p.textContent), lock: e.querySelector('.free-intro-lock').textContent, btn: e.querySelector('.free-intro-lock button').textContent }));
    assert.deepEqual(intro.ps, [P1]);
    assert.ok(!intro.text.includes('두번째문단표식') && !intro.text.includes('세번째문단표식'));
    assert.ok(intro.lock.includes("이 매력이 연애에서 어디서 엇갈리는지는 전체 풀이의 '반복되기 쉬운 연애 패턴'에서 이어 읽어요"));
    assert.equal(intro.btn, '이어 읽기');
    // 매력 카드: 조심할 점 본문 없음, 한 줄 잠금.
    const cards = await page.$$eval('#freeReader .lr-plain-card', (n) => n.map((c) => ({ rows: [...c.querySelectorAll('.lr-plain-row b')].map((b) => b.textContent), lock: (c.querySelector('.lr-plain-lock') || {}).textContent || '' })));
    assert.ok(cards.length >= 1);
    for (const c of cards) { assert.deepEqual(c.rows, ['이렇게 보여요']); assert.match(c.lock, /조심할 점 · 전체 풀이/); }
    // 연애 습관: 굵은 요약 한 문장만.
    const habit = await page.$eval('#freeReader [data-chapter-id="balance"] .lr-paper', (e) => [...e.querySelectorAll('p.lr-pt')].length);
    assert.equal(habit, 1);
    // 무료 범위 안내 줄
    assert.equal(await page.$eval('#freeReader .love-hook-free-scope', (e) => e.textContent), '지금 보는 매력·연애 습관 요약·계절 흐름과 3위 달은 무료예요.');
    // 그대로 있어야 하는 것
    assert.equal(await page.$$eval('#freeReader .love-hook-months .is-open', (n) => n.length), 1);
    assert.equal(await page.$$eval('#freeReader .love-preview-shot', (n) => n.length) >= 1, true);
    assert.equal(await page.$$eval('#freeReader .lr-sbar', (n) => n.length), 4);
    assert.ok(await page.$('#freeReader .lr-teaser[data-lock-kind="situation"]'));
    assert.ok(await page.$('#freeReader details.lr-saju-original'));
    // 길이
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) <= 7300, '무료 결과 길이');
    // 버튼 -> 결제 창, unlock_from = teaser_intro
    await page.click('#freeReader .free-intro-lock button');
    assert.equal(await page.$eval('#checkoutSheet', (e) => e.open), true);
    assert.deepEqual(await page.evaluate(() => window.__unlock), ['teaser_intro']);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
});

test('화면 버전과 용어 문구', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/love.html'), 'utf8');
  assert.match(html, /<meta name="so-page-version" content="love-scope-v7">/);
  assert.ok(!html.includes('명리 해석을 위한 비교값'));
  assert.equal((html.match(/사주 해석을 위한 비교값/g) || []).length, 2);
});
