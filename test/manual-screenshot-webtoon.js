'use strict';
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function main() {
  const out = path.join(__dirname, '..', 'output', 'webtoon-render');
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 240000, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 1 });
  const origin = 'http://127.0.0.1:' + (process.env.SHOT_PORT || '4710');
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!req.url().startsWith(origin)) req.abort().catch(() => {});
    else req.continue().catch(() => {});
  });
  await page.goto(origin + '/webtoon/lifetime.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        window.scrollTo(0, y);
        y += 400;
        if (y < document.body.scrollHeight) setTimeout(step, 220);
        else setTimeout(resolve, 600);
      };
      step();
    });
  });
  // lazy 이미지가 실제로 디코딩될 때까지 기다린다. 그래야 캡처가 화면과 같아진다.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('.cut img')).every((img) => img.complete && img.naturalWidth > 0),
    { timeout: 60000, polling: 300 }
  ).catch(() => console.log('WARN: some cut images never loaded'));
  const report = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.cut img'));
    return {
      total: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      missing: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')),
      height: document.body.scrollHeight
    };
  });
  console.log('images', report.loaded + '/' + report.total, 'height', report.height);
  if (report.missing.length) console.log('missing', report.missing.join(', '));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(out, 'full.png'), fullPage: true });
  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
