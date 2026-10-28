'use strict';
/* 여덟 글자 표(사주 원국) — 시주·일주·월주·연주의 천간·지지를 오행 색으로 크게 쓰고, 십신·지장간·12운성·신살을 붙인다.
   웹(무료 첫 장·유료 결과)과 PDF가 같은 마크업을 쓴다. 값은 모두 엔진(computeSaju) 결과이고 사용자 입력은
   들어가지 않는다(이름도 넣지 않는다). 오행 색은 hsl()로 적는다 — 상품 색 변환(productTheme.themeCss)은
   #hex·rgb()만 바꾸므로, 화(火)의 빨강이 상품 색으로 바뀌지 않는다. */
const { STEM_KO } = require('../engine/constants');
// 표에 보여 주는 지장간(여기·중기·본기 순, 흔히 쓰는 표기). 엔진의 BRANCH_HIDDEN은 격국 계산용 가중치라 여기가 빠진 지지가 있다.
const HIDDEN_SHOWN = { 子: '壬癸', 丑: '癸辛己', 寅: '戊丙甲', 卯: '甲乙', 辰: '乙癸戊', 巳: '戊庚丙', 午: '丙己丁', 未: '丁乙己', 申: '戊壬庚', 酉: '庚辛', 戌: '辛丁戊', 亥: '戊甲壬' };
// 신살은 칸이 좁아 두 개까지만 보여 준다. 연애·관계 풀이에서 자주 쓰는 것부터.
const SHINSAL_RANK = [/귀인/, /도화/, /홍염/, /역마/, /화개/, /장성/, /반안/];
const rankOf = (s) => { const i = SHINSAL_RANK.findIndex((re) => re.test(s)); return /공망/.test(s) ? 99 : i < 0 ? 50 : i; };

const OHAENG = {
  木: { ko: '목', color: 'hsl(145,38%,52%)' },
  火: { ko: '화', color: 'hsl(8,78%,60%)' },
  土: { ko: '토', color: 'hsl(40,62%,55%)' },
  金: { ko: '금', color: 'hsl(40,20%,88%)', dark: 'hsl(30,8%,42%)' },
  水: { ko: '수', color: 'hsl(212,55%,58%)' }
};
const ORDER = [['hour', '시주'], ['day', '일주'], ['month', '월주'], ['year', '연주']];
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// "도화살(일지기준)" → "도화(일지)". 공망은 그대로 둔다.
const shortShinsal = (s) => { const m = /^([^()]+?)(\(.*\))?$/.exec(String(s)); let name = m[1], basis = (m[2] || '').replace('기준', ''); if (name.length > 2) name = name.replace(/살$/, ''); return name + basis; };

function hourKnown(engine) { return !(engine.meta.hourGiven === false || engine.meta.input.hour == null); }

/** 엔진 결과를 표 데이터로 바꾼다. 태어난 시각을 모르면 시주는 known:false. */
function sajuChartData(engine) {
  const i = engine.meta.input;
  const time = hourKnown(engine) ? ' ' + i.hour + '시 ' + (i.minute || 0) + '분' : ' · 태어난 시각 모름';
  const basis = (i.isLunar ? '음력' + (i.isLeap ? '(윤달)' : '') : '양력') + ' ' + i.year + '년 ' + i.month + '월 ' + i.day + '일' + time + ' 기준';
  const columns = ORDER.map(([key, label]) => {
    const p = engine.manse[key];
    if (key === 'hour' && !hourKnown(engine)) return { key, label, known: false };
    return {
      key, label, known: true,
      stem: { char: p.stem, ko: p.stemKo, ohaeng: p.stemOhaeng, shipsin: key === 'day' ? '일간' : (p.stemShipsinKo || '') },
      branch: { char: p.branch, ko: p.branchKo, ohaeng: p.branchOhaeng, shipsin: p.branchShipsinKo || '' },
      hidden: [...(HIDDEN_SHOWN[p.branch] || '')].map((c) => STEM_KO[c]).join(' '),
      unseong: p.unseong || '',
      shinsal: (p.shinsals || []).slice().sort((a, b) => rankOf(a) - rankOf(b)).map(shortShinsal)
    };
  });
  return { basis, columns };
}

function glyph(g, light) {
  const o = OHAENG[g.ohaeng] || {};
  const color = light && o.dark ? o.dark : o.color;
  return '<b class="sc-char" style="color:' + color + '">' + esc(g.char) + '</b><span class="sc-read">' + esc(g.ko) + esc(o.ko || '') + '</span>';
}

/** 표 HTML. opts.light=true면 밝은 바탕(PDF)용 색, opts.title이 있으면 표 위에 이름을 단다. */
function sajuChartHtml(engine, opts = {}) {
  const d = sajuChartData(engine);
  const cols = d.columns.map((c) => {
    if (!c.known) return '<div class="sc-col is-unknown"><span class="sc-label">' + c.label + '</span><span class="sc-unknown">태어난 시각을<br>몰라 비워 둠</span></div>';
    return '<div class="sc-col' + (c.key === 'day' ? ' is-day' : '') + '"><span class="sc-label">' + c.label + '</span>'
      + '<span class="sc-ship">' + esc(c.stem.shipsin) + '</span>' + glyph(c.stem, opts.light)
      + glyph(c.branch, opts.light) + '<span class="sc-ship">' + esc(c.branch.shipsin) + '</span></div>';
  }).join('');
  const row = (name, fn) => '<div class="sc-row"><span class="sc-row-name">' + name + '</span>' + d.columns.map((c) => '<span>' + (c.known ? fn(c) : '-') + '</span>').join('') + '</div>';
  return '<section class="saju-chart' + (opts.light ? ' on-light' : '') + '" aria-label="사주 여덟 글자">'
    + (opts.title ? '<p class="sc-title">' + esc(opts.title) + '</p>' : '')
    + '<p class="sc-basis">' + esc(d.basis) + '</p>'
    + '<div class="sc-grid">' + cols + '</div>'
    + '<div class="sc-rows">'
    + row('지장간', (c) => esc(c.hidden))
    + row('12운성', (c) => esc(c.unseong))
    + row('신살', (c) => c.shinsal.length ? c.shinsal.slice(0, 2).map(esc).join('<br>') : '-')
    + '</div>'
    + '<p class="sc-note">가운데 테두리 칸(일주)의 위 글자가 나를 뜻하는 일간이에요. 글자 색은 오행(목·화·토·금·수)을 뜻해요.</p>'
    + '</section>';
}

// PDF(밝은 바탕)용 스타일. 웹은 public/saju-chart.css.
const SAJU_CHART_PDF_CSS = '.saju-chart{break-inside:avoid}.saju-chart .sc-title{font-size:9pt;font-weight:700;color:#852a44;margin:0 0 1mm}.saju-chart .sc-basis{font-size:7.5pt;color:#86707a;margin:0 0 1.5mm}'
  + '.saju-chart .sc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1.4mm}.saju-chart .sc-col{display:flex;flex-direction:column;align-items:center;gap:.3mm;padding:1.6mm .8mm;border-radius:2mm;background:#f5ece9}'
  + '.saju-chart .sc-col.is-day{outline:1.5px solid #b48a3c;background:#fbf3e4}.saju-chart .sc-label{font-size:7.5pt;color:#86707a}.saju-chart .sc-ship{font-size:8pt;color:#4a3238;font-weight:700}'
  + '.saju-chart .sc-char{font-family:ReportMyeongjo,ReportHanja,serif;font-size:15.5pt;line-height:1.1}.saju-chart .sc-read{font-size:7.5pt;color:#86707a}.saju-chart .sc-unknown{font-size:7.5pt;color:#86707a;text-align:center;margin:auto 0}'
  + '.saju-chart .sc-rows{margin-top:1.2mm}.saju-chart .sc-row{display:grid;grid-template-columns:13mm repeat(4,1fr);font-size:7.2pt;line-height:1.35;color:#4a3238;padding:.7mm 0;border-top:1px solid #eedde1;text-align:center}'
  + '.saju-chart .sc-row-name{text-align:left;color:#86707a}.saju-chart .sc-note{font-size:7.5pt;color:#86707a;margin:1.5mm 0 0}';

module.exports = { sajuChartData, sajuChartHtml, SAJU_CHART_PDF_CSS };

