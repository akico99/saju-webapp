'use strict';
/* 메일 링크(love.html?lead=토큰)로 들어오면 입력·이메일 단계를 건너뛰고 저장된 입력으로 무료 결과를 바로 그린다.
   토큰이 만료되었으면 처음 화면에 안내만 붙인다. 서버 응답은 가로채서 대신 준다(엔드포인트는 서버 작업 몫). */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');
const { buildLovePreview } = require('../src/engine/loveTiming');

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

const TOKEN = 'a'.repeat(40);
// 서버(GET /api/love/lead/:token)가 주는 입력과 같은 모양: 폼 필드명, 시각 모름은 빈 문자열.
const saved = { situation: 'some', name: '서연', gender: '여', year: 1995, month: 5, day: 15, hour: '', minute: '', hourUnknown: true, calendar: '양력', isLeap: false, startYm: '2026-11' };

test('메일 링크로 들어오면 입력 단계 없이 저장된 입력으로 무료 결과를 그리고, 만료 토큰은 안내만 보인다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const base = 'http://127.0.0.1:' + port;
    const reading = buildLovePreview({ year: 1995, month: 5, day: 15, hour: null, minute: 0, gender: '여', isLunar: false }, 'some');
    for (const mode of ['ok', 'expired']) {
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844 });
      const errors = []; const calls = []; const bodies = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const u = req.url();
        if (!u.startsWith(base)) return req.abort();
        calls.push(u.replace(base, ''));
        bodies.push({ url: u.replace(base, ''), body: req.postData() || '' });
        if (u === base + '/api/love/lead/' + TOKEN) {
          return mode === 'ok'
            ? req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reading, lead: { email: 'fictional@naver.com', input: saved } }) })
            : req.respond({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: '만료된 링크예요.' }) });
        }
        return req.continue();
      });
      await page.goto(base + '/love.html?lead=' + TOKEN + '&utm_source=email&utm_campaign=love_followup&utm_content=d1', { waitUntil: 'domcontentloaded' });
      if (mode === 'ok') {
        await page.waitForSelector('#freeReader .love-hook', { visible: true, timeout: 20000 });
        assert.equal(await page.$eval('#stage', (e) => getComputedStyle(e).display), 'none', '입력 단계를 건너뛴다');
        assert.equal(await page.$eval('#loveLanding', (e) => getComputedStyle(e).display), 'none');
        assert.match(await page.$eval('#freeReader h1', (e) => e.textContent), /서연님/);
        assert.match(await page.$eval('#foldedText', (e) => e.textContent), /썸 · 1995\.5\.15/);
        assert.equal(await page.$eval('#leadNote', (e) => e.classList.contains('hidden')), true);
        assert.ok(!calls.some((c) => c.startsWith('/api/love/preview')), '저장된 결과를 쓰므로 새로 계산을 요청하지 않는다');
        // 결제 창도 저장된 입력으로 그대로 열린다.
        await page.click('#freeReader .love-hook-cta');
        assert.equal(await page.$eval('#checkoutSheet', (e) => e.open), true);
        assert.equal(await page.$eval('#deliveryEmail', (e) => e.value), 'fictional@naver.com', '결제 창 이메일은 메일로 받은 주소로 미리 채워진다');
        const intro = bodies.find((x) => x.url === '/api/love/intro');
        if (intro) { assert.match(intro.body, /서연/); assert.ok(!/fictional/.test(intro.body), '개인 소개 요청에 이메일이 없다'); }
        assert.ok(!/fictional/.test(page.url()));
      } else {
        await page.waitForSelector('#loveLanding .love-resume', { visible: true, timeout: 20000 });
        assert.equal(await page.$eval('#freeResult', (e) => e.classList.contains('hidden')), true);
        assert.match(await page.$eval('#loveLanding .love-resume', (e) => e.textContent), /만료/);
        assert.ok(await page.$eval('#startLove', (e) => e.getBoundingClientRect().height > 0), '처음 화면은 그대로 쓸 수 있다');
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
});
