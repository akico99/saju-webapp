'use strict';
/* 최소 재현 — 다크 배경 + 텍스트만 있는 아주 단순한 PDF도 같은 문제(본문 안 보임)가
   나는지 확인. 재현되면 Chromium 인쇄 파이프라인 자체의 문제, 안되면 report.ejs의
   특정 구조 문제로 좁혀진다. */
const puppeteer = require('puppeteer');
const path = require('path');

async function main() {
  const html = `<!DOCTYPE html>
<html><head><style>
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background-color: #0f1420; color: #d7dae8; font-size: 20pt; font-family: sans-serif; margin:0; padding: 40mm; }
</style></head>
<body><h1>테스트 제목입니다</h1><p>이 문단이 보이면 정상입니다.</p></body></html>`;

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const outPath = path.join(__dirname, '..', 'output', 'minimal-repro.pdf');
  await page.pdf({
    path: outPath, format: 'A4', printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' }
  });
  await browser.close();
  console.log('wrote', outPath);
}
main().catch(e => { console.error(e); process.exit(1); });
