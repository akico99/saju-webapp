'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

// 상단 '←'는 같은 사이트에서 왔으면 왔던 페이지로, 바로 열었으면 원래 링크(메인)로 간다.
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

test('상품 목록에서 평생사주로 들어간 뒤 ←를 누르면 상품 목록으로, 바로 연 경우에는 메인으로 간다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  const base = 'http://127.0.0.1:' + port;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => (req.url().startsWith(base) ? req.continue() : req.abort()));
    await page.goto(base + '/love-assets/home.html', { waitUntil: 'domcontentloaded' });
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('a[href="/lifetime-report.html"]')]);
    await page.waitForFunction(() => document.querySelector('script[src="/back-nav.js"]') && document.readyState !== 'loading');
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('header a.back')]);
    assert.equal(new URL(page.url()).pathname, '/love-assets/home.html');

    const direct = await browser.newPage();
    await direct.setRequestInterception(true);
    direct.on('request', (req) => (req.url().startsWith(base) ? req.continue() : req.abort()));
    await direct.goto(base + '/lifetime-report.html', { waitUntil: 'domcontentloaded' });
    await Promise.all([direct.waitForNavigation({ waitUntil: 'domcontentloaded' }), direct.click('header a.back')]);
    assert.equal(new URL(direct.url()).pathname, '/');
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit');
    child.kill();
  }
});

