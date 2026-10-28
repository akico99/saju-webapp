'use strict';
// 로컬 미리보기(serve-generated.js)의 가상 결제 결과에서 장별 문단 구조와 가로 넘침을 확인한다.
const puppeteer = require('puppeteer');
(async () => {
  const kind = process.argv[2] || 'single';
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:4624/love.html?jobId=preview-' + kind, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#paidReader .lr-chapter');
  const chapters = await page.$$eval('#paidReader .lr-chapter', cs => cs.map(c => ({
    id: c.dataset.chapterId,
    paragraphs: c.querySelectorAll('.lr-paper p').length,
    headings: c.querySelectorAll('.lr-paper h3').length,
    longest: Math.max(0, ...[...c.querySelectorAll('.lr-paper p')].map(x => x.textContent.length))
  })));
  console.log(JSON.stringify(chapters));
  console.log('overflow', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await browser.close();
})();
