'use strict';
// 로컬 미리보기(newyear-serve.js)의 화면을 휴대폰 크기로 찍는다: 소개 → 입력 → 무료 첫 장 → 구매 시트 → (있으면) 유료 결과.
const puppeteer = require('puppeteer');
const path = require('path');
const base = 'http://127.0.0.1:' + (process.argv[2] || 4625);
const only = process.argv[3] || 'all';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/auth\/me|favicon|gtag|google/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
  const shot = (name, full = true) => page.screenshot({ path: path.join(__dirname, 'newyear-' + name + '.png'), fullPage: full });
  const out = {};
  if (only === 'all' || only === 'free') {
    await page.goto(base + '/new-year.html', { waitUntil: 'networkidle0' });
    out.price = await page.$eval('#newYearPrice', (n) => n.textContent);
    await shot('landing', false);
    await page.click('#startLove');
    await page.click('[data-gender="남"]');
    await page.type('input[name=year]', '1990'); await page.type('input[name=month]', '3'); await page.type('input[name=day]', '8');
    await page.click('[data-step="1"] [data-next]');
    await page.type('input[name=hour]', '7'); await page.type('input[name=minute]', '20');
    await page.click('[data-step="2"] [data-next]');
    await page.type('input[name=name]', '도현');
    await page.click('[data-step="3"] [data-next]');
    out.count = await page.$eval('#wizardCount', (n) => n.textContent);
    await shot('review', false);
    await page.click('#previewBtn');
    await page.waitForSelector('#freeReader .lr-reader', { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 800));
    out.freeChapters = await page.$$eval('#freeReader .lr-chapter', (n) => n.map((x) => x.querySelector('.lr-title').textContent));
    out.legacyHidden = await page.$eval('#legacyFreeReading', (n) => getComputedStyle(n).display === 'none');
    out.freeText = await page.$eval('#freeReader', (n) => n.innerText.slice(0, 400));
    await shot('free');
    await page.click('#stickyUnlock');
    await new Promise((r) => setTimeout(r, 400));
    out.dialogOpen = await page.$eval('#checkoutSheet', (n) => n.open);
    await shot('checkout', false);
    await page.click('#checkoutConfirm');
    out.deliveryError = await page.$eval('#deliveryError', (n) => n.hidden ? '' : n.textContent);
  }
  if (only === 'all' || only === 'paid') {
    await page.goto(base + '/new-year.html?jobId=preview-sample', { waitUntil: 'networkidle0' });
    try {
      await page.waitForSelector('#paidReader .lr-reader', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1000));
      out.paidToc = await page.$$eval('#paidReader .lr-toc-btn', (n) => n.map((x) => x.textContent));
      out.flips = await page.$$eval('.lr-flip', (n) => n.map((x) => x.getAttribute('aria-label')));
      out.monthsCards = await page.$$eval('.lr-all-months .lr-month-card', (n) => n.length);
      out.pdfLink = await page.$eval('#lovePdfDownload', (n) => !n.classList.contains('hidden'));
      await shot('paid');
      await page.click('.lr-flip');
      await new Promise((r) => setTimeout(r, 800));
      const flip = await page.$('.lr-flips');
      if (flip) await flip.screenshot({ path: path.join(__dirname, 'newyear-flip.png') });
    } catch (e) { out.paid = 'not ready: ' + e.message; }
  }
  out.errors = errors;
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
