'use strict';
// 웹툰 페이지 시각 점검용 수동 스크립트. 서버를 띄운 뒤 실행한다.
//   SHOT_PORT=4710 SHOT_WIDTH=430 node test/manual-screenshot-webtoon.js
// 글꼴이 디자인의 절반이라 Google Fonts는 통과시키고, 분석 스크립트만 막는다.
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');

async function main() {
  const out = path.join(__dirname, '..', 'output', 'webtoon-render');
  fs.mkdirSync(out, { recursive: true });
  const width = Number(process.env.SHOT_WIDTH || 430);
  const height = Number(process.env.SHOT_HEIGHT || 844);
  const route = process.env.SHOT_PATH || '/webtoon/lifetime.html';
  const origin = 'http://127.0.0.1:' + (process.env.SHOT_PORT || '4710');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 240000, args: ['--no-sandbox'] });
  try {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    const allowed = url.startsWith(origin) || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com') || url.includes('cdn.jsdelivr.net');
    if (allowed) req.continue().catch(() => {});
    else req.abort().catch(() => {});
  });
  await page.goto(new URL(route, origin).href, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 네이티브 스크롤 입력으로 실제 화면을 거친다. instant 점프만 반복하면
  // headless Chrome의 지연 로딩이 중간 화면을 관찰하지 못할 수 있다.
  for (let y = 0; y < await page.evaluate(() => document.body.scrollHeight); y += 500) {
    await page.mouse.wheel({ deltaY: 500 });
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  await page.waitForFunction(
    () => Array.from(document.images).filter((img) => !img.closest('details:not([open])')).every((img) => img.complete && img.naturalWidth > 0),
    { timeout: 60000, polling: 300 }
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([
    document.fonts.load('400 24px "Black Han Sans"', '사주는'),
    document.fonts.load('400 24px "Nanum Pen Script"', '사주는'),
    document.fonts.load('900 24px "Noto Serif KR"', '사주偏官格'),
  ]));
  const report = await page.evaluate(() => ({
    images: Array.from(document.images).filter((i) => !i.closest('details:not([open])')).every((i) => i.complete && i.naturalWidth > 0),
    fonts: [
      document.fonts.check('400 24px "Black Han Sans"', '사주는'),
      document.fonts.check('400 24px "Nanum Pen Script"', '사주는'),
      document.fonts.check('900 24px "Noto Serif KR"', '사주偏官格'),
    ],
    height: document.body.scrollHeight,
    overflow: document.documentElement.scrollWidth > innerWidth,
    summaryTop: document.querySelector('.report').getBoundingClientRect().top + scrollY,
    ctaWidth: document.querySelector('.cta').getBoundingClientRect().width,
    thoughtOverFace: (() => {
      const art = document.querySelector('.art-confused').getBoundingClientRect();
      const thought = document.querySelector('.thought.t1').getBoundingClientRect();
      return thought.bottom > art.top + 4;
    })(),
  }));
  console.log(JSON.stringify(report));
  // 전체 캡처는 화면을 한 번에 늘려서 형광펜 애니메이션이 그리는 도중에 찍힌다. 미리 다 그려 둔다.
  await page.evaluate(() => document.querySelectorAll('.hl').forEach((el) => el.classList.add('is-drawn')));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await new Promise((r) => setTimeout(r, 1200));
  // 고정 버튼은 전체 캡처에서 엉뚱한 위치에 찍히므로 숨기고, 실제 화면 캡처로 따로 확인한다.
  await page.addStyleTag({ content: '.cta-bar{display:none!important}' });
  await page.screenshot({ path: path.join(out, 'full-' + width + '.png'), fullPage: true });
  await page.addStyleTag({ content: '.cta-bar{display:block!important}' });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.join(out, 'viewport-' + width + '.png') });
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.proof-excerpt').getBoundingClientRect().top + scrollY - 180, behavior: 'instant' }));
  const proofFrame = await page.evaluate(() => {
    const proof = document.querySelector('.proof-excerpt').getBoundingClientRect();
    const cta = document.querySelector('.cta').getBoundingClientRect();
    return { excerptBottom: proof.bottom, ctaTop: cta.top };
  });
  console.log(JSON.stringify(proofFrame));
  assert.ok(proofFrame.excerptBottom < proofFrame.ctaTop - 16, '형광펜 원문 증거가 고정 버튼에 가림');
  await page.screenshot({ path: path.join(out, 'proof-' + width + '.png') });
  assert.equal(report.images, true, '보이는 이미지가 모두 로드되어야 함');
  assert.ok(report.fonts.every(Boolean), '지정한 웹폰트가 모두 로드되어야 함');
  assert.equal(report.overflow, false, '가로로 넘치는 요소가 있음');
  assert.ok(report.summaryTop <= height * 2, '3줄 요약이 두 화면 뒤로 밀림: ' + report.summaryTop);
  assert.ok(report.ctaWidth <= width, '고정 버튼이 화면을 벗어남');
  assert.equal(report.thoughtOverFace, false, '첫 생각 풍선이 얼굴 영역을 덮음');
  // 원본 펼치기·모션 줄이기·JS 비활성에서도 핵심 내용이 살아 있는지 실제 브라우저로 확인한다.
  await page.click('.sample-original summary');
  await page.waitForFunction(() => {
    const img = document.querySelector('.sample-original img');
    return img.complete && img.naturalWidth > 0;
  });
  await page.click('.sample-original summary');
  assert.equal(await page.$eval('.hl', (el) => getComputedStyle(el).backgroundSize), '100% 100%');
  await page.setJavaScriptEnabled(false);
  // JS 비활성 상태에서는 페이지 내부 RAF 폴링 대신 CSS까지 완료되는 load를 기다린다.
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  assert.equal(await page.$eval('.hl', (el) => getComputedStyle(el).backgroundSize), '100% 100%');
  assert.ok(await page.$eval('.report', (el) => el.innerText.includes('원칙과 소신')));
  await page.addStyleTag({ content: '.headline .big,.thought,.brand-name,.hj{font-family:Arial,"Malgun Gothic",sans-serif!important}' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, '대체 글꼴에서 가로 넘침');
  console.log('saved', path.join(out, 'full-' + width + '.png'));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
