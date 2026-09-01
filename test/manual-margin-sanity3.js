'use strict';
/* @page CSS 없이(=only size 지정), header/footerTemplate + JS margin 조합 테스트 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function render(marginTop, marginBottom, outPath) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const text = '가나다라마바사아자차카타파하 '.repeat(4000);
  await page.setContent(`<html><body style="margin:0;font-size:13pt;line-height:2.5;">${text}</body></html>`);
  await page.pdf({
    path: outPath, format: 'A4',
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;height:20mm;background:#0f1420;"></div>',
    footerTemplate: '<div style="width:100%;height:20mm;background:#0f1420;"></div>',
    margin: { top: `${marginTop}mm`, bottom: `${marginBottom}mm`, left: '0mm', right: '0mm' }
  });
  await browser.close();
  const buf = fs.readFileSync(outPath);
  return (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
}

async function main() {
  const dir = path.join(__dirname, '..', 'output');
  const p1 = await render(10, 14, path.join(dir, 'margin-test3-a.pdf'));
  const p2 = await render(30, 40, path.join(dir, 'margin-test3-b.pdf'));
  console.log('(no @page CSS) top10/bottom14 ->', p1, 'pages');
  console.log('(no @page CSS) top30/bottom40 ->', p2, 'pages');
}
main().catch(e => { console.error(e); process.exit(1); });
