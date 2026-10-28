'use strict';
// serve-products.js 화면을 모바일 크기로 찍는다: 결과 맨 위, 여덟 글자 표, 첫 장 그림.
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({ headless: true });
  const out = {};
  for (const [page, id] of [['love', 'love'], ['new-year', 'newyear'], ['reunion', 'reunion'], ['couple', 'couple']]) {
    const pg = await b.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    pg.on('response', (r) => { if (r.status() >= 400 && !/auth\/me/.test(r.url())) errs.push(r.status() + ' ' + r.url()); });
    await pg.setViewport({ width: 390, height: 844 });
    await pg.goto('http://127.0.0.1:4630/' + page + '.html?jobId=preview-' + id, { waitUntil: 'networkidle0' });
    await pg.waitForSelector('.lr-reader .lr-chapter', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 400));
    const top = await pg.evaluate(() => { const c = document.querySelector('.saju-chart'); return c ? c.getBoundingClientRect().top + scrollY - 80 : -1; });
    const files = [];
    for (const [n, y] of [['top', 0], ['chart', top], ['art', 2400]]) {
      await pg.evaluate((v) => scrollTo({ top: v, behavior: 'instant' }), Math.max(0, y));
      await new Promise((r) => setTimeout(r, 250));
      const f = path.join(os.tmpdir(), 'pp-' + id + '-' + n + '.png'); await pg.screenshot({ path: f }); files.push(f);
    }
    out[id] = { charts: await pg.$$eval('.saju-chart', (n) => n.length), errs: errs.slice(0, 4) };
    await pg.close();
  }
  console.log(JSON.stringify(out));
  await b.close();
})();

