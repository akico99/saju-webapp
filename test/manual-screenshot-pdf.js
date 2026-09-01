'use strict';
/* 한 페이지를 화면에 꽉 채워(page-fit) 스크린샷 — 페이지 사이 뷰어 구분선과
   실제 페이지 내부 여백을 명확히 구분해서 확인하기 위함 */
const puppeteer = require('puppeteer');
const path = require('path');

async function shotFit(browser, pdfPath, pageNum, outName) {
  const page = await browser.newPage();
  await page.setViewport({ width: 700, height: 1000 });
  await page.goto('file://' + pdfPath.replace(/\\/g, '/') + `#page=${pageNum}&zoom=page-fit&t=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 20000 });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: path.join(__dirname, '..', 'output', outName) });
  await page.close();
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const pdfPath = path.join(__dirname, '..', 'output', 'manual-full-test', 'report.pdf');
  await shotFit(browser, pdfPath, 10, 'fit-p10.png');
  await shotFit(browser, pdfPath, 1, 'fit-p01.png');
  await browser.close();
  console.log('done');
}
main().catch(e => { console.error(e); process.exit(1); });
