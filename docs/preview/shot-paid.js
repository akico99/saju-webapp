'use strict';
// 로컬 미리보기 결과 화면을 모바일 크기로 몇 군데 찍어 가독성을 점검한다(개발용).
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto('http://localhost:4624/love.html?jobId=preview-' + (process.argv[2] || 'single'), { waitUntil: 'networkidle0' });
  await page.waitForSelector('#paidReader .lr-chapter');
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const marks = await page.$$eval('#paidReader strong, #paidReader mark', n => n.length);
  console.log(JSON.stringify({ height: h, emphasis: marks }));
  const out = [];
  for (const y of [0, 900, 2600, 6000]) {
    await page.evaluate(v => window.scrollTo(0, v), y);
    const f = path.join(os.tmpdir(), 'paid-' + y + '.png');
    await page.screenshot({ path: f });
    out.push(f);
  }
  console.log(out.join('\n'));
  await browser.close();
})();
