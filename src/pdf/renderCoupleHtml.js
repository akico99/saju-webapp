'use strict';
/* 두 사람의 궁합(compat_v2) PDF와 웹 결과 그래프. 웹 결과와 같은 본문을 그대로 담는다(추가 AI 호출 없음).
   구성은 연애 리포트 PDF(renderLoveHtml.js)와 같다: 표지 + 요약 쪽(함께 좋은 세 달·12개월 그래프·두 사람의 네 기둥·오행·목차)
   + 이어 흐르는 본문 + 2단 12개월. 그림은 궁합 전용 JPEG(src/pdf/assets/couple), 색은 productTheme의 couple. */
const fs = require('node:fs');
const path = require('node:path');
const { getFontFaceCss } = require('./reportCss');
const { sajuChartHtml, SAJU_CHART_PDF_CSS } = require('./sajuChart');
const { themeCss } = require('../productTheme');
const { renderMarkup } = require('./textMarkup');
const { splitBlocks, monthParts } = require('../../public/love-reading-model');

const ASSETS = path.join(__dirname, 'assets', 'couple');
const imageCache = new Map();
function sharedImage(file) {
  if (!imageCache.has(file)) {
    const p = path.join(ASSETS, file);
    imageCache.set(file, fs.existsSync(p) ? 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64') : '');
  }
  return imageCache.get(file);
}
const escape = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clampH = (s) => Math.max(8, Math.min(100, Math.round(Number(s) || 0)));
const OHAENG = [['木', '목', '#4f8f78'], ['火', '화', '#c9674b'], ['土', '토', '#b48a3c'], ['金', '금', '#8b8f9c'], ['水', '수', '#3f6b9a']];

/** 결과 화면의 12개월 막대(두 사람 평균) — 엔진 숫자만으로 서버가 만들어 orders.result_visual에 보관한다.
    사용자 입력은 들어가지 않는다. 막대 모양은 연애 리포트(public/love.css .love-bar)와 같은 클래스를 쓴다. */
function coupleWebHtml(timing) {
  if (!timing || !Array.isArray(timing.months) || !timing.months.length) return '';
  const rankOf = new Map((timing.top3 || []).map((m, i) => [m.year + '-' + m.month, i + 1]));
  const bars = timing.months.map((m, i) => {
    const ym = m.year + '-' + m.month;
    const rank = rankOf.get(ym);
    const yearMark = i === 0 || m.month === 1 ? '<small>' + m.year + '</small>' : '';
    return '<div class="love-bar' + (rank ? ' is-top' : '') + '"' + (rank ? ' data-rank="' + rank + '"' : '') + ' data-ym="' + ym + '" data-a="' + clampH(m.a.score) + '" data-b="' + clampH(m.b.score) + '" style="--h:' + clampH(m.score) + '%">'
      + '<span class="love-rank">' + (rank || '') + '</span><i></i><b>' + m.month + '월</b>' + yearMark + '</div>';
  }).join('');
  return '<section class="love-chart couple-chart" aria-label="앞으로 12개월 두 사람의 흐름"><h3 class="fr-h">앞으로 12개월 두 사람의 흐름</h3>'
    + '<div class="love-bars">' + bars + '</div>'
    + '<p class="love-chart-note">막대는 두 사람 흐름의 평균이에요. 높을수록 함께 좋은 달이고, 숫자는 좋은 순서예요.</p></section>';
}

function monthHtml(note) {
  return monthParts(note).map((p) => (p.label ? '<span class="month-label">' + escape(p.label) + '</span> ' : '') + renderMarkup(p.text)).map((t) => '<p>' + t + '</p>').join('');
}
function bodyHtml(text, action) {
  return splitBlocks(String(text || ''), action).map((b) => {
    if (b.type === 'heading') return '<h3>' + renderMarkup(b.text) + '</h3>';
    return '<p' + (b.type === 'action' ? ' class="action"' : '') + '>' + renderMarkup(b.text) + '</p>';
  }).join('\n');
}
function hourKnown(engine) { return !(engine.meta && (engine.meta.hourGiven === false || (engine.meta.input && engine.meta.input.hour == null))); }
// 여덟 글자 표(천간·지지·십신·지장간·12운성·신살) — 웹과 같은 부품(sajuChart.js)을 밝은 바탕용으로 쓴다.
function pillarsHtml(engine, label) {
  return engine && engine.manse ? sajuChartHtml(engine, { light: true, title: label }) : '';
}

function ohaengHtml(engine) {
  const c = engine && engine.counts && engine.counts.ohaeng;
  if (!c) return '';
  return '<ul class="ohaeng">' + OHAENG.map(([h, k, color]) => { const n = Number(c[h] || 0); return '<li><span>' + k + ' ' + h + '</span><i><b style="width:' + Math.min(100, n * 25) + '%;background:' + color + '"></b></i><em>' + n + '</em></li>'; }).join('') + '</ul>';
}
function chartHtml(timing) {
  const months = timing && Array.isArray(timing.months) ? timing.months : [];
  if (!months.length) return '';
  const rank = new Map((timing.top3 || []).map((m, i) => [m.year + '-' + m.month, i + 1]));
  return '<div class="chart">' + months.map((m) => {
    const r = rank.get(m.year + '-' + m.month);
    return '<div class="bar' + (r ? ' top' : '') + '"><span>' + (r || '') + '</span><div class="col"><i style="height:' + clampH(m.score) + '%"></i><u class="da" style="bottom:' + clampH(m.a.score) + '%"></u><u class="db" style="bottom:' + clampH(m.b.score) + '%"></u></div><b>' + m.month + '월</b></div>';
  }).join('') + '</div>';
}
function topCards(timing, flowText) {
  const top = timing && Array.isArray(timing.top3) ? timing.top3 : [];
  const blocks = splitBlocks(String(flowText || ''));
  return top.map((m, i) => {
    const at = blocks.findIndex((b) => b.type === 'heading' && new RegExp('^' + m.year + '\\s*년\\s*' + m.month + '\\s*월').test(b.text.replace(/\*\*/g, '')));
    const next = at >= 0 ? blocks.slice(at + 1).find((b) => b.type !== 'heading') : null;
    const first = next ? next.text.split(/(?<=[.!?])\s/)[0] : '';
    return '<div class="topcard"><small>' + ['함께 가장 좋은 달', '두 번째', '세 번째'][i] + '</small><b>' + m.year + '년 ' + m.month + '월</b>' + (first ? '<p>' + renderMarkup(first) + '</p>' : '') + '</div>';
  }).join('');
}
function birthLabel(engine) {
  const b = (engine && engine.meta && engine.meta.input) || {};
  if (!(b.year && b.month && b.day)) return '';
  return (b.isLunar ? '음력' : '양력') + ' ' + b.year + '.' + b.month + '.' + b.day + ' · ' + (b.hour == null ? '시각 모름' : String(b.hour).padStart(2, '0') + ':' + String(b.minute || 0).padStart(2, '0'));
}

const CSS = String.raw`
@page { size:A4; margin:0; }
* { box-sizing:border-box; }
html,body { margin:0; padding:0; background:#fbf6f1; color:#2b1d21; }
body { font:400 10.8pt/1.85 ReportGothic,ReportHanja,sans-serif; word-break:keep-all; overflow-wrap:anywhere; }
h1,h2 { font-family:ReportMyeongjo,ReportHanja,serif; font-weight:700; }
mark { background:linear-gradient(transparent 52%,#f6d27a 52%); color:#2b1015; font-weight:700; padding:0 .4mm; }
.cover { height:297mm; padding:20mm 22mm 16mm; background:#180a0f; color:#fff5ee; break-after:page; }
.brand { margin:0; color:#e9bac1; font-size:9pt; letter-spacing:.08em; }
.cover h1 { margin:12mm 0 3mm; font-size:34pt; line-height:1.4; }
.cover .subtitle { font-size:13pt; margin:0 0 8mm; color:#f0d8d7; }
.cover-art { display:block; width:100%; height:110mm; object-fit:cover; border-radius:3mm; }
.cover .person { margin:8mm 0 1mm; font-size:15pt; font-weight:700; }
.cover .meta { font-size:9pt; color:#dfbec4; margin:0; }
.cover .answer { margin:6mm 0 0; padding:5mm 6mm; border:1px solid #6b2c3b; border-left:3px solid #ef5368; border-radius:2mm; background:#2a1118; font-size:10.5pt; line-height:1.75; color:#fff1eb; }
.cover .answer mark { background:none; color:#ffd166; }
.cover .notice { font-size:7.8pt; color:#c9a2ab; margin:5mm 0 0; line-height:1.6; }
.flow { padding:15mm 20mm 17mm; box-decoration-break:clone; -webkit-box-decoration-break:clone; }
.summary { margin:0 0 9mm; }
.kicker { font-size:8.5pt; font-weight:700; color:#96364d; margin:0 0 2mm; letter-spacing:.1em; }
.summary h2 { font-size:19pt; margin:0 0 5mm; color:#4e182b; line-height:1.4; }
.box { border:1px solid #e3cfd5; background:#fffaf7; border-radius:2.5mm; padding:4.5mm 5mm; margin:0 0 4.5mm; break-inside:avoid; }
.box .ttl { font-size:9pt; font-weight:700; color:#852a44; margin:0 0 3mm; letter-spacing:.04em; }
.tops { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; }
.topcard { border:1px solid #ecd6db; border-top:3px solid #c23d5c; border-radius:2mm; padding:3mm 3.5mm; background:#fff; }
.topcard small { display:block; font-size:7.8pt; color:#9a3350; font-weight:700; }
.topcard b { display:block; font-size:12.5pt; color:#3a1420; margin:0.5mm 0 1.5mm; }
.topcard p { margin:0; font-size:8.6pt; line-height:1.6; color:#4a3238; }
.chart { display:grid; grid-template-columns:repeat(12,1fr); gap:1.6mm; align-items:end; height:36mm; }
.bar { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
.bar .col { position:relative; width:70%; height:28mm; display:flex; align-items:flex-end; }
.bar .col i { display:block; width:100%; background:#e4c4cb; border-radius:1mm 1mm 0 0; }
.bar.top .col i { background:#c23d5c; }
.bar .col u { position:absolute; width:1.8mm; height:1.8mm; margin-bottom:-0.9mm; border:0.3mm solid #fff; text-decoration:none; }
.bar .col .da { left:-0.9mm; border-radius:50%; background:#4e182b; }
.bar .col .db { right:-0.9mm; background:#d9a441; }
.bar span { font-size:7.5pt; font-weight:700; color:#c23d5c; height:4mm; }
.bar b { font-size:7.5pt; color:#5b4047; margin-top:1mm; font-weight:400; }
.legend { font-size:7.8pt; color:#5b4047; margin:2.5mm 0 0; }
.legend .da, .legend .db { display:inline-block; width:2mm; height:2mm; margin:0 1mm 0 2.5mm; vertical-align:middle; }
.legend .da { border-radius:50%; background:#4e182b; }
.legend .db { background:#d9a441; }
.cap { font-size:7.8pt; color:#86707a; margin:2mm 0 0; line-height:1.5; }
.two { display:grid; grid-template-columns:1fr 1fr; gap:4.5mm; }
.who { font-size:9.5pt; font-weight:700; color:#3a1420; margin:0 0 2mm; }
.pillars { display:grid; grid-template-columns:repeat(4,1fr); gap:2mm; text-align:center; margin:0 0 3mm; }
.pillar { background:#f5ece9; border-radius:1.5mm; padding:2mm 0; }
.pillar.day { background:#7d2738; color:#fff; }
.pillar small { display:block; font-size:7.5pt; opacity:.8; }
.pillar b { font-family:ReportMyeongjo,ReportHanja,serif; font-size:13pt; }
.ohaeng { list-style:none; margin:0; padding:0; }
.ohaeng li { display:grid; grid-template-columns:13mm 1fr 5mm; gap:2mm; align-items:center; font-size:8.6pt; margin:0 0 1.2mm; }
.ohaeng i { display:block; height:2.6mm; background:#efe3e0; border-radius:1.3mm; }
.ohaeng i b { display:block; height:100%; border-radius:1.3mm; }
.ohaeng em { font-style:normal; font-weight:700; text-align:right; }
.toc { list-style:none; margin:0; padding:0; columns:2; column-gap:6mm; font-size:9.2pt; }
.toc li { padding:1.3mm 0; border-bottom:1px solid #eedde1; break-inside:avoid; }
.toc span { color:#a23d57; font-weight:700; margin-right:2mm; font-size:8pt; }
.chapter { margin:0 0 9mm; }
.chapter-head { break-inside:avoid; break-after:avoid; display:flex; gap:5mm; align-items:center; border-bottom:2px solid #4e182b; padding-bottom:2.5mm; margin:0 0 4mm; }
.chapter-head .no { font-family:ReportMyeongjo,serif; font-size:22pt; color:#c23d5c; line-height:1; }
.chapter-head h2 { font-size:16.5pt; line-height:1.35; margin:0; color:#3a1420; }
.chapter-art { width:100%; height:30mm; object-fit:cover; display:block; border-radius:2mm; margin:0 0 4mm; }
.chapter h3 { font-size:10.5pt; line-height:1.5; margin:4.5mm 0 1.5mm; color:#8a2e47; break-after:avoid; }
.chapter h3::before { content:''; display:inline-block; width:2.2mm; height:2.2mm; background:#c23d5c; border-radius:50%; margin:0 2mm .3mm 0; }
.chapter p { margin:0 0 3mm; orphans:2; widows:2; }
.chapter .action { border-left:2px solid #b34260; background:#f6eaea; padding:2.5mm 4mm; border-radius:0 1.5mm 1.5mm 0; }
.months { columns:2; column-gap:6mm; }
.month { break-inside:avoid; margin:0 0 4mm; padding:3.5mm 4mm; border:1px solid #ead5da; border-radius:2mm; background:#fffaf7; font-size:9.4pt; line-height:1.7; }
.month h3 { margin:0 0 1.5mm; font-size:11pt; color:#852a44; }
.month h3::before { display:none; }
.month p { margin:0 0 1.5mm; }
.month p:last-child { margin:0; }
.month-label { font-weight:700; color:#c23d5c; font-size:8.6pt; }
.disclaimer { font-size:7.8pt; color:#86707a; border-top:1px solid #e3cfd5; padding-top:3mm; margin-top:6mm; }
`;

/** 완성된 궁합 리포트 전체를 renderPdf()용 HTML로 만든다. people: { a:{name}, b:{name} } */
function renderCoupleHtml(engineA, engineB, people, reading) {
  people = people || {};
  reading = reading || {};
  const sections = Array.isArray(reading.sections) ? reading.sections : [];
  const notes = Array.isArray(reading.monthNotes) ? reading.monthNotes : [];
  const timing = reading.timing || {};
  const timeline = Array.isArray(timing.months) ? timing.months : [];
  const nameA = String((people.a && people.a.name) || '나');
  const nameB = String((people.b && people.b.name) || '그 사람');
  const cover = sharedImage('cover.jpg');
  const answer = sections.find((s) => s.key === 'answer');
  const flow = sections.find((s) => s.key === 'flow');
  const body = sections.filter((s) => s !== answer);
  const sectionArt = { attract: 'thread.jpg', flow: 'timing.jpg', keep: 'door.jpg' };
  const toc = body.map((s, i) => '<li><span>' + String(i + 1).padStart(2, '0') + '</span>' + escape(s.title) + '</li>').join('') + (notes.length ? '<li><span>12M</span>앞으로 12개월</li>' : '');
  const chapters = body.map((s, i) => {
    const src = sectionArt[s.key] ? sharedImage(sectionArt[s.key]) : '';
    return '<section class="chapter" id="couple-section-' + i + '" data-section-key="' + escape(s.key) + '"><header class="chapter-head"><span class="no">' + String(i + 1).padStart(2, '0') + '</span><h2>' + escape(s.title) + '</h2></header>' + (src ? '<img class="chapter-art" src="' + src + '" alt="">' : '') + bodyHtml(s.text, s.key === 'keep') + '</section>';
  }).join('\n');
  const ordered = timeline.length ? timeline.map((m) => ({ m, note: notes.find((n) => Number(n.month) === Number(m.month)) })).filter((x) => x.note).map((x) => ({ ...x.note, year: x.m.year })) : notes.slice();
  const months = ordered.map((n) => '<article class="month" data-month="' + escape(n.month) + '"><h3>' + (n.year ? escape(n.year) + '년 ' : '') + escape(n.month) + '월</h3>' + monthHtml(n.note) + '</article>').join('\n');
  const tops = topCards(timing, flow && flow.text);
  const chart = chartHtml(timing);
  // 여덟 글자 표와 오행 막대를 따로 둔다. 한 상자로 묶으면 쪽에 다 들어가지 않아 2쪽 절반이 비었다.
  const personBox = (engine, name) => '<div class="box"><p class="who">' + escape(name) + '</p>' + pillarsHtml(engine) + '</div>';
  const ohaengBox = (engine, name) => '<div class="box"><p class="who">' + escape(name) + ' · 다섯 기운</p>' + ohaengHtml(engine) + '</div>';
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + escape(nameA) + ' · ' + escape(nameB) + ' — 두 사람의 궁합</title><style>' + getFontFaceCss() + '\n' + themeCss(CSS + SAJU_CHART_PDF_CSS, 'couple') + '</style></head><body>'
    + '<section class="cover"><p class="brand">사주보는 수달 · 결이 들려주는 두 사람 이야기</p><h1>두 사람의 궁합</h1><p class="subtitle">서로 끌리는 이유와 앞으로 12개월</p>' + (cover ? '<img class="cover-art" src="' + cover + '" alt="">' : '')
    + '<p class="person">' + escape(nameA) + ' · ' + escape(nameB) + '</p><p class="meta">' + escape(nameA) + ' ' + escape(birthLabel(engineA)) + '<br>' + escape(nameB) + ' ' + escape(birthLabel(engineB)) + '</p>'
    + (answer ? '<div class="answer" data-section-key="answer">' + bodyHtml(answer.text).replace(/<\/?p[^>]*>/g, ' ').trim() + '</div>' : '')
    + '<p class="notice">웹에서 읽은 전체 풀이를 그대로 담았습니다. 사주 해석은 선택을 돕는 참고 자료이며 미래나 상대의 마음을 확정하지 않습니다.</p></section>'
    + '<div class="flow">'
    + '<section class="summary"><p class="kicker">AT A GLANCE</p><h2>두 사람의 앞으로 12개월, 한눈에</h2>'
    + (tops ? '<div class="box"><p class="ttl">두 사람의 흐름이 함께 좋은 세 달</p><div class="tops">' + tops + '</div></div>' : '')
    + (chart ? '<div class="box"><p class="ttl">달마다 두 사람의 흐름</p>' + chart + '<p class="legend">막대: 두 사람 평균<span class="da"></span>' + escape(nameA) + '<span class="db"></span>' + escape(nameB) + '</p><p class="cap">숫자는 함께 좋은 순서입니다. 명리 해석을 위한 비교값이며 관계의 성공 확률이 아닙니다.</p></div>' : '')
    + '<div class="two">' + personBox(engineA, nameA) + personBox(engineB, nameB) + '</div>'
    + '<div class="two">' + ohaengBox(engineA, nameA) + ohaengBox(engineB, nameB) + '</div>'
    + '<div class="box"><p class="ttl">이 리포트의 구성</p><ol class="toc">' + toc + '</ol></div></section>'
    + chapters
    + (notes.length ? '<section class="chapter" id="couple-months"><header class="chapter-head"><span class="no">12M</span><h2>앞으로 12개월</h2></header><div class="months">' + months + '</div></section>' : '')
    + '<p class="disclaimer">이 리포트는 명리학적 해석에 근거한 참고 자료이며 상대의 마음이나 관계의 미래를 확정하지 않습니다. 관계를 이어 갈지는 두 사람이 정할 일입니다. 판매처 사주보는 수달.</p>'
    + '</div><script>window.__chartsReady = true;</script></body></html>';
}

module.exports = { renderCoupleHtml, coupleWebHtml };
