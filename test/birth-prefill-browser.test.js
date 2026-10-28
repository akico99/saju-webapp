'use strict';
/* 생년월일 한 번 입력(public/birth-prefill.js) — 메인에서 저장하면 상품·무료 페이지 입력 칸이 미리 채워지고,
   로그인 복귀 복원이 있으면 그것이 우선하며, 지우기로 없앨 수 있다. 메인의 상품 공개 여부 반영도 함께 본다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

function startServer() {
  const child = spawn(process.execPath, ['-e', "const app = require('./src/server/app'); const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, SAJU_DB_PATH: ':memory:', LOVE_TIMING_ENABLED: 'true', NEWYEAR_ENABLED: 'true', REUNION_ENABLED: 'true', COMPAT_V2_ENABLED: 'true' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
    child.stdout.on('data', (d) => { out += d; const m = /PORT (\d+)/.exec(out); if (m) resolve({ child, port: Number(m[1]) }); });
  });
}

const KEY = 'sajuotter:birth:v1';

test('메인에서 한 번 저장한 생년월일이 상품·무료 페이지 입력을 미리 채운다', { timeout: 90000 }, async () => {
  const { child, port } = await startServer();
  const base = 'http://127.0.0.1:' + port;
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setRequestInterception(true);
    // 바깥 요청과 결과 생성 API는 막는다. 화면에 필요한 공개 여부·계정 확인만 통과시킨다.
    page.on('request', (req) => {
      const u = req.url();
      if (!u.startsWith(base)) return req.abort();
      if (u.startsWith(base + '/api/') && !/\/api\/(products\/available|auth\/me|scene-reader|tracking-config|.*config)/.test(u)) return req.abort();
      return req.continue();
    });

    /* 1) 메인: 켜진 상품이 모두 보이고 궁합은 새 궁합으로 이어진다 */
    await page.goto(base + '/', { waitUntil: 'networkidle0' });
    await page.waitForSelector('body[data-products-ready="1"]');
    const home = await page.evaluate(() => ({
      reunionShown: !document.querySelector('.ask-choice[data-product="reunion"]').hidden,
      coupleHref: document.querySelector('.ask-choice[data-product="couple"]').getAttribute('href'),
      coupleImg: document.querySelector('.report-card[data-product="couple"] img').getAttribute('src'),
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    assert.deepEqual(home, { reunionShown: true, coupleHref: '/couple.html?from=home-ask', coupleImg: '/couple-assets/cover.webp', overflow: false });
    await page.screenshot({ path: path.join(os.tmpdir(), 'home-390-first.png') });
    await page.screenshot({ path: path.join(os.tmpdir(), 'home-390-full.png'), fullPage: true });

    /* 2) 메인에서 저장 — 동의 없이는 저장하지 않는다 */
    await page.evaluate(() => {
      const f = document.getElementById('birthForm');
      f.querySelector('input[name=gender][value="여"]').click();
      f.querySelector('input[name=calendar][value="음력"]').click();
      const set = (n, v) => { f.elements.namedItem(n).value = v; };
      set('year', '1995'); set('month', '5'); set('day', '15'); set('hour', '14'); set('minute', '30');
    });
    await page.click('.birth-submit');
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), null);
    assert.equal(await page.$eval('#birthError', (e) => !e.classList.contains('hidden')), true);
    await page.click('.birth-consent input');
    await page.click('.birth-submit');
    const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    assert.deepEqual({ ...saved, savedAt: 0 }, { v: 1, savedAt: 0, gender: '여', calendar: '음력', isLeap: false, year: 1995, month: 5, day: 15, hourUnknown: false, hour: 14, minute: 30 });
    assert.match(await page.$eval('#birthSavedText', (e) => e.textContent), /1995\.05\.15 \(음력\)/);
    assert.equal(Object.keys(saved).includes('name'), false, 'name must not be stored');

    /* 3) 한 사람 폼(연애·신년운세·무료) — 칸과 버튼 표시가 맞춰진다 */
    for (const url of ['/love.html', '/new-year.html', '/free.html?kind=charm', '/lifetime-report.html']) {
      await page.goto(base + url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('form [name=year]') && document.querySelector('form [name=year]').value !== '', { timeout: 5000 });
      const got = await page.evaluate(() => {
        const f = document.querySelector('form [name=year]').form;
        const v = (n) => { const el = f.elements.namedItem(n); return el ? (el.type === 'checkbox' ? el.checked : el.value) : undefined; };
        const on = (sel) => { const b = f.querySelector(sel); return b ? b.classList.contains('on') : null; };
        return { year: v('year'), month: v('month'), day: v('day'), hour: v('hour'), minute: v('minute'), gender: v('gender'), calendar: v('calendar'),
          genderBtn: on('[data-gender="여"]'), lunarBtn: on('[data-calendar="음력"]'), note: !!f.querySelector('.birth-prefill-note'), remember: !!f.querySelector('.birth-prefill-remember input:checked') };
      });
      assert.equal(got.year, '1995', url); assert.equal(got.month, '5', url); assert.equal(got.day, '15', url);
      assert.equal(got.hour, '14', url); assert.equal(got.minute, '30', url);
      assert.equal(got.gender, '여', url); assert.equal(got.calendar, '음력', url);
      if (got.genderBtn !== null) assert.equal(got.genderBtn, true, url + ' gender button');
      if (got.lunarBtn !== null) assert.equal(got.lunarBtn, true, url + ' calendar button');
      assert.equal(got.note, true, url + ' prefill note');
      assert.equal(got.remember, true, url + ' remember box');
    }

    /* 4) 두 사람 폼(재회·궁합) — "나"(a)만 채우고 상대(b)는 비워 둔다. 새 궁합이 켜져 있어 예전 궁합 주소는 새 궁합으로 넘어간다. */
    for (const url of ['/reunion.html', '/couple.html']) {
      await page.goto(base + url, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelector('form [name=aYear]') && document.querySelector('form [name=aYear]').value !== '', { timeout: 5000 });
      const got = await page.evaluate(() => {
        const f = document.querySelector('form [name=aYear]').form;
        const v = (n) => f.elements.namedItem(n).value;
        const gBtn = f.querySelector('[data-pick="aGender"][data-value="여"], [data-gender="여"][data-person="a"]');
        return { a: [v('aYear'), v('aMonth'), v('aDay'), v('aHour'), v('aMinute'), v('aGender'), v('aCalendar')], b: v('bYear'), gBtn: gBtn ? gBtn.classList.contains('on') : null };
      });
      assert.deepEqual(got.a, ['1995', '5', '15', '14', '30', '여', '음력'], url);
      assert.equal(got.b, '', url + ' partner stays empty');
      if (got.gBtn !== null) assert.equal(got.gBtn, true, url + ' gender button');
    }

    /* 5) 로그인 복귀 복원(pay-flow.js)이 있으면 그것이 우선한다 */
    await page.goto(base + '/love.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => sessionStorage.setItem('form:resume:/love.html', JSON.stringify({ at: Date.now(), formId: 'loveForm', fields: [{ n: 'year', v: '2001' }, { n: 'month', v: '2' }, { n: 'day', v: '3' }] })));
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(await page.evaluate(() => ['year', 'month', 'day'].map((n) => document.querySelector('#loveForm [name=' + n + ']').value)), ['2001', '2', '3']);

    /* 6) 폼에서 제출하면 바뀐 값으로 저장되고, 지우기를 누르면 사라진다 */
    await page.goto(base + '/free.html?kind=balance', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('#frForm [name=year]').value === '1995');
    await page.evaluate(() => {
      const f = document.getElementById('frForm');
      f.elements.namedItem('year').value = '1990';
      f.requestSubmit();
    });
    assert.equal(await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).year, KEY), 1990);
    await page.goto(base + '/love.html', { waitUntil: 'networkidle0' });
    await page.waitForSelector('.birth-prefill-clear');
    await page.evaluate(() => document.querySelector('.birth-prefill-clear').click());
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), KEY), null);
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(await page.$eval('#loveForm [name=year]', (e) => e.value), '');

    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
});

