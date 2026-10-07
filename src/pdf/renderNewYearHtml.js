'use strict';

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { getReportCss } = require('./reportCss');
const { renderBody } = require('./textMarkup');
const { safeName } = require('./personName');
const { VISUAL_CSS } = require('./visuals');
const { buildNewYearVisuals } = require('./newYearVisuals');
const { tier } = require('../llm/deepReading');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'newYear.ejs');

function birthDisplay(meta) {
  const i = meta.input;
  const calendar = i.isLunar ? '음력' : '양력';
  const time = i.hour == null ? '시각 미상' : String(i.hour).padStart(2, '0') + ':' + String(i.minute || 0).padStart(2, '0');
  return calendar + ' ' + i.year + '-' + String(i.month).padStart(2, '0') + '-' + String(i.day).padStart(2, '0') + ' ' + time;
}

function renderNewYearHtml(engine, person, reading) {
  return ejs.render(fs.readFileSync(TEMPLATE_PATH, 'utf8'), {
    reportCss: getReportCss(), visualCss: VISUAL_CSS, visuals: buildNewYearVisuals(reading),
    engine, person: { ...person, name: safeName(person && person.name), birthDisplay: birthDisplay(engine.meta) },
    reading, renderBody, tier
  }, { filename: TEMPLATE_PATH });
}

module.exports = { renderNewYearHtml, birthDisplay };
