'use strict';
/* Puppeteer margin 파라미터가 실제로 페이지 수에 영향을 주는지 격리 테스트 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function render(marginMm, outPath) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const text = '가나다라마바사아자차카타파하 '.repeat(4000);
  await page.setContent(`<html><body style="font-size:13pt;line-height:2.5;">${text}</body></html>`);
  await page.pdf({
    path: outPath, format: 'A4',
    margin: { top: `${marginMm}mm`, bottom: `${marginMm}mm`, left: `${marginMm}mm`, right: `${marginMm}mm` }
  });
  await browser.close();
  const buf = fs.readFileSync(outPath);
  return (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
}

async function main() {
  const dir = path.join(__dirname, '..', 'output');
  const p1 = await render(10, path.join(dir, 'margin-test-10mm.pdf'));
  const p2 = await render(40, path.join(dir, 'margin-test-40mm.pdf'));
  console.log('margin 10mm ->', p1, 'pages');
  console.log('margin 40mm ->', p2, 'pages');
}
main().catch(e => { console.error(e); process.exit(1); });
