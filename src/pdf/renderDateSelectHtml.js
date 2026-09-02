'use strict';
/* 날짜 선택(택일) 리포트 PDF — quick.ejs와 같은 다크 네이비/골드 톤을 그대로 쓰되,
   quick 리포트는 항상 "한 사람의 engine"이 있다고 가정하지만 여기는 결혼(두 사람)·
   출산(부모, 본인 engine 없음)처럼 그 가정이 안 맞는 주제가 섞여 있어서 engine 객체
   대신 呼출부가 이미 만든 문자열(title/metaLine/best)을 그대로 받는 얕은 템플릿이다. */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { renderMarkup } = require('./textMarkup');
const { getReportCss } = require('./reportCss');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'dateSelect.ejs');

// LLM이 "**소제목**\n본문..." 형태로 쓴 텍스트를, 헤딩과 본문을 분리한 배열로 바꾼다.
// (systemPrompt가 이 형식을 명시적으로 지시하므로 정규식 하나로 안전하게 분리된다.)
function splitSections(text) {
  return text
    .split(/\n\n+/)
    .map((block) => {
      const m = block.match(/^\*\*(.+?)\*\*\n([\s\S]*)$/);
      if (m) return { heading: m[1].trim(), body: m[2].trim() };
      return { heading: null, body: block.trim() };
    })
    .filter((s) => s.heading || s.body);
}

/**
 * @param {Object} p
 * @param {string} p.title 예: "김민준 님의 이사 리포트"
 * @param {string} p.eyebrow 예: "命 式 關 係 圖 · 이사 리포트"
 * @param {string} p.metaLine HTML 허용되는 메타 정보 한 줄(예: "생년월일 ... · 목표 2026년 10월")
 * @param {string} [p.bestLabel] 예: "이사하기 가장 좋은 때"
 * @param {string} [p.bestValue] 예: "2026.10.12 (월) 9시"
 * @param {string} p.text LLM이 쓴 본문 전체
 */
function renderDateSelectHtml({ title, eyebrow, metaLine, bestLabel, bestValue, text }) {
  const reportCss = getReportCss();
  const sections = splitSections(text);
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { title, eyebrow, metaLine, bestLabel, bestValue, sections, renderMarkup, reportCss },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderDateSelectHtml };
