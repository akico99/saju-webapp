'use strict';
/* 주제별 심층 리딩(3,900원) 공유 카드 — 완성된 리딩에서 1080x1920 PNG를 만든다(AI 호출 없음).
   renderCard.js와 같은 방식(EJS → Puppeteer 스크린샷)이되 그래프는 정적 HTML/CSS 막대라 chart.js가 없다.
   결론 문장·월별 점수는 deepVisuals/deepReading이 엔진 숫자로 만든 값을 그대로 쓴다. */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const V = require('./visuals');
const { verdictSentence } = require('./deepVisuals');
const { DEEP_TOPICS } = require('../llm/deepReading');
const { getFontFaceCss } = require('./reportCss');
const { safeName } = require('./personName');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'deepCard.ejs');
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

/* 결론 문장 길이에 따라 글자 크기를 줄인다 — 템플릿의 4줄 제한(CSS)에 걸리기 전에 크기로 먼저 맞춘다. */
function verdictFontSize(text) {
  const n = [...String(text || '')].length;
  if (n <= 36) return 56;
  if (n <= 60) return 48;
  if (n <= 90) return 41;
  return 35;
}

function barsHtml(months) {
  if (!months || !months.length) return '';
  const hi = months.reduce((a, b) => (b.score > a.score ? b : a));
  return months.map((m, i) => {
    const t = V.scoreTier(m.score);
    const best = m === hi;
    // 막대 높이는 가장 높은 달(최소 70점 기준)에 맞춰 그린다 — 위가 휑하지 않게. 정확한 점수는 막대 위 숫자.
    const pct = Math.max(4, Math.min(100, Math.round((m.score / Math.max(hi.score, 70)) * 100)));
    const yearMark = m.month === 1 || i === 0 ? m.year : '';
    return '<div class="col' + (best ? ' best' : '') + '">' +
      '<div class="bar"><i style="height:' + pct + '%;background:' + V.TIER_COLOR[t.key] + '">' + (best ? '<span class="tag">최고</span>' : '') + '<span class="v">' + m.score + '</span></i></div>' +
      '<span class="h">' + m.month + '월</span><span class="y">' + yearMark + '</span></div>';
  }).join('');
}

function buildDeepCardData(person, reading) {
  const t = (reading.timing && reading.timing.data) || {};
  const months = t.months || [];
  const years = t.years || [];
  const bestMonth = months.length ? months.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const thisYear = years[0];
  const topic = DEEP_TOPICS[reading.topicKey];
  const topicLabel = topic ? topic.label : (reading.title || '심층 리딩');
  const verdict = verdictSentence(reading.chapters);
  const stats = [];
  if (bestMonth) stats.push({ k: '가장 좋은 달', v: bestMonth.month + '<small>월</small>', s: bestMonth.score + '점 · ' + V.scoreTier(bestMonth.score).label });
  if (thisYear) stats.push({ k: '올해 흐름 점수', v: thisYear.score + '<small>점</small>', s: thisYear.year + '년 · ' + V.scoreTier(thisYear.score).label });
  return {
    name: safeName(person && person.name),
    topicLabel: topicLabel, topicSize: Math.min(132, Math.floor(900 / Math.max([...topicLabel].length, 1))),
    verdict, verdictSize: verdictFontSize(verdict),
    stats, barsHtml: barsHtml(months)
  };
}

function renderDeepCardHtml(person, reading) {
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { ...buildDeepCardData(person, reading), fontFaceCss: getFontFaceCss() },
    { filename: TEMPLATE_PATH }
  );
}

/**
 * @param {object} person { name }
 * @param {object} reading generateDeepReading()의 결과(topicKey, chapters, timing.data)
 * @param {string} outputPath 저장할 .png 경로
 */
async function renderDeepCard(person, reading, outputPath) {
  const html = renderDeepCardHtml(person, reading);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('window.__chartReady === true', { timeout: 10000 });
    // renderCard.js와 같은 이유 — 폰트 로드를 기다리지 않으면 Linux 서버에서 한글이 안 보인다.
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

module.exports = { renderDeepCard, renderDeepCardHtml, buildDeepCardData };

