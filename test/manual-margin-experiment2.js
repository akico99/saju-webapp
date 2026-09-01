'use strict';
/* Variant G — 최종 후보: margin=0(완전 풀블리드) + box-decoration-break:clone(연속
   페이지마다 여백 반복) + pdf-lib 후처리로 페이지 번호 스탬프. Chromium의 header/
   footerTemplate 메커니즘을 아예 안 쓰므로 그 5.3mm 강제 인셋 버그 자체를 우회한다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb } = require('pdf-lib');

const BG = '#0f1420';
const GOLD_RGB = rgb(0.78, 0.63, 0.23);
const OUT_DIR = path.join(__dirname, '..', 'output', 'manual-full-test');

const longPara = '최종 후보 검증용 더미 문단입니다. 연속 페이지에서도 여백이 유지되는지, 배경이 완전히 끝까지 칠해지는지 확인합니다. '.repeat(20);

function buildHtml() {
  return `<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: ${BG}; }
  body { font-family: '맑은 고딕','Malgun Gothic',sans-serif; font-size: 13pt; line-height: 2.85; color: #d7dae8; }
  .section {
    padding: 18mm 26mm 18mm;
    page-break-before: always;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
  }
  .section:first-child { page-break-before: auto; }
  h2 { color: #ece2c4; }
</style></head>
<body>
  <section class="section"><h2>챕터 1</h2><p>${longPara}${longPara}</p></section>
  <section class="section"><h2>챕터 2</h2><p>${longPara}${longPara}</p></section>
</body></html>`;
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(buildHtml(), { waitUntil: 'load' });
  const rawPath = path.join(OUT_DIR, 'margin-exp-G-raw.pdf');
  await page.pdf({ path: rawPath, format: 'A4', printBackground: true, displayHeaderFooter: false, margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' } });
  await browser.close();

  // 후처리: pdf-lib로 페이지 번호 스탬프
  const bytes = fs.readFileSync(rawPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const pages = pdfDoc.getPages();
  pages.forEach((p, i) => {
    const { width } = p.getSize();
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: width - 30, y: 10, size: 8, color: GOLD_RGB
    });
  });
  const outPath = path.join(OUT_DIR, 'margin-exp-G-final.pdf');
  fs.writeFileSync(outPath, await pdfDoc.save());
  console.log('생성:', outPath);
}
main().catch(e => { console.error(e); process.exit(1); });
