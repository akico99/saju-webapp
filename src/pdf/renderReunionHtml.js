'use strict';
/* 「다시, 우리」 PDF와 결과 화면 그래프. 연애 시기 리포트 PDF(renderLoveHtml.js)와 같은 짜임이다:
   표지(한 줄 답) → 한눈에 보기(관계 신호가 강한 세 달·12개월 그래프·두 사람의 네 기둥·끌림과 부딪힘·목차)
   → 이어 흐르는 본문 → 2단 12개월. 그림은 연애 상품의 JPEG를 다시 쓴다(새로 만들지 않는다). */
const fs = require('node:fs');
const path = require('node:path');
const { getFontFaceCss } = require('./reportCss');
const { sajuChartHtml, SAJU_CHART_PDF_CSS } = require('./sajuChart');
const { themeCss } = require('../productTheme');
const { renderMarkup } = require('./textMarkup');
const { splitBlocks, monthParts } = require('../../public/love-reading-model');

const ASSETS = path.join(__dirname, 'assets', 'reunion');
const imageCache = new Map();
function sharedImage(file) {
  if (!imageCache.has(file)) {
    const p = path.join(ASSETS, file);
    imageCache.set(file, fs.existsSync(p) ? 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64') : '');
  }
  return imageCache.get(file);
}
const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SAFETY_OPEN = '이 리포트는 재회를 약속하지 않습니다. 다가갈지 멈출지는 당신이 정할 일이며, 상대가 거리를 원하면 그 뜻을 존중해 주세요.';
const SAFETY_BOUNDARY = '상대가 거리를 원한 상황이라, 이 리포트는 연락을 권하지 않고 경계를 존중하며 내 마음을 돌보는 쪽으로 읽었습니다. 결정은 언제나 당신의 몫입니다.';
const safetyText = (reading) => reading && reading.boundary ? SAFETY_BOUNDARY : SAFETY_OPEN;

/** 결과 화면의 12개월 막대(주문의 result_visual). 엔진 숫자만 쓴다. 스타일은 public/love.css의 love-bar를 그대로 쓴다. */
function reunionWebHtml(timing) {
  const rankOf = new Map(timing.top3.map((m, i) => [m.year + '-' + m.month, i + 1]));
  const bars = timing.months.map((m, i) => {
    const ym = m.year + '-' + m.month;
    const rank = rankOf.get(ym);
    const yearMark = i === 0 || m.month === 1 ? '<small>' + m.year + '</small>' : '';
    const height = Math.max(8, Math.min(100, Math.round(m.score)));
    return '<div class="love-bar' + (rank ? ' is-top' : '') + '"' + (rank ? ' data-rank="' + rank + '"' : '') + ' data-ym="' + ym + '" style="--h:' + height + '%">'
      + '<span class="love-rank">' + (rank || '') + '</span><i></i><b>' + m.month + '월</b>' + yearMark + '</div>';
  }).join('');
  return '<section class="love-chart" aria-label="앞으로 12개월 두 사람의 관계 흐름"><h3 class="fr-h">앞으로 12개월, 두 사람의 관계 흐름</h3>'
    + '<div class="love-bars">' + bars + '</div>'
    + '<p class="love-chart-note">막대가 높을수록 두 사람에게 관계의 기운이 함께 움직이는 달이에요. 숫자는 강한 순서이며, 재회 날짜가 아닙니다.</p></section>';
}

function monthHtml(note) {
  return monthParts(note).map(p => (p.label ? '<span class="month-label">' + escape(p.label) + '</span> ' : '') + renderMarkup(p.text)).map(t => '<p>' + t + '</p>').join('');
}
function bodyHtml(text) {
  return splitBlocks(String(text || '')).map(b => {
    if (b.type === 'heading') return '<h3>' + renderMarkup(b.text) + '</h3>';
    return '<p' + (b.type === 'action' ? ' class="action"' : '') + '>' + renderMarkup(b.text) + '</p>';
  }).join('\n');
}
// 여덟 글자 표(천간·지지·십신·지장간·12운성·신살) — 웹과 같은 부품(sajuChart.js)을 밝은 바탕용으로 쓴다.
function pillarsHtml(engine, label) {
  return engine && engine.manse ? sajuChartHtml(engine, { light: true, title: label }) : '';
}

function chartHtml(timing) {
  const months = timing && Array.isArray(timing.months) ? timing.months : [];
  if (!months.length || months[0].score == null) return '';
  const rank = new Map((timing.top3 || []).map((m, i) => [m.year + '-' + m.month, i + 1]));
  return '<div class="chart">' + months.map(m => { const r = rank.get(m.year + '-' + m.month); const h = Math.max(8, Math.min(100, Math.round(m.score))); return '<div class="bar' + (r ? ' top' : '') + '"><span>' + (r || '') + '</span><i style="height:' + h + '%"></i><b>' + m.month + '월</b></div>'; }).join('') + '</div><p class="cap">두 사람의 연애 기운을 평균한 비교값이에요. 숫자는 강한 순서이며 재회 가능성이나 날짜를 뜻하지 않습니다.</p>';
}
function topCards(timing, notes) {
  const top = timing && Array.isArray(timing.top3) ? timing.top3 : [];
  return top.map((m, i) => {
    const note = notes.find(n => Number(n.month) === Number(m.month));
    const flow = note ? (monthParts(note.note)[0] || {}).text || '' : '';
    const first = flow.split(/(?<=[.!?])\s/)[0];
    return '<div class="topcard"><small>' + ['가장 강한 달', '두 번째', '세 번째'][i] + '</small><b>' + m.year + '년 ' + m.month + '월</b>' + (first ? '<p>' + renderMarkup(first) + '</p>' : '') + '</div>';
  }).join('');
}
function bondHtml(bond) {
  if (!bond) return '';
  const list = (items) => '<ul class="bond">' + items.map(t => '<li>' + escape(t) + '</li>').join('') + '</ul>';
  return '<div class="two"><div class="box"><p class="ttl">우리를 끌어당긴 것</p>' + list(bond.attraction || []) + '</div><div class="box"><p class="ttl">우리가 부딪힌 곳</p>' + list(bond.friction || []) + '</div></div>';
}

const CSS = String.raw`
@page { size:A4; margin:0; }
* { box-sizing:border-box; }
html,body { margin:0; padding:0; background:#f7f4f1; color:#22202a; }
body { font:400 10.8pt/1.85 ReportGothic,ReportHanja,sans-serif; word-break:keep-all; overflow-wrap:anywhere; }
h1,h2 { font-family:ReportMyeongjo,ReportHanja,serif; font-weight:700; }
mark { background:linear-gradient(transparent 52%,#cfe0f0 52%); color:#152238; font-weight:700; padding:0 .4mm; }
.cover { height:297mm; padding:20mm 22mm 16mm; background:#121722; color:#f2f1ee; break-after:page; }
.brand { margin:0; color:#a9bad3; font-size:9pt; letter-spacing:.08em; }
.cover h1 { margin:12mm 0 3mm; font-size:34pt; line-height:1.4; }
.cover .subtitle { font-size:13pt; margin:0 0 8mm; color:#d4dae6; }
.cover-art { display:block; width:100%; height:112mm; object-fit:cover; border-radius:3mm; }
.cover .person { margin:8mm 0 1mm; font-size:15pt; font-weight:700; }
.cover .meta { font-size:9pt; color:#b7c0d0; margin:0; }
.cover .answer { margin:7mm 0 0; padding:5mm 6mm; border:1px solid #33415a; border-left:3px solid #7fa3d1; border-radius:2mm; background:#1b2232; font-size:10.5pt; line-height:1.75; color:#f2f1ee; }
.cover .answer mark { background:none; color:#ffd78a; }
.cover .notice { font-size:7.8pt; color:#9aa6ba; margin:5mm 0 0; line-height:1.6; }
.flow { padding:15mm 20mm 17mm; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
.summary { margin:0 0 9mm; }
.kicker { font-size:8.5pt; font-weight:700; color:#3d5c86; margin:0 0 2mm; letter-spacing:.1em; }
.summary h2 { font-size:19pt; margin:0 0 5mm; color:#1f2e47; line-height:1.4; }
.box { border:1px solid #d9dee7; background:#fcfbf9; border-radius:2.5mm; padding:4.5mm 5mm; margin:0 0 4.5mm; break-inside:avoid; }
.box .ttl { font-size:9pt; font-weight:700; color:#2f4e78; margin:0 0 3mm; letter-spacing:.04em; }
.safety { border-left:3px solid #7fa3d1; background:#eef3f9; font-size:9pt; line-height:1.7; }
.tops { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; }
.topcard { border:1px solid #d7deea; border-top:3px solid #46679a; border-radius:2mm; padding:3mm 3.5mm; background:#fff; }
.topcard small { display:block; font-size:7.8pt; color:#46679a; font-weight:700; }
.topcard b { display:block; font-size:12.5pt; color:#1b2740; margin:0.5mm 0 1.5mm; }
.topcard p { margin:0; font-size:8.6pt; line-height:1.6; color:#3b4352; }
.chart { display:grid; grid-template-columns:repeat(12,1fr); gap:1.6mm; align-items:end; height:34mm; }
.bar { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
.bar i { display:block; width:70%; background:#cbd6e5; border-radius:1mm 1mm 0 0; }
.bar.top i { background:#46679a; }
.bar span { font-size:7.5pt; font-weight:700; color:#46679a; height:4mm; }
.bar b { font-size:7.5pt; color:#4b5260; margin-top:1mm; font-weight:400; }
.cap { font-size:7.8pt; color:#727a88; margin:2.5mm 0 0; line-height:1.5; }
.two { display:grid; grid-template-columns:1fr 1fr; gap:4.5mm; }
.who { font-size:8.5pt; font-weight:700; color:#2f4e78; margin:0 0 1.5mm; }
.pillars { display:grid; grid-template-columns:repeat(4,1fr); gap:2mm; text-align:center; margin:0 0 3mm; }
.pillar { background:#eceff4; border-radius:1.5mm; padding:2mm 0; }
.pillar.day { background:#2f4e78; color:#fff; }
.pillar small { display:block; font-size:7.5pt; opacity:.8; }
.pillar b { font-family:ReportMyeongjo,ReportHanja,serif; font-size:13pt; }
.bond { margin:0; padding-left:4mm; font-size:8.8pt; line-height:1.65; }
.bond li { margin:0 0 1.5mm; }
.toc { list-style:none; margin:0; padding:0; columns:2; column-gap:6mm; font-size:9.2pt; }
.toc li { padding:1.3mm 0; border-bottom:1px solid #e1e5ec; break-inside:avoid; }
.toc span { color:#46679a; font-weight:700; margin-right:2mm; font-size:8pt; }
.chapter { margin:0 0 9mm; }
.chapter-head { break-inside:avoid; break-after:avoid; display:flex; gap:5mm; align-items:center; border-bottom:2px solid #1f2e47; padding-bottom:2.5mm; margin:0 0 4mm; }
.chapter-head .no { font-family:ReportMyeongjo,serif; font-size:22pt; color:#46679a; line-height:1; }
.chapter-head h2 { font-size:16.5pt; line-height:1.35; margin:0; color:#1b2740; }
.chapter-art { width:100%; height:30mm; object-fit:cover; display:block; border-radius:2mm; margin:0 0 4mm; }
.chapter h3 { font-size:10.5pt; line-height:1.5; margin:4.5mm 0 1.5mm; color:#2f4e78; break-after:avoid; }
.chapter h3::before { content:''; display:inline-block; width:2.2mm; height:2.2mm; background:#46679a; border-radius:50%; margin:0 2mm .3mm 0; }
.chapter p { margin:0 0 3mm; orphans:2; widows:2; }
.chapter .action { border-left:2px solid #46679a; background:#eaeff6; padding:2.5mm 4mm; border-radius:0 1.5mm 1.5mm 0; }
.months { columns:2; column-gap:6mm; }
.month { break-inside:avoid; margin:0 0 4mm; padding:3.5mm 4mm; border:1px solid #dde2ea; border-radius:2mm; background:#fcfbf9; font-size:9.4pt; line-height:1.7; }
.month h3 { margin:0 0 1.5mm; font-size:11pt; color:#2f4e78; }
.month h3::before { display:none; }
.month p { margin:0 0 1.5mm; }
.month p:last-child { margin:0; }
.month-label { font-weight:700; color:#46679a; font-size:8.6pt; }
.disclaimer { font-size:7.8pt; color:#727a88; border-top:1px solid #d9dee7; padding-top:3mm; margin-top:6mm; }
`;

/**
 * @param {object} engineA 나의 computeSaju 결과
 * @param {object} engineB 그 사람의 computeSaju 결과
 * @param {object} people { me:{name}, them:{name} }
 * @param {object} reading generateReunionReading 결과 (+ bond: describeBond 결과 선택)
 */
function renderReunionHtml(engineA, engineB, people, reading) {
  people = people || {};
  reading = reading || {};
  const sections = Array.isArray(reading.sections) ? reading.sections : [];
  const notes = Array.isArray(reading.monthNotes) ? reading.monthNotes : [];
  const timing = reading.timing || {};
  const timeline = Array.isArray(timing.months) ? timing.months : [];
  const nameA = String((people.me && people.me.name) || '고객');
  const nameB = people.them && people.them.name ? String(people.them.name) + '님' : '그 사람';
  const answer = sections.find(s => s.key === 'answer');
  const body = sections.filter(s => s !== answer);
  const sectionArt = { drawn: 'thread.jpg', flow: 'timing.jpg', heal: 'door.jpg' };
  const toc = body.map((s, i) => '<li><span>' + String(i + 1).padStart(2, '0') + '</span>' + escape(s.title) + '</li>').join('') + (notes.length ? '<li><span>12M</span>앞으로 12개월</li>' : '');
  const chapters = body.map((s, i) => {
    const src = sectionArt[s.key] ? sharedImage(sectionArt[s.key]) : '';
    return '<section class="chapter" data-section-key="' + escape(s.key) + '"><header class="chapter-head"><span class="no">' + String(i + 1).padStart(2, '0') + '</span><h2>' + escape(s.title) + '</h2></header>' + (src ? '<img class="chapter-art" src="' + src + '" alt="">' : '') + bodyHtml(s.text) + '</section>';
  }).join('\n');
  const ordered = timeline.length ? timeline.map(m => ({ ...m, note: notes.find(n => Number(n.month) === Number(m.month)) })).filter(m => m.note).map(m => ({ ...m.note, year: m.year })) : notes.slice();
  const months = ordered.map(n => '<article class="month" data-month="' + escape(n.month) + '"><h3>' + (n.year ? escape(n.year) + '년 ' : '') + escape(n.month) + '월</h3>' + monthHtml(n.note) + '</article>').join('\n');
  const tops = topCards(timing, notes);
  const chart = chartHtml(timing);
  const cover = sharedImage('cover.jpg');
  const topTitle = reading.boundary ? '관계의 기운이 크게 움직이는 세 달' : '두 사람의 관계 신호가 강한 세 달';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + escape(nameA) + '님의 다시, 우리</title><style>' + getFontFaceCss() + '\n' + themeCss(CSS + SAJU_CHART_PDF_CSS, 'reunion') + '</style></head><body>'
    + '<section class="cover"><p class="brand">사주보는 수달 · 달하의 관계 이야기</p><h1>다시, 우리</h1><p class="subtitle">두 사람의 사주로 읽는 재회 리포트</p>' + (cover ? '<img class="cover-art" src="' + cover + '" alt="">' : '') + '<p class="person">' + escape(nameA) + '님과 ' + escape(nameB) + '의 이야기</p>'
    + (answer ? '<div class="answer" data-section-key="answer">' + bodyHtml(answer.text).replace(/<\/?p[^>]*>/g, ' ').trim() + '</div>' : '')
    + '<p class="notice">' + escape(safetyText(reading)) + ' 사주 해석은 선택을 돕는 참고 자료이며 상대의 마음이나 미래를 확정하지 않습니다.</p></section>'
    + '<div class="flow"><section class="summary"><p class="kicker">AT A GLANCE</p><h2>두 사람의 앞으로 12개월, 한눈에</h2>'
    + '<div class="box safety">' + escape(safetyText(reading)) + '</div>'
    + (tops ? '<div class="box"><p class="ttl">' + topTitle + '</p><div class="tops">' + tops + '</div></div>' : '')
    + (chart ? '<div class="box"><p class="ttl">달마다 두 사람의 관계 흐름</p>' + chart + '</div>' : '')
    + '<div class="two"><div class="box">' + pillarsHtml(engineA, nameA + '님의 여덟 글자') + '</div><div class="box">' + pillarsHtml(engineB, nameB + '의 여덟 글자') + '</div></div>'
    + bondHtml(reading.bond)
    + '<div class="box"><p class="ttl">이 리포트의 구성</p><ol class="toc">' + toc + '</ol></div></section>'
    + chapters
    + (notes.length ? '<section class="chapter"><header class="chapter-head"><span class="no">12M</span><h2>앞으로 12개월</h2></header><div class="months">' + months + '</div></section>' : '')
    + '<p class="disclaimer">이 리포트는 명리학적 해석에 근거한 참고 자료이며 재회 여부, 상대의 마음, 미래를 확정하지 않습니다. 마음이 많이 힘들다면 믿을 만한 사람이나 전문 상담의 도움을 받아 주세요. 판매처 사주보는 수달.</p>'
    + '</div><script>window.__chartsReady = true;</script></body></html>';
}

module.exports = { renderReunionHtml, reunionWebHtml, safetyText };
