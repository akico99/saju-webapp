'use strict';
/* margin.top 값을 여러 개로 바꿔가며 렌더링해서, 흰 줄(백채색 안 된 틈)의 크기가
   margin에 비례하는지, 아니면 고정폭인지 확인 — Chromium의 header/footer 렌더링
   영역 자체가 요청한 margin보다 작게 고정되어 있는지 판별하기 위함 */
const puppeteer = require('puppeteer');
const path = require('path');

const BG = '#0f1420';

async function render(marginTop, outPath) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(`<html><head><style>html,body{margin:0;background:${BG};color:#d7dae8;font-size:14pt;}</style></head><body><p>테스트 콘텐츠입니다. 이 문단이 페이지 상단에 얼마나 가까이 오는지 확인합니다.</p></body></html>`);
  await page.pdf({
    path: outPath, format: 'A4', printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact;} html,body{margin:0;padding:0;}</style><div style="width:100%;height:${marginTop}mm;background-color:${BG};box-sizing:border-box;"></div>`,
    footerTemplate: `<div style="width:100%;height:5mm;background-color:${BG};"></div>`,
    margin: { top: `${marginTop}mm`, bottom: '5mm', left: '0mm', right: '0mm' }
  });
  await browser.close();
}

async function measure(pdfPath) {
  const { execSync } = require('child_process');
  const scriptPath = path.join(__dirname, 'measure_gap.py');
  const out = execSync(`python "${scriptPath}" "${pdfPath}"`, { encoding: 'utf8' });
  return out.trim();
}

async function main() {
  const dir = path.join(__dirname, '..', 'output');
  for (const m of [10, 20, 40]) {
    const outPath = path.join(dir, `scale-test-${m}mm.pdf`);
    await render(m, outPath);
    const gapMm = await measure(outPath);
    console.log(`margin.top=${m}mm -> 흰 틈 =`, gapMm, 'mm');
  }
}
main().catch(e => { console.error(e); process.exit(1); });
