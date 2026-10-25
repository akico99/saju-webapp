'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

// 앱은 세션 정리 타이머를 가지므로 별도 프로세스로 띄우고 테스트가 끝나면 종료한다.
function startServer() {
  const child = spawn(process.execPath, ['-e', "const app = require('./src/server/app'); const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LOVE_TIMING_ENABLED: 'true', SAJU_DB_PATH: ':memory:' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
    child.stdout.on('data', (d) => {
      out += d;
      const m = /PORT (\d+)/.exec(out);
      if (m) resolve({ child, port: Number(m[1]) });
    });
  });
}

test('모바일 상품 소개에서 실제 무료 해석, 재입력, 로그인까지 연결된다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const base = 'http://127.0.0.1:' + port;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => req.url().startsWith(base) ? req.continue() : req.abort());
    await page.goto(base + '/love-assets/home.html', { waitUntil: 'networkidle0' });
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'home overflow at ' + width);
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-home-mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-home-first-screen.png'), fullPage: false });
    await Promise.all([page.waitForNavigation(), page.click('a[href="/love.html?concern=some"]')]);
    assert.equal(await page.$eval('[name=situation]', e => e.value), 'some');
    await page.click('#startLoveDock');
    assert.equal(await page.$eval('.landing-dock', e => getComputedStyle(e).display), 'none');
    await page.click('#closeInput');
    await page.goto(base + '/love.html', { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#stage', (e) => getComputedStyle(e).display), 'none');
    await page.waitForFunction(() => !document.querySelector('#characterPortrait').hidden);
    assert.ok(await page.$eval('#characterPortrait', (e) => e.naturalWidth > 0));
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-brand-mobile.png'), fullPage: true });
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'overflow at ' + width);
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.click('#startLove');
    await page.click('[data-situation="single"]');
    await page.waitForFunction(() => !document.querySelector('[data-step="1"]').hidden);
    await page.type('[name="name"]', '테스트');
    await page.click('[data-gender="여"]');
    await page.click('[data-step="1"] [data-next]');
    await page.waitForSelector('[name="year"]', { visible: true });
    await page.type('[name="year"]', '1995');
    await page.type('[name="month"]', '5');
    await page.type('[name="day"]', '15');
    await page.click('[data-step="2"] [data-next]');
    await page.waitForSelector('[name="hourUnknown"]', { visible: true });
    await page.click('[name="hourUnknown"]');
    await page.click('#previewBtn');
    await page.waitForFunction(() => !document.getElementById('freeResult').classList.contains('hidden'));
    assert.match(await page.$eval('#freeTitle', (e) => e.textContent), /테스트/);
    await page.waitForSelector('#freeReader .lr-reader', { visible: true });
    assert.equal(await page.$eval('#legacyFreeReading', e => getComputedStyle(e).display), 'none');
    assert.ok(await page.$$eval('#freeReader .lr-chapter', es => es.length) >= 5);
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'free result overflow at ' + width);
    }
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.$eval('#loveLanding', (e) => getComputedStyle(e).display), 'none');
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-brand-result.png'), fullPage: true });
    await page.click('#redoBtn');
    assert.equal(await page.$eval('#stage', (e) => getComputedStyle(e).display), 'flex');
    await page.click('#closeInput');
    await page.click('#startLoveBottom');
    await page.click('[data-situation="single"]');
    await page.waitForFunction(() => !document.querySelector('[data-step="1"]').hidden, { timeout: 5000 }).catch(async (e) => {
      const state = await page.evaluate(() => ({ steps: [...document.querySelectorAll('.stage-step')].map((s) => s.hidden), err: document.getElementById('stageError').textContent, errHidden: document.getElementById('stageError').hidden, stage: document.getElementById('stage').className, landing: document.getElementById('loveLanding').className, active: document.activeElement && document.activeElement.outerHTML.slice(0, 80), y: scrollY }));
      throw new Error('REENTRY ' + JSON.stringify(state));
    });
    await page.click('[data-step="1"] [data-next]');
    await page.click('[data-step="2"] [data-next]');
    await page.click('#previewBtn');
    await page.waitForFunction(() => !document.getElementById('freeResult').classList.contains('hidden'), { timeout: 8000 }).catch(async (e) => {
      const state = await page.evaluate(() => ({ steps: [...document.querySelectorAll('.stage-step')].map((s) => s.hidden), err: document.getElementById('stageError').textContent, errHidden: document.getElementById('stageError').hidden, stage: document.getElementById('stage').className, free: document.getElementById('freeResult').className, body: document.body.className }));
      throw new Error(e.message + ' ' + JSON.stringify(state));
    });
    await Promise.all([page.waitForNavigation(), page.click('#unlockBtn')]);
    assert.match(page.url(), /login\.html/);
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit');
    child.kill();
  }
});
