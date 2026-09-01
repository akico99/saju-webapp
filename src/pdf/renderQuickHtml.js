'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { renderMarkup } = require('./textMarkup');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'quick.ejs');
const CSS_PATH = path.join(__dirname, 'templates', 'report.css');

function formatBirthDisplay(meta) {
  const i = meta.input;
  const cal = i.isLunar ? '음력' : '양력';
  const time = i.hour != null ? `${String(i.hour).padStart(2, '0')}:${String(i.minute || 0).padStart(2, '0')}` : '시각 미상';
  return `${cal} ${i.year}-${String(i.month).padStart(2, '0')}-${String(i.day).padStart(2, '0')} ${time}`;
}

/**
 * @param {Object} engine computeSaju() 결과
 * @param {{name?:string, gender?:string}} person
 * @param {string} topicTitle 표시할 주제명 (예: "재물운")
 * @param {string} text LLM이 생성한 본문
 */
function renderQuickHtml(engine, person, topicTitle, text) {
  const reportCss = fs.readFileSync(CSS_PATH, 'utf8');
  const birthDisplay = formatBirthDisplay(engine.meta);
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { engine, person: { ...person, birthDisplay }, topicTitle, text, reportCss, renderMarkup },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderQuickHtml };
