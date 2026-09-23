'use strict';
// 웹툰 페이지 시각 점검용 수동 스크립트. 서버를 띄운 뒤 실행한다.
//   SHOT_PORT=4710 SHOT_WIDTH=430 node test/manual-screenshot-webtoon.js
// 글꼴이 디자인의 절반이라 Google Fonts는 통과시키고, 분석 스크립트만 막는다.
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function main() {
  const out = path.join(__dirname, '..', 'output', 'webtoon-render');
  fs.mkdirSync(out, { recursive: true });
  const width = Number(process.env.SHOT_WIDTH || 430);
  const origin = 'http://127.0.0.1:' + (process.env.SHOT_PORT || '4710');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 240000, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const allowed = url.startsWith(origin) || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('cdn.jsdelivr.net');
    if (allowed) req.continue().catch(() => {});
    else req.abort().catch(() => {});
  });
  await page.goto(origin + '/webtoon/lifetime.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        window.scrollTo(0, y);
        y += 500;
        if (y < document.body.scrollHeight) setTimeout(step, 150);
        else setTimeout(resolve, 500);
      };
      step();
    });
  });
  await page.waitForFunction(
    () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
    { timeout: 60000, polling: 300 }
  ).catch(() => console.log('WARN: some images never loaded'));
  await page.evaluate(() => document.fonts.ready);
  const report = await page.evaluate(() => ({
    images: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length + '/' + document.images.length,
    fonts: ['Black Han Sans', 'Nanum Pen Script', 'Noto Serif KR'].map((f) => f + ':' + document.fonts.check('24px "' + f + '"', '가')),
    height: document.body.scrollHeight,
  }));
  console.log(JSON.stringify(report));
  // 전체 캡처는 화면을 한 번에 늘려서 형광펜 애니메이션이 그리는 도중에 찍힌다. 미리 다 그려 둔다.
  await page.evaluate(() => document.querySelectorAll('.hl').forEach((el) => el.classList.add('is-drawn')));
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 1200));
  // 고정 버튼은 전체 캡처에서 엉뚱한 위치에 찍히므로 숨기고, 실제 화면 캡처로 따로 확인한다.
  await page.addStyleTag({ content: '.cta-bar{display:none!important}' });
  await page.screenshot({ path: path.join(out, 'full-' + width + '.png'), fullPage: true });
  await page.addStyleTag({ content: '.cta-bar{display:block!important}' });
  await page.evaluate(() => window.scrollTo(0, 400));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(out, 'viewport-' + width + '.png') });
  await browser.close();
  console.log('saved', path.join(out, 'full-' + width + '.png'));
}

main().catch((e) => { console.error(e); process.exit(1); });
