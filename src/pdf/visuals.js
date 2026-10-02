'use strict';
/* 결과물 시각 요소 — 엔진이 이미 계산한 숫자만으로 HTML/SVG 조각을 만든다.
   3,900원 리포트가 "AI가 쓴 글 몇 쪽"으로 보이던 문제를 풀기 위해, 글이 설명하는 근거를
   그래프·달력·게이지로 먼저 보여준다. LLM 호출이 없어 원가가 늘지 않고, 숫자는 엔진 값
   그대로라 글과 어긋나지 않는다.

   - 모든 조각은 문자열 HTML이다. 사용자 입력이 섞일 수 있는 글자는 esc()를 거친다.
   - 스타일은 VISUAL_CSS 한 곳에 모아 PDF 템플릿이 그대로 넣는다(클래스 접두사 vz-).
   - Puppeteer 인쇄에서 안정적으로 나오도록 캔버스/스크립트 없이 정적 SVG와 CSS만 쓴다. */

const OH = ['木', '火', '土', '金', '水'];
const OH_LABEL = { '木': '목', '火': '화', '土': '토', '金': '금', '水': '수' };
const OH_MEANING = { '木': '성장', '火': '표현', '土': '안정', '金': '결단', '水': '지혜' };
const OH_COLOR = { '木': '#4f8a63', '火': '#c65a45', '土': '#c49a34', '金': '#8c96a3', '水': '#3f6d9c' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* 점수 5단계 — deepReading.tier와 같은 경계(80/65/40/25). 색은 초록(유리)→회색(무난)→주황(주의). */
function scoreTier(score) {
  if (score >= 80) return { key: 't5', label: '크게 도움' };
  if (score >= 65) return { key: 't4', label: '순조' };
  if (score >= 40) return { key: 't3', label: '무난' };
  if (score >= 25) return { key: 't2', label: '조심' };
  return { key: 't1', label: '신중' };
}
const TIER_COLOR = { t5: '#2f7d6b', t4: '#72ab93', t3: '#d8d2c3', t2: '#e5a98f', t1: '#c9674b' };

/* 오행 레이더 — 다섯 꼭짓점 오각형. 개수가 0인 기운은 꼭짓점이 중심에 붙어 "빈 자리"가 한눈에 보인다. */
function ohaengRadarSvg(counts, opts = {}) {
  // 좌우 꼭짓점 글자("火 화 2개 · 표현")가 잘리지 않도록 가로 여백을 넉넉히 둔다.
  const size = opts.size || 220, padX = 44, W = size + padX * 2, cx = W / 2, cy = size / 2 + 6, R = size * 0.34;
  const max = Math.max(4, ...OH.map((o) => counts[o] || 0));
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const rings = [0.25, 0.5, 0.75, 1].map((f) => '<polygon points="' + OH.map((_, i) => pt(i, R * f).map((v) => v.toFixed(1)).join(',')).join(' ') + '" fill="none" stroke="#e2ddd0" stroke-width="1"/>').join('');
  const axes = OH.map((_, i) => { const [x, y] = pt(i, R); return '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#e2ddd0"/>'; }).join('');
  const poly = OH.map((o, i) => pt(i, R * Math.max(0.04, (counts[o] || 0) / max)).map((v) => v.toFixed(1)).join(',')).join(' ');
  const dots = OH.map((o, i) => { const [x, y] = pt(i, R * Math.max(0.04, (counts[o] || 0) / max)); return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2" fill="' + OH_COLOR[o] + '"/>'; }).join('');
  const labels = OH.map((o, i) => {
    const [x, y] = pt(i, R + 22);
    const n = counts[o] || 0;
    return '<text x="' + x.toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + OH_COLOR[o] + '">' + o + ' ' + OH_LABEL[o] + '</text>' +
      '<text x="' + x.toFixed(1) + '" y="' + (y + 11).toFixed(1) + '" text-anchor="middle" font-size="10" fill="' + (n ? '#5c6878' : '#c9674b') + '">' + (n ? n + '개 · ' + OH_MEANING[o] : '없음') + '</text>';
  }).join('');
  return '<svg class="vz-radar" viewBox="0 0 ' + W + ' ' + (size + 12) + '" width="100%" xmlns="http://www.w3.org/2000/svg">' + rings + axes +
    '<polygon points="' + poly + '" fill="rgba(36,52,75,.16)" stroke="#24344b" stroke-width="2" stroke-linejoin="round"/>' + dots + labels + '</svg>';
}

/* 대운 흐름 곡선 — 10년 단위 점수를 잇고, 유리(65+)/주의(40 미만) 구간을 배경 띠로 칠한다.
   points: [{label, score, sub?}], currentIndex: 지금 대운 위치(없으면 -1) */
function lifeCurveSvg(points, currentIndex = -1, opts = {}) {
  if (!points || !points.length) return '';
  const W = opts.width || 640, H = opts.height || 210, pl = 34, pr = 16, pt = 18, pb = 44;
  const iw = W - pl - pr, ih = H - pt - pb;
  const x = (i) => pl + (points.length === 1 ? iw / 2 : (i * iw) / (points.length - 1));
  const y = (s) => pt + ih - (clamp(s, 0, 100) / 100) * ih;
  const band = (from, to, color) => '<rect x="' + pl + '" y="' + y(to).toFixed(1) + '" width="' + iw + '" height="' + (y(from) - y(to)).toFixed(1) + '" fill="' + color + '"/>';
  const grid = [0, 25, 50, 75, 100].map((s) => '<line x1="' + pl + '" x2="' + (pl + iw) + '" y1="' + y(s).toFixed(1) + '" y2="' + y(s).toFixed(1) + '" stroke="#ebe7dd"/><text x="' + (pl - 6) + '" y="' + (y(s) + 3.5).toFixed(1) + '" text-anchor="end" font-size="9" fill="#9aa3ae">' + s + '</text>').join('');
  const path = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.score).toFixed(1)).join(' ');
  const area = path + ' L' + x(points.length - 1).toFixed(1) + ',' + y(0).toFixed(1) + ' L' + x(0).toFixed(1) + ',' + y(0).toFixed(1) + ' Z';
  let cur = '';
  if (currentIndex >= 0 && points[currentIndex]) {
    const cxp = x(currentIndex);
    cur = '<line x1="' + cxp.toFixed(1) + '" x2="' + cxp.toFixed(1) + '" y1="' + pt + '" y2="' + (pt + ih) + '" stroke="#c7a13a" stroke-width="1.5" stroke-dasharray="4 3"/>' +
      '<rect x="' + (cxp - 22).toFixed(1) + '" y="' + (pt - 16) + '" width="44" height="15" rx="7.5" fill="#c7a13a"/><text x="' + cxp.toFixed(1) + '" y="' + (pt - 5.5) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="#fff">지금</text>';
  }
  const dots = points.map((p, i) => {
    const t = scoreTier(p.score);
    const isCur = i === currentIndex;
    return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.score).toFixed(1) + '" r="' + (isCur ? 6 : 4.2) + '" fill="' + TIER_COLOR[t.key] + '" stroke="#fff" stroke-width="2"/>' +
      '<text x="' + x(i).toFixed(1) + '" y="' + (y(p.score) - 10).toFixed(1) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#24344b">' + p.score + '</text>' +
      '<text x="' + x(i).toFixed(1) + '" y="' + (pt + ih + 16) + '" text-anchor="middle" font-size="10" font-weight="' + (isCur ? 700 : 400) + '" fill="' + (isCur ? '#24344b' : '#6d7887') + '">' + esc(p.label) + '</text>' +
      (p.sub ? '<text x="' + x(i).toFixed(1) + '" y="' + (pt + ih + 29) + '" text-anchor="middle" font-size="9" fill="#9aa3ae">' + esc(p.sub) + '</text>' : '');
  }).join('');
  return '<svg class="vz-curve" viewBox="0 0 ' + W + ' ' + H + '" width="100%" xmlns="http://www.w3.org/2000/svg">' +
    band(65, 100, 'rgba(47,125,107,.07)') + band(0, 40, 'rgba(201,103,75,.06)') + grid +
    '<path d="' + area + '" fill="rgba(36,52,75,.06)"/><path d="' + path + '" fill="none" stroke="#24344b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
    cur + dots + '</svg>';
}

/* 가로 막대 목록 — 연도별 점수, 커리어 점수 등. rows: [{label, sub?, score, note?, highlight?}] */
function scoreBarsHtml(rows) {
  return '<div class="vz-bars">' + rows.map((r) => {
    const t = scoreTier(r.score);
    return '<div class="vz-bar' + (r.highlight ? ' hl' : '') + '"><div class="lbl"><b>' + esc(r.label) + '</b>' + (r.sub ? '<small>' + esc(r.sub) + '</small>' : '') + '</div>' +
      '<div class="track"><i style="width:' + clamp(r.score, 3, 100) + '%;background:' + TIER_COLOR[t.key] + '"></i></div>' +
      '<div class="val"><b>' + r.score + '</b><small>' + (r.note ? esc(r.note) : t.label) + '</small></div></div>';
  }).join('') + '</div>';
}

/* 게이지 카드 — 십신 묶음처럼 "얼마나 센가"를 보여줄 때. items: [{label, sub, count, grade}] */
function gaugesHtml(items) {
  return '<div class="vz-gauges">' + items.map((g) => {
    const pct = clamp(Math.round(((g.count || 0) / 4) * 100), 4, 100);
    const empty = !g.count;
    return '<div class="vz-gauge' + (empty ? ' empty' : '') + '"><div class="top"><b>' + esc(g.label) + '</b><span class="grade">' + esc(g.grade || '') + '</span></div>' +
      '<div class="track"><i style="width:' + pct + '%"></i></div><div class="sub">' + esc(g.sub) + '</div></div>';
  }).join('') + '</div>';
}

function badgesHtml(items) {
  if (!items || !items.length) return '';
  return '<div class="vz-badges">' + items.map((b) => '<div class="vz-badge"><b>' + esc(b.name) + '</b><span>' + esc(b.desc) + '</span></div>').join('') + '</div>';
}

/* 한 달 달력 — 날마다 점수 색을 칠하고, 1~3순위 날짜에 순위 표시. days: [{day, score}] */
function monthCalendarHtml(year, month, days, ranks = {}, avoids = {}) {
  const byDay = {};
  days.forEach((d) => { byDay[d.day] = d.score; });
  const first = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  let cells = WEEKDAYS.map((w, i) => '<div class="wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') + '">' + w + '</div>').join('');
  for (let i = 0; i < first; i++) cells += '<div class="cell blank"></div>';
  for (let d = 1; d <= count; d++) {
    const s = byDay[d];
    const t = s == null ? null : scoreTier(s);
    const rank = ranks[d];
    const avoid = avoids[d] && !rank;
    cells += '<div class="cell ' + (t ? t.key : 'none') + (rank ? ' rank rank' + rank : '') + (avoid ? ' avoid' : '') + '"><span class="d">' + d + '</span>' +
      (s != null ? '<span class="s">' + s + '</span>' : '') + (rank ? '<span class="r">' + rank + '순위</span>' : '') + (avoid ? '<span class="av">피함</span>' : '') + '</div>';
  }
  return '<div class="vz-cal"><div class="vz-cal-head">' + year + '년 ' + month + '월</div><div class="vz-cal-grid">' + cells + '</div>' + legendHtml() + '</div>';
}

function legendHtml() {
  return '<div class="vz-legend">' + ['t5', 't4', 't3', 't2', 't1'].map((k) => '<span><i style="background:' + TIER_COLOR[k] + '"></i>' + { t5: '80+ 크게 도움', t4: '65+ 순조', t3: '40+ 무난', t2: '25+ 조심', t1: '신중' }[k] + '</span>').join('') + '</div>';
}

/* 시간대 세로 막대 — hours: [{hour, score}], bestHour 강조 */
function hourBarsHtml(hours, bestHour) {
  const sorted = hours.slice().sort((a, b) => a.hour - b.hour);
  return '<div class="vz-hours">' + sorted.map((h) => {
    const t = scoreTier(h.score);
    const best = h.hour === bestHour;
    return '<div class="col' + (best ? ' best' : '') + '"><span class="v">' + h.score + '</span><div class="bar"><i style="height:' + clamp(h.score, 4, 100) + '%;background:' + TIER_COLOR[t.key] + '"></i></div><span class="h">' + h.hour + '시</span>' + (best ? '<span class="tag">추천</span>' : '') + '</div>';
  }).join('') + '</div>';
}

/* 한 해 12개월 — 달마다 가장 좋은 주말 점수. months: [{month, score, day}] */
/* 월별 흐름 막대 — 리딩의 "앞으로 12개월", 신년운세의 1~12월. months: [{year, month, score, note?}]
   가장 높은 달과 가장 낮은 달에 표시를 단다. note는 막대 아래 한 줄(선택). */
function monthFlowHtml(months, opts = {}) {
  if (!months || !months.length) return '';
  const hi = months.reduce((a, b) => (b.score > a.score ? b : a));
  const lo = months.reduce((a, b) => (b.score < a.score ? b : a));
  return '<div class="vz-months vz-flow">' + (opts.title ? '<div class="vz-cal-head">' + esc(opts.title) + '</div>' : '') + '<div class="grid">' + months.map((m) => {
    const t = scoreTier(m.score);
    const tag = m === hi ? '<span class="tag">최고</span>' : m === lo ? '<span class="tag low">주의</span>' : '';
    const yearMark = m.month === 1 || m === months[0] ? '<span class="d">' + m.year + '</span>' : '<span class="d">&nbsp;</span>';
    return '<div class="col' + (m === hi ? ' best' : '') + '">' + tag + '<span class="v">' + m.score + '</span><div class="bar"><i style="height:' + clamp(m.score, 4, 100) + '%;background:' + TIER_COLOR[t.key] + '"></i></div><span class="h">' + m.month + '월</span>' + yearMark + '</div>';
  }).join('') + '</div></div>';
}

function yearMonthsHtml(year, months, bestMonth) {
  return '<div class="vz-months"><div class="vz-cal-head">' + year + '년 달마다 가장 좋은 주말</div><div class="grid">' + months.map((m) => {
    const t = scoreTier(m.score);
    return '<div class="col' + (m.month === bestMonth ? ' best' : '') + '"><span class="v">' + m.score + '</span><div class="bar"><i style="height:' + clamp(m.score, 4, 100) + '%;background:' + TIER_COLOR[t.key] + '"></i></div><span class="h">' + m.month + '월</span><span class="d">' + m.month + '.' + m.day + '</span></div>';
  }).join('') + '</div></div>';
}

/* 날짜 × 시간 히트맵(출산) — rows: [{label, cells:[{hour, score}]}] */
function heatmapHtml(rows, hours, best) {
  const head = '<tr><th></th>' + hours.map((h) => '<th>' + h + '시</th>').join('') + '</tr>';
  const body = rows.map((r) => '<tr><th>' + esc(r.label) + '</th>' + hours.map((h) => {
    const c = r.cells.find((x) => x.hour === h);
    if (!c) return '<td class="none"></td>';
    const t = scoreTier(c.score);
    const isBest = best && r.key === best.key && h === best.hour;
    return '<td class="' + t.key + (isBest ? ' best' : '') + '">' + c.score + '</td>';
  }).join('') + '</tr>').join('');
  return '<table class="vz-heat">' + head + body + '</table>' + legendHtml();
}

/* 정보 카드 묶음 — 이사 당일 체크, 개업 준비 등. cards: [{icon, title, value, note}] */
function infoCardsHtml(cards) {
  return '<div class="vz-cards">' + cards.filter(Boolean).map((c) => '<div class="vz-card"><div class="ic">' + esc(c.icon || '') + '</div><div class="t">' + esc(c.title) + '</div><div class="v">' + esc(c.value) + '</div>' + (c.note ? '<div class="n">' + esc(c.note) + '</div>' : '') + '</div>').join('') + '</div>';
}

function swatchHtml(ohaeng, label, sub) {
  return '<div class="vz-swatch"><i style="background:' + (OH_COLOR[ohaeng] || '#ccc') + '"></i><div><b>' + esc(label) + '</b><span>' + esc(sub || '') + '</span></div></div>';
}

/* 두 사람 막대 나란히 — 궁합의 "두 사람의 앞으로 3년"(재회는 6개월). periods: [{label, shortLabel?, a:{score}, b:{score}, combined}]
   기간마다 A·B 막대 둘과 두 사람 평균을 보여 주고, bestIndex(평균이 가장 높은 때)에 표시를 단다.
   opts: {nameA, nameB, bestIndex, bestTag} */
function pairBarsHtml(periods, opts = {}) {
  if (!periods || !periods.length) return '';
  const bestIndex = opts.bestIndex == null ? -1 : opts.bestIndex;
  const bar = (who, score) => '<div class="col ' + who + '"><span class="v">' + score + '</span><div class="bar"><i style="height:' + clamp(score, 4, 100) + '%"></i></div></div>';
  return '<div class="vz-pair"><div class="vz-pair-legend"><span><i class="a"></i>' + esc(opts.nameA || '본인') + '</span><span><i class="b"></i>' + esc(opts.nameB || '상대방') + '</span><span><i class="c"></i>두 사람 평균</span></div>' +
    '<div class="vz-pair-grid">' + periods.map((p, i) => {
      const best = i === bestIndex;
      return '<div class="grp' + (best ? ' best' : '') + '">' + (best ? '<span class="tag">' + esc(opts.bestTag || '함께 올라가는 때') + '</span>' : '') +
        '<div class="pair">' + bar('a', p.a.score) + bar('b', p.b.score) + '</div>' +
        '<span class="h">' + esc(p.shortLabel || p.label) + '</span><span class="avg">평균 <b>' + p.combined + '</b></span></div>';
    }).join('') + '</div></div>';
}

/* 지금 할 것 / 피할 것 두 카드 — 심층 리딩의 dd-grid와 같은 모양(초록·붉은 윗선). **강조**는 rich로 바꾼다.
   rich 기본: 이스케이프 후 **굵게** → <strong class="hl">. PDF는 textMarkup.renderMarkup(<mark>)을 넘긴다. */
function ddCardsHtml(dos, donts, opts = {}) {
  const rich = opts.rich || ((s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong class="hl">$1</strong>'));
  const list = (items) => '<ol>' + items.map((t) => '<li>' + rich(t) + '</li>').join('') + '</ol>';
  const box = (cls, title, items) => (items && items.length ? '<div class="vz-dd ' + cls + '"><div class="ttl">' + esc(title) + '</div>' + list(items) + '</div>' : '');
  const a = box('do', opts.doTitle || '지금 할 것', dos), b = box('dont', opts.dontTitle || '피할 것', donts);
  if (!a && !b) return '';
  return '<div class="vz-dd-grid' + (a && b ? '' : ' one') + '">' + a + b + '</div>';
}

const PAIR_CSS = `
.vz-pair { margin-top: 1mm; }
.vz-pair-legend { display: flex; flex-wrap: wrap; gap: 1.5mm 5mm; margin: 0 0 3mm; color: #5d6776; font-size: 8.5pt; }
.vz-pair-legend i { display: inline-block; width: 3mm; height: 3mm; margin-right: 1.4mm; border-radius: .8mm; vertical-align: -.4mm; }
.vz-pair-legend i.a, .vz-pair .col.a i { background: #24344b; }
.vz-pair-legend i.b, .vz-pair .col.b i { background: #c7a13a; }
.vz-pair-legend i.c { background: #2f7d6b; border-radius: 50%; }
.vz-pair-grid { display: flex; align-items: stretch; gap: 3mm; height: 54mm; padding-top: 1mm; }
.vz-pair .grp { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; min-width: 0; padding: 0 1mm 1.5mm; border-radius: 2mm; }
.vz-pair .grp.best { background: #eef6f2; outline: 1.5px solid #2f7d6b; outline-offset: 0; }
.vz-pair .pair { flex: 1; display: flex; align-items: stretch; gap: 1.2mm; width: 100%; justify-content: center; padding-top: 7mm; }
.vz-pair .col { flex: 1; max-width: 9mm; display: flex; flex-direction: column; align-items: center; }
.vz-pair .col .v { color: #24344b; font-size: 8pt; font-weight: 700; margin-bottom: .8mm; }
.vz-pair .col .bar { flex: 1; width: 100%; display: flex; align-items: flex-end; border-radius: 1.2mm; background: #f1eee6; overflow: hidden; }
.vz-pair .col .bar i { display: block; width: 100%; border-radius: 1.2mm 1.2mm 0 0; }
.vz-pair .grp .h { margin-top: 1.2mm; color: #5d6776; font-size: 8pt; white-space: nowrap; }
.vz-pair .grp.best .h { color: #24344b; font-weight: 700; }
.vz-pair .grp .avg { margin-top: .6mm; padding: .3mm 2mm; border-radius: 2mm; background: #f1eee6; color: #5d6776; font-size: 7.5pt; white-space: nowrap; }
.vz-pair .grp .avg b { color: #24344b; font-size: 9pt; }
.vz-pair .grp.best .avg { background: #2f7d6b; color: #fff; }
.vz-pair .grp.best .avg b { color: #fff; }
.vz-pair .tag { position: absolute; top: 1mm; left: 50%; transform: translateX(-50%); padding: .3mm 1.6mm; border-radius: 1mm; background: #2f7d6b; color: #fff; font-size: 6.8pt; font-weight: 700; white-space: nowrap; }

.vz-dd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; break-inside: avoid; margin-top: 6mm; }
.vz-dd-grid.one { grid-template-columns: 1fr; }
.vz-dd { padding: 5mm 6mm; border-radius: 3mm; background: #fff; border: 1px solid #e3e1d9; }
.vz-dd.do { border-top: 3px solid #438779; }
.vz-dd.dont { border-top: 3px solid #c9674b; }
.vz-dd .ttl { margin-bottom: 3mm; font-size: 10pt; font-weight: 800; }
.vz-dd.do .ttl { color: #2f6a5e; }
.vz-dd.dont .ttl { color: #a3513a; }
.vz-dd ol { margin: 0; padding-left: 5mm; font-size: 9.5pt; line-height: 1.7; color: #354457; }
.vz-dd li { margin-bottom: 1.5mm; }
.vz-dd strong.hl, .vz-dd mark { font-weight: 700; color: #1d2c40; background: linear-gradient(transparent 58%, rgba(199,161,58,.32) 58%); }
.vz-web .vz-pair-grid { gap: 1.5mm; height: 48mm; }
.vz-web .vz-pair .col .v { font-size: 7pt; }
@media (max-width: 560px) {
  .vz-dd-grid { grid-template-columns: 1fr; }
  .vz-web .vz-pair .grp { padding: 0 .3mm 1.5mm; }
  .vz-web .vz-pair .col { max-width: 5mm; }
  .vz-web .vz-pair .grp .avg { padding: .3mm 1mm; font-size: 6.8pt; }
}
`;



const VISUAL_CSS = `
.vz-panel { margin: 0 0 6mm; padding: 5mm 6mm; border: 1px solid #e3e1d9; border-radius: 3mm; background: #fff; break-inside: avoid; }
.vz-panel > .ttl { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 3mm; color: #24344b; font-size: 10.5pt; font-weight: 700; }
.vz-panel > .ttl small { color: #7b8691; font-size: 8pt; font-weight: 400; }
.vz-panel > .cap { margin: 2.5mm 0 0; color: #6d7887; font-size: 8.5pt; line-height: 1.55; }
.vz-panel > .cap b { color: #24344b; font-weight: 700; }
.vz-two { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; break-inside: avoid; }
.vz-two > .vz-panel { margin: 0; }
.vz-radar { display: block; max-width: 86mm; margin: 0 auto; }
.vz-curve { display: block; }

.vz-bars { display: grid; gap: 2.2mm; }
.vz-bar { display: grid; grid-template-columns: 40mm 1fr 22mm; align-items: center; gap: 3mm; padding: 1.6mm 2mm; border-radius: 2mm; }
.vz-bar.hl { background: #f6efdf; }
.vz-bar .lbl b { display: block; color: #24344b; font-size: 9.5pt; font-weight: 700; line-height: 1.3; }
.vz-bar .lbl small { color: #7b8691; font-size: 7.8pt; }
.vz-bar .track { height: 3.4mm; border-radius: 1.7mm; background: #eeeae1; overflow: hidden; }
.vz-bar .track i { display: block; height: 100%; border-radius: 1.7mm; }
.vz-bar .val { text-align: right; line-height: 1.2; }
.vz-bar .val b { color: #24344b; font-size: 12pt; font-weight: 700; }
.vz-bar .val small { display: block; color: #6d7887; font-size: 7.8pt; }

.vz-gauges { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.vz-gauge { padding: 3.2mm 3.5mm; border-radius: 2.5mm; background: #f7f5f0; }
.vz-gauge .top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: .5mm 2mm; }
.vz-gauge .top b { color: #24344b; font-size: 9.5pt; font-weight: 700; }
.vz-gauge .grade { color: #2f6a5e; font-size: 8pt; font-weight: 700; }
.vz-gauge.empty .grade { color: #b3573f; }
.vz-gauge .track { height: 2.6mm; margin: 2mm 0 1.6mm; border-radius: 1.3mm; background: #e6e1d6; overflow: hidden; }
.vz-gauge .track i { display: block; height: 100%; background: #24344b; }
.vz-gauge.empty .track i { background: #c9674b; }
.vz-gauge .sub { color: #6d7887; font-size: 7.8pt; line-height: 1.45; }

.vz-badges { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2.5mm; margin-top: 3mm; }
.vz-badge { display: flex; gap: 2.5mm; align-items: baseline; padding: 2.5mm 3mm; border: 1px solid #eadfc4; border-radius: 2.5mm; background: #fbf7ec; }
.vz-badge b { flex-shrink: 0; color: #7a5a17; font-size: 9pt; font-weight: 700; }
.vz-badge span { color: #5d6776; font-size: 8pt; line-height: 1.45; }

.vz-cal-head { margin: 0 0 2.5mm; color: #24344b; font-size: 10pt; font-weight: 700; }
.vz-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1.4mm; }
.vz-cal .wd { text-align: center; color: #6d7887; font-size: 8pt; font-weight: 700; padding-bottom: 1mm; }
.vz-cal .wd.sun { color: #c0533b; } .vz-cal .wd.sat { color: #3f6d9c; }
.vz-cal .cell { position: relative; min-height: 13mm; padding: 1.4mm 1.8mm; border-radius: 2mm; background: #f3f0e9; }
.vz-cal .cell.blank { background: transparent; }
.vz-cal .cell .d { display: block; color: #24344b; font-size: 9pt; font-weight: 700; }
.vz-cal .cell .s { position: absolute; right: 1.8mm; bottom: 1.2mm; color: rgba(36,52,75,.75); font-size: 7.5pt; }
.vz-cal .cell.t5 { background: #2f7d6b; } .vz-cal .cell.t5 .d, .vz-cal .cell.t5 .s { color: #fff; }
.vz-cal .cell.t4 { background: #cfe5da; } .vz-cal .cell.t3 { background: #f1eee6; }
.vz-cal .cell.t2 { background: #f6ddd1; } .vz-cal .cell.t1 { background: #e9b7a5; }
.vz-cal .cell.rank { outline: 2px solid #c7a13a; outline-offset: -1px; }
.vz-cal .cell.rank1 { outline-width: 3px; }
.vz-cal .cell.avoid { outline: 2px dashed #c0533b; outline-offset: -1px; }
.vz-cal .cell .av { position: absolute; left: 1.6mm; bottom: 1.1mm; padding: .2mm 1.2mm; border-radius: 1mm; background: #fff; border: .3mm solid #c0533b; color: #c0533b; font-size: 6.8pt; font-weight: 700; }
.vz-avoid-list { display: grid; gap: 2.2mm; }
.vz-avoid-list .row { display: grid; grid-template-columns: 24mm 12mm 1fr; gap: 3mm; align-items: baseline; padding: 2.4mm 3mm; border: 1px dashed #d9a79a; border-radius: 2mm; background: #fdf6f3; break-inside: avoid; }
.vz-avoid-list .dt { color: #24344b; font-size: 9.5pt; font-weight: 700; }
.vz-avoid-list .sc { color: #c0533b; font-size: 9.5pt; font-weight: 700; }
.vz-avoid-list .why { color: #55606e; font-size: 8.5pt; line-height: 1.5; }
.vz-avoid-list .why small { display: block; color: #8a929c; font-size: 7.5pt; }
.vz-cal .cell .r { position: absolute; left: 1.6mm; bottom: 1.1mm; padding: .2mm 1.2mm; border-radius: 1mm; background: #c7a13a; color: #fff; font-size: 6.8pt; font-weight: 700; }
.vz-legend { display: flex; flex-wrap: wrap; gap: 1.5mm 4mm; margin-top: 3mm; color: #6d7887; font-size: 7.8pt; }
.vz-legend i { display: inline-block; width: 3mm; height: 3mm; margin-right: 1.2mm; border-radius: .8mm; vertical-align: -.4mm; }

.vz-hours, .vz-months .grid { display: flex; align-items: flex-end; gap: 2.5mm; height: 44mm; padding-top: 2mm; }
.vz-hours .col, .vz-months .col { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.vz-hours .bar, .vz-months .bar { flex: 1; width: 70%; display: flex; align-items: flex-end; border-radius: 1.5mm; background: #f1eee6; overflow: hidden; }
.vz-hours .bar i, .vz-months .bar i { display: block; width: 100%; border-radius: 1.5mm 1.5mm 0 0; }
.vz-hours .v, .vz-months .v { color: #24344b; font-size: 8.5pt; font-weight: 700; margin-bottom: 1mm; }
.vz-hours .h, .vz-months .h { margin-top: 1.2mm; color: #5d6776; font-size: 8pt; }
.vz-months .d { color: #9aa3ae; font-size: 7pt; }
.vz-hours .col.best .bar, .vz-months .col.best .bar { outline: 2px solid #c7a13a; outline-offset: 1px; }
.vz-hours .col.best .h, .vz-months .col.best .h { color: #24344b; font-weight: 700; }
.vz-hours .tag { position: absolute; top: -4.2mm; padding: .3mm 1.5mm; border-radius: 1mm; background: #c7a13a; color: #fff; font-size: 6.8pt; font-weight: 700; }
.vz-flow .col { position: relative; }
.vz-flow .tag { position: absolute; top: -4.2mm; padding: .3mm 1.2mm; border-radius: 1mm; background: #2f7d6b; color: #fff; font-size: 6.5pt; font-weight: 700; white-space: nowrap; }
.vz-flow .tag.low { background: #c9674b; }
.vz-flow .grid { gap: 1.6mm; }
.vz-months { margin-top: 1mm; }

.vz-heat { width: 100%; border-collapse: separate; border-spacing: 1.2mm; font-size: 8pt; }
.vz-heat th { color: #6d7887; font-weight: 700; font-size: 7.8pt; text-align: center; white-space: nowrap; }
.vz-heat td { height: 7mm; border-radius: 1.4mm; text-align: center; color: #24344b; font-weight: 700; }
.vz-heat td.t5 { background: #2f7d6b; color: #fff; } .vz-heat td.t4 { background: #cfe5da; } .vz-heat td.t3 { background: #f1eee6; }
.vz-heat td.t2 { background: #f6ddd1; } .vz-heat td.t1 { background: #e9b7a5; } .vz-heat td.none { background: transparent; }
.vz-heat td.best { outline: 3px solid #c7a13a; outline-offset: -1px; }

.vz-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; break-inside: avoid; }
.vz-card { padding: 4mm; border: 1px solid #e3e1d9; border-radius: 3mm; background: #fff; }
.vz-card .ic { font-size: 14pt; line-height: 1; margin-bottom: 2mm; }
.vz-card .t { color: #6d7887; font-size: 8pt; font-weight: 700; letter-spacing: .04em; }
.vz-card .v { margin-top: 1mm; color: #24344b; font-size: 11pt; font-weight: 700; line-height: 1.4; }
.vz-card .n { margin-top: 1.5mm; color: #6d7887; font-size: 8pt; line-height: 1.5; }

.vz-swatches { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.vz-swatch { display: flex; gap: 3mm; align-items: center; padding: 3mm; border-radius: 2.5mm; background: #f7f5f0; }
.vz-swatch i { width: 11mm; height: 11mm; border-radius: 2mm; flex-shrink: 0; }
.vz-swatch b { display: block; color: #24344b; font-size: 9.5pt; font-weight: 700; }
.vz-swatch span { color: #6d7887; font-size: 8pt; line-height: 1.45; }

.vz-verdict { margin: 0 0 7mm; padding: 6mm 7mm; border-radius: 4mm; background: #fff; border: 1.5px solid #c7a13a; break-inside: avoid; }
.vz-verdict .k { color: #8a6a1f; font-size: 8.5pt; font-weight: 700; letter-spacing: .08em; }
.vz-verdict .h { margin: 2mm 0 4mm; color: #1d2c40; font-family: 'ReportMyeongjo','Batang','바탕',serif; font-size: 15pt; font-weight: 700; line-height: 1.5; }
.vz-verdict .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
.vz-verdict .stat { padding: 3mm 3.5mm; border-radius: 2.5mm; background: #f7f3e8; }
.vz-verdict .stat small { display: block; color: #6d7887; font-size: 7.8pt; }
.vz-verdict .stat b { display: block; margin-top: .8mm; color: #1d2c40; font-size: 12.5pt; font-weight: 700; }
.vz-verdict .stat span { color: #6d7887; font-size: 8pt; }
.vz-verdict .vd-sub { color: #2f6a5e; font-size: 10pt; font-weight: 700; }
.vz-verdict .vd-alts { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 4mm; }
.vz-verdict .vd-alts span { padding: 1.5mm 3mm; border-radius: 2mm; background: #f7f3e8; color: #5d6776; font-size: 8.5pt; }
${PAIR_CSS}
`;

/* 웹 결과 화면 — 같은 조각을 휴대폰 폭에 맞게 접는다. mm 단위는 화면에서도 그대로 동작한다. */
const WEB_VISUAL_CSS = VISUAL_CSS + `
.vz-web { margin: 18px 0 6px; font-size: 14px; line-height: 1.6; color: #29394b; }
.vz-web .vz-panel { padding: 16px; border-radius: 14px; }
.vz-web .vz-verdict { padding: 20px; border-radius: 16px; }
.vz-web .vz-verdict .h { font-family: 'Noto Serif KR', serif; font-size: 20px; line-height: 1.5; }
.vz-web .vz-cards { margin: 0 0 6mm; }
@media (max-width: 560px) {
  .vz-web .vz-cards, .vz-web .vz-verdict .stats { grid-template-columns: 1fr; }
  .vz-web .vz-gauges, .vz-web .vz-badges, .vz-web .vz-swatches { grid-template-columns: 1fr 1fr; }
  .vz-web .vz-bar { grid-template-columns: 30mm 1fr 16mm; gap: 2mm; }
  .vz-web .vz-cal .cell { min-height: 11mm; padding: 1mm 1.2mm; }
  .vz-web .vz-cal .cell .r { display: none; }
  .vz-web .vz-cal .cell .av { display: none; }
  .vz-web .vz-hours, .vz-web .vz-months .grid { gap: 1.2mm; }
  .vz-web .vz-months .d { display: none; }
  .vz-web .vz-heat { border-spacing: .6mm; font-size: 7pt; }
}
`;

module.exports = {
  OH, OH_LABEL, OH_COLOR, OH_MEANING, esc, scoreTier, TIER_COLOR,
  ohaengRadarSvg, lifeCurveSvg, scoreBarsHtml, gaugesHtml, badgesHtml,
  monthCalendarHtml, hourBarsHtml, yearMonthsHtml, monthFlowHtml, heatmapHtml, infoCardsHtml, swatchHtml, legendHtml,
  pairBarsHtml, ddCardsHtml,
  VISUAL_CSS, WEB_VISUAL_CSS
};


