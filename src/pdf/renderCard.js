'use strict';
/* 3초 요약 카드 — PDF 발송 전 미리 보내는 세로형(1080x1920) PNG.
   report.ejs와 동일하게 EJS + 인라인 Chart.js UMD로 self-contained HTML을 만든 뒤,
   page.pdf() 대신 page.screenshot()으로 PNG를 뽑는다. */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const { daewoonMiniLineConfig } = require('./charts');
const { buildSummaryCardData } = require('./summaryCard');
const { getFontFaceCss } = require('./reportCss');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'card.ejs');
const CHARTJS_PATH = path.join(__dirname, '..', '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js');

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

function renderCardHtml(engine, person) {
  const chartJsSource = fs.readFileSync(CHARTJS_PATH, 'utf8');
  const data = buildSummaryCardData(engine, person);
  const miniChartConfig = daewoonMiniLineConfig(engine.daewoon, engine.yongshin.final.main);

  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { ...data, chartJsSource, miniChartConfig, fontFaceCss: getFontFaceCss() },
    { filename: TEMPLATE_PATH }
  );
}

/**
 * @param {string} html renderCardHtml()의 결과
 * @param {string} outputPath 저장할 .png 경로
 */
async function renderCardImage(html, outputPath) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('window.__chartReady === true', { timeout: 10000 });
    // renderPdf.js와 같은 이유 — @font-face 폰트 로드 완료를 기다리지 않으면 배포 서버
    // (Linux, 한글 대체 폰트 없음)에서 한글이 안 보이는 카드가 나온다.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

module.exports = { renderCardHtml, renderCardImage };
