'use strict';
/* 엔진 JSON + chapters[] → 완전 self-contained HTML 문자열.
   Chart.js는 로컬 npm 패키지의 UMD 빌드를 그대로 인라인해 오프라인에서도 동작한다(CDN 금지). */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { ohaengRadarConfig, shipsinDonutConfig, daewoonScoreLineConfig } = require('./charts');
const { renderMarkup } = require('./textMarkup');
const { getReportCss } = require('./reportCss');
const { safeName } = require('./personName');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'report.ejs');
const CHARTJS_PATH = path.join(__dirname, '..', '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js');

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
  const chartJsSource = fs.readFileSync(CHARTJS_PATH, 'utf8');

  const ohaengConfig = ohaengRadarConfig(engine.counts);
  const shipsinConfig = shipsinDonutConfig(engine.counts);
  const daewoonConfig = daewoonScoreLineConfig(engine.daewoon, engine.yongshin.final.main);

  const generatedDate = new Date().toISOString().slice(0, 10);
  const birthDisplay = formatBirthDisplay(engine.meta);

  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    {
      person: { ...person, birthDisplay },
      engine, chapters, generatedDate,
      reportCss, chartJsSource, coverSummary,
      ohaengConfig, shipsinConfig, daewoonConfig,
      renderMarkup, safeName
    },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderHtml };
