'use strict';
const puppeteer = require('puppeteer');
const path = require('path');

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:4500/landing.html', { waitUntil: 'load' });
  await page.screenshot({ path: path.join(__dirname, '..', 'output', 'manual-full-test', 'landing-full.png'), fullPage: true });
  await page.screenshot({ path: path.join(__dirname, '..', 'output', 'manual-full-test', 'landing-hero.png') });
  await browser.close();
  console.log('스크린샷 완료');
}
main().catch(e => { console.error(e); process.exit(1); });
