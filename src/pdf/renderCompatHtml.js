'use strict';
/* 궁합 리포트 HTML — report.ejs와 같은 CSS(report.css)를 그대로 재사용해
   본 리포트와 동일한 천문성좌 다크 테마로 만든다. */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { renderMarkup } = require('./textMarkup');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'compat.ejs');
const CSS_PATH = path.join(__dirname, 'templates', 'report.css');

/**
 * @param {Object} engineA computeSaju() 결과 (본인)
 * @param {Object} engineB computeSaju() 결과 (상대)
 * @param {{name?:string}} personA
 * @param {{name?:string}} personB
 * @param {Object} compat analyzeCompatibility() 결과
 * @param {string} text LLM이 생성한 궁합 서술 본문
 */
function renderCompatHtml(engineA, engineB, personA, personB, compat, text) {
  const reportCss = fs.readFileSync(CSS_PATH, 'utf8');
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { engineA, engineB, personA, personB, compat, text, reportCss, renderMarkup },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderCompatHtml };
