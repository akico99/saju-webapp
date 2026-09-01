'use strict';
/* 흰 줄 문제 재점검용 초경량 테스트 — 실제 18장을 전부 렌더링하지 않고, 긴 더미
   본문 2개 챕터만으로 "새 페이지 시작" + "챕터 중간 연속 페이지"를 모두 재현한다.
   여러 margin 전략을 한 번에 렌더링해서 비교한다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BG = '#0f1420';
const GOLD = '#c7a13a';
const OUT_DIR = path.join(__dirname, '..', 'output', 'manual-full-test');

const longPara = '이것은 연속 페이지에서 본문이 페이지 상단 가장자리에 얼마나 가깝게 붙는지 확인하기 위한 더미 문단입니다. '.repeat(20);

function buildHtml() {
  return `<!DOCTYPE html>
<html><head><style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: ${BG}; }
  body { font-family: '맑은 고딕','Malgun Gothic',sans-serif; font-size: 13pt; line-height: 2.85; color: #d7dae8; }
  .section { padding: 18mm 26mm 12mm; page-break-before: always; }
  .section:first-child { page-break-before: auto; }
  h2 { color: #ece2c4; }
</style></head>
<body>
  <section class="section"><h2>챕터 1</h2><p>${longPara}${longPara}</p></section>
  <section class="section"><h2>챕터 2</h2><p>${longPara}${longPara}</p></section>
</body></html>`;
}

async function renderVariant(name, pdfOptions) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(buildHtml(), { waitUntil: 'load' });
  const outPath = path.join(OUT_DIR, `margin-exp-${name}.pdf`);
  await page.pdf({ path: outPath, format: 'A4', printBackground: true, ...pdfOptions });
  await browser.close();
  console.log('생성:', outPath);
  return outPath;
}

async function main() {
  // A. 현재 운영 중인 방식 — margin>0 + header/footerTemplate 다크 배경 트릭
  await renderVariant('A-current', {
    displayHeaderFooter: true,
    headerTemplate: `<style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}html,body{margin:0;padding:0;}</style>
      <div style="width:100%;height:8mm;padding-top:6mm;background-color:${BG};box-sizing:border-box;">
        <div style="height:0.4mm;background-color:${GOLD};"></div>
      </div>`,
    footerTemplate: `<style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}html,body{margin:0;padding:0;}</style>
      <div style="width:100%;height:11mm;padding-top:4mm;box-sizing:border-box;background-color:${BG};">
        <div style="height:0.4mm;background-color:${GOLD};"></div>
        <div style="font-size:8px;color:${GOLD};padding:3mm 26mm 0;">A안 · <span class="pageNumber"></span>/<span class="totalPages"></span></div>
      </div>`,
    margin: { top: '14mm', bottom: '18mm', left: '0mm', right: '0mm' }
  });

  // B. 체크리스트 제안 — margin 전부 0, 헤더/푸터 없음
  await renderVariant('B-margin0', {
    displayHeaderFooter: false,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
  });

  // C. margin 0 + preferCSSPageSize
  await renderVariant('C-margin0-prefercss', {
    displayHeaderFooter: false,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
    preferCSSPageSize: true
  });
}
main().catch(e => { console.error(e); process.exit(1); });
