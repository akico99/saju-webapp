'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { renderMarkup } = require('./textMarkup');
const { getReportCss } = require('./reportCss');
const { safeName } = require('./personName');
const { tier } = require('../llm/deepReading');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'deep.ejs');

function formatBirthDisplay(meta) {
  const i = meta.input;
  const cal = i.isLunar ? '음력' : '양력';
  const time = i.hour != null ? `${String(i.hour).padStart(2, '0')}:${String(i.minute || 0).padStart(2, '0')}` : '시각 미상';
  return `${cal} ${i.year}-${String(i.month).padStart(2, '0')}-${String(i.day).padStart(2, '0')} ${time}`;
}

/**
 * @param {Object} engine computeSaju() 결과
 * @param {{name?:string, gender?:string}} person
 * @param {Object} reading generateDeepReading() 결과 — { title, chapters, timing }
 */
function renderDeepHtml(engine, person, reading) {
  const reportCss = getReportCss();
  const birthDisplay = formatBirthDisplay(engine.meta);
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    {
      engine, person: { ...person, birthDisplay },
      topicTitle: reading.title, chapters: reading.chapters, timing: reading.timing,
      reportCss, renderMarkup, safeName, tier
    },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderDeepHtml };
