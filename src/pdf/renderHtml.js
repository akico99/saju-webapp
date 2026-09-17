'use strict';
/* 엔진 JSON + chapters[] → 완전 self-contained HTML 문자열.
   인쇄용 표와 도표는 HTML/CSS로 그려 확대해도 선명하고 별도 차트 스크립트를 로드하지 않는다. */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { computeDaewoonScores } = require('./charts');
const { renderMarkup } = require('./textMarkup');
const { getReportCss } = require('./reportCss');
const { safeName } = require('./personName');
const { getChapterKeywords } = require('./chapterKeywords');
const { buildOhaengQuest } = require('./ohaengQuest');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'report.ejs');

function formatBirthDisplay(meta) {
  const i = meta.input;
  const cal = i.isLunar ? '음력' : '양력';
  const time = i.hour != null ? `${String(i.hour).padStart(2, '0')}:${String(i.minute || 0).padStart(2, '0')}` : '시각 미상';
  return `${cal} ${i.year}-${String(i.month).padStart(2, '0')}-${String(i.day).padStart(2, '0')} ${time}`;
}

/**
 * @param {Object} engine computeSaju() 결과
 * @param {Array} chapters generateReport() 결과 (또는 더미 데이터)
 * @param {{name, gender}} person
 * @param {string[]} [coverSummary] 표지용 3줄 요약 (generateCoverSummary 결과, 실패 시 null/undefined 가능)
 */
function renderHtml(engine, chapters, person, coverSummary) {
  const reportCss = getReportCss();
  const daewoonRows = computeDaewoonScores(engine.daewoon, engine.yongshin.final.main);

  const generatedDate = new Date().toISOString().slice(0, 10);
  const birthDisplay = formatBirthDisplay(engine.meta);

  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    {
      person: { ...person, birthDisplay },
      engine, chapters, generatedDate,
      reportCss, coverSummary, daewoonRows,
      renderMarkup, safeName, getChapterKeywords, buildOhaengQuest
    },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderHtml };
