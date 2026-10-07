'use strict';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const puppeteer = require('puppeteer');
const V = require('./visuals');
const { getFontFaceCss } = require('./reportCss');
const { safeName } = require('./personName');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'newYearCard.ejs');
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1920;

function firstSentence(text) {
  const clean = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const match = /^(.{12,180}?[.!?。！？](?=\s|$))/.exec(clean);
  return match ? match[1] : clean.slice(0, 160);
}

function verdictFontSize(text) {
  const n = [...String(text || '')].length;
  return n <= 36 ? 56 : n <= 60 ? 48 : n <= 90 ? 41 : 35;
}

function buildNewYearCardData(person, reading) {
  const data = reading.data;
  const best = data.best;
  const rows = (data.months || []).map((m) => {
    const tier = V.scoreTier(m.score);
    return { ...m, color: V.TIER_COLOR[tier.key] };
  });
  const topicScores = (data.topics || []).map((t) => ({ label: t.label, score: t.score }));
  return {
    year: reading.year,
    name: safeName(person && person.name),
    verdict: firstSentence(reading.overall),
    verdictSize: verdictFontSize(firstSentence(reading.overall)),
    overallScore: data.overall.score,
    overallTier: V.scoreTier(data.overall.score).label,
    bestMonth: best && best.month,
    bestScore: best && best.score,
    months: rows,
    topicScores
  };
}

function renderNewYearCardHtml(person, reading) {
  return ejs.render(fs.readFileSync(TEMPLATE_PATH, 'utf8'), {
    ...buildNewYearCardData(person, reading), fontFaceCss: getFontFaceCss()
  }, { filename: TEMPLATE_PATH });
}

async function renderNewYearCard(person, reading, outputPath) {
  const html = renderNewYearCardHtml(person, reading);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: CARD_WIDTH, height: CARD_HEIGHT });
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('window.__chartReady === true', { timeout: 10000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    await browser.close();
  }
}

module.exports = { renderNewYearCard, renderNewYearCardHtml, buildNewYearCardData };
