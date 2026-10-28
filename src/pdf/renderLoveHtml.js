'use strict';
/* 연애 시기 리포트 PDF — 웹 결과와 같은 본문을 그대로 담는다(추가 AI 호출·요약·개인별 그림 없음).
   2026-10-28 개편: 장마다 새 페이지를 열고 월별 카드를 쪽 사이에서 자르지 않던 방식이 페이지 절반을
   비워 두었다. 본문은 이어 흐르게 하고, 둘째 쪽에 결론·강한 세 달·12개월 그래프·사주 네 기둥·목차를 모은다. */
const fs = require('node:fs');
const path = require('node:path');
const { getFontFaceCss } = require('./reportCss');
const { sajuChartHtml, SAJU_CHART_PDF_CSS } = require('./sajuChart');
const { renderMarkup } = require('./textMarkup');
const { splitBlocks, monthParts } = require('../../public/love-reading-model');

// PDF용 그림은 보이는 비율로 미리 자른 JPEG다(scripts/build-love-pdf-art.js). webp는 PDF에서 압축이 풀려 장당 약 1.6MB가 됐다.
const ASSETS = path.join(__dirname, 'assets', 'love');
const imageCache = new Map();
function sharedImage(file) {
  if (!imageCache.has(file)) {
    const p = path.join(ASSETS, file);
    imageCache.set(file, fs.existsSync(p) ? 'data:image/jpeg;base64,' + fs.readFileSync(p).toString('base64') : '');
  }
  return imageCache.get(file);
}
const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const OHAENG = [['木','목','#4f8f78'],['火','화','#c9674b'],['土','토','#b48a3c'],['金','금','#8b8f9c'],['水','수','#3f6b9a']];

function monthHtml(note) {
  return monthParts(note).map(p => (p.label ? '<span class="month-label">' + escape(p.label) + '</span> ' : '') + renderMarkup(p.text)).map(t => '<p>' + t + '</p>').join('');
}
function bodyHtml(text, action) {
  return splitBlocks(String(text || ''), action).map(b => {
    if (b.type === 'heading') return '<h3>' + renderMarkup(b.text) + '</h3>';
    return '<p' + (b.type === 'action' ? ' class="action"' : '') + '>' + renderMarkup(b.text) + '</p>';
  }).join('\n');
}
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
  if (!months.length || months[0].score == null) return '';
  const rank = new Map((timing.top3 || []).map((m, i) => [m.year + '-' + m.month, i + 1]));
  return '<div class="chart">' + months.map(m => { const r = rank.get(m.year + '-' + m.month); const h = Math.max(8, Math.min(100, Math.round(m.score))); return '<div class="bar' + (r ? ' top' : '') + '"><span>' + (r || '') + '</span><i style="height:' + h + '%"></i><b>' + m.month + '월</b></div>'; }).join('') + '</div><p class="cap">막대가 높을수록 인연 신호가 강한 달이에요. 숫자는 강한 순서입니다. 명리 해석을 위한 비교값이며 성공 확률이 아닙니다.</p>';
}
function topCards(timing, notes) {
  const top = timing && Array.isArray(timing.top3) ? timing.top3 : [];
  return top.map((m, i) => {
    const note = notes.find(n => Number(n.month) === Number(m.month));
    const flow = note ? (monthParts(note.note)[0] || {}).text || '' : '';
    const first = flow.split(/(?<=[.!?])\s/)[0];
    return '<div class="topcard"><small>' + ['가장 강한 달','두 번째','세 번째'][i] + '</small><b>' + m.year + '년 ' + m.month + '월</b>' + (first ? '<p>' + renderMarkup(first) + '</p>' : '') + '</div>';
  }).join('');
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
.cover-art { display:block; width:100%; height:120mm; object-fit:cover; border-radius:3mm; }
.cover .person { margin:8mm 0 1mm; font-size:15pt; font-weight:700; }
.cover .meta { font-size:9pt; color:#dfbec4; margin:0; }
.cover .answer { margin:7mm 0 0; padding:5mm 6mm; border:1px solid #6b2c3b; border-left:3px solid #ef5368; border-radius:2mm; background:#2a1118; font-size:10.5pt; line-height:1.75; color:#fff1eb; }
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
.chart { display:grid; grid-template-columns:repeat(12,1fr); gap:1.6mm; align-items:end; height:34mm; }
.bar { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; }
.bar i { display:block; width:70%; background:#e4c4cb; border-radius:1mm 1mm 0 0; }
.bar.top i { background:#c23d5c; }
.bar span { font-size:7.5pt; font-weight:700; color:#c23d5c; height:4mm; }
.bar b { font-size:7.5pt; color:#5b4047; margin-top:1mm; font-weight:400; }
.cap { font-size:7.8pt; color:#86707a; margin:2.5mm 0 0; line-height:1.5; }
.two { display:grid; grid-template-columns:1fr 1fr; gap:4.5mm; }
.pillars { display:grid; grid-template-columns:repeat(4,1fr); gap:2mm; text-align:center; }
.pillar { background:#f5ece9; border-radius:1.5mm; padding:2mm 0; }
.pillar.day { background:#7d2738; color:#fff; }
.pillar small { display:block; font-size:7.5pt; opacity:.8; }
.pillar b { font-family:ReportMyeongjo,ReportHanja,serif; font-size:14pt; }
.ohaeng { list-style:none; margin:0; padding:0; }
.ohaeng li { display:grid; grid-template-columns:13mm 1fr 5mm; gap:2mm; align-items:center; font-size:8.6pt; margin:0 0 1.4mm; }
.ohaeng i { display:block; height:2.8mm; background:#efe3e0; border-radius:1.4mm; overflow:visible; }
.ohaeng i b { display:block; height:100%; border-radius:1.4mm; }
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

/** Render a complete purchased love reading for the existing renderPdf(). */
function renderLoveHtml(engine, person, reading) {
  person = person || {};
  reading = reading || {};
  const sections = Array.isArray(reading.sections) ? reading.sections : [];
  const notes = Array.isArray(reading.monthNotes) ? reading.monthNotes : [];
  const timing = reading.timing || {};
  const timeline = Array.isArray(timing.months) ? timing.months : [];
  const birth = engine && engine.meta && engine.meta.input || {};
  const name = String(person.name || '고객');
  const birthLabel = birth.year && birth.month && birth.day
    ? (birth.isLunar ? '음력' : '양력') + ' ' + birth.year + '.' + birth.month + '.' + birth.day + ' · ' + (birth.hour == null ? '태어난 시각 모름' : String(birth.hour).padStart(2,'0') + ':' + String(birth.minute || 0).padStart(2,'0')) : '';
  const title = reading.title || '연애 시기 리포트';
  const cover = sharedImage('cover.jpg');
  const answer = sections.find(s => s.key === 'answer');
  const body = sections.filter(s => s !== answer);
  const sectionArt = { top:'timing.jpg', drawn:'thread.jpg', pattern:'door.jpg' };
  const toc = body.map((s, i) => '<li><span>' + String(i + 1).padStart(2,'0') + '</span>' + escape(s.title) + '</li>').join('') + (notes.length ? '<li><span>12M</span>앞으로 12개월</li>' : '');
  const chapters = body.map((s, i) => {
    const src = sectionArt[s.key] ? sharedImage(sectionArt[s.key]) : '';
    return '<section class="chapter" id="love-section-' + i + '" data-section-key="' + escape(s.key) + '"><header class="chapter-head"><span class="no">' + String(i + 1).padStart(2,'0') + '</span><h2>' + escape(s.title) + '</h2></header>' + (src ? '<img class="chapter-art" src="' + src + '" alt="">' : '') + bodyHtml(s.text, s.key === 'action') + '</section>';
  }).join('\n');
  // 연도는 엔진의 12개월 순서를 따른다(월 숫자만으로는 1월에서 해가 넘어간다). 짝이 없는 옛 기록도 버리지 않는다.
  const ordered = timeline.length ? timeline.map(m => ({ ...m, note:notes.find(n => Number(n.month) === Number(m.month)) })).filter(m => m.note).map(m => ({ ...m.note, year:m.year })) : notes.slice();
  const seen = new Set(ordered.map(n => Number(n.month)));
  ordered.push(...notes.filter(n => !seen.has(Number(n.month))));
  const months = ordered.map(n => '<article class="month" data-month="' + escape(n.month) + '"><h3>' + (n.year ? escape(n.year) + '년 ' : '') + escape(n.month) + '월</h3>' + monthHtml(n.note) + '</article>').join('\n');
  const tops = topCards(timing, notes);
  const chart = chartHtml(timing);
  const pil = pillarsHtml(engine), oh = ohaengHtml(engine);
  return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + escape(name) + '님의 ' + escape(title) + '</title><style>' + getFontFaceCss() + '\n' + CSS + SAJU_CHART_PDF_CSS + '</style></head><body>'
    + '<section class="cover"><p class="brand">사주보는 수달 · 여울의 연애 이야기</p><h1>인연의 시기</h1><p class="subtitle">' + escape(title) + '</p>' + (cover ? '<img class="cover-art" src="' + cover + '" alt="">' : '') + '<p class="person">' + escape(name) + '님을 위한 이야기</p><p class="meta">' + escape(birthLabel) + '</p>'
    + (answer ? '<div class="answer" data-section-key="answer">' + bodyHtml(answer.text).replace(/<\/?p[^>]*>/g, ' ').trim() + '</div>' : '')
    + '<p class="notice">웹에서 읽은 전체 풀이를 그대로 담았습니다. 사주 해석은 선택을 돕는 참고 자료이며 미래나 상대의 마음을 확정하지 않습니다.</p></section>'
    + '<div class="flow">'
    + '<section class="summary"><p class="kicker">AT A GLANCE</p><h2>' + escape(name) + '님의 앞으로 12개월, 한눈에</h2>'
    + (tops ? '<div class="box"><p class="ttl">인연 신호가 강한 세 달</p><div class="tops">' + tops + '</div></div>' : '')
    + (chart ? '<div class="box"><p class="ttl">달마다 인연 신호의 세기</p>' + chart + '</div>' : '')
    + (pil || oh ? '<div class="two">' + (pil ? '<div class="box"><p class="ttl">사주 여덟 글자</p>' + pil + '</div>' : '') + (oh ? '<div class="box"><p class="ttl">다섯 기운의 분포</p>' + oh + '</div>' : '') + '</div>' : '')
    + '<div class="box"><p class="ttl">이 리포트의 구성</p><ol class="toc">' + toc + '</ol></div></section>'
    + chapters
    + (notes.length ? '<section class="chapter" id="love-months"><header class="chapter-head"><span class="no">12M</span><h2>앞으로 12개월</h2></header><div class="months">' + months + '</div></section>' : '')
    + '<p class="disclaimer">이 리포트는 명리학적 해석에 근거한 참고 자료이며 상대의 마음이나 미래를 확정하지 않습니다. 판매처 사주보는 수달.</p>'
    + '</div><script>window.__chartsReady = true;</script></body></html>';
}

module.exports = { renderLoveHtml };

