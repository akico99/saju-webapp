'use strict';
/* 명식 별자리 다이어그램 — 연/월/일/시 네 기둥을 별자리 점으로 배치하고,
   실제 형충회합(hapchung) 데이터를 근거로 합/충 관계를 선으로 그린다.
   장식이 아니라 실제 계산된 관계를 시각화하는 SVG를 문자열로 반환한다. */

const { STEM_OHAENG } = require('../engine/constants');
const { OHAENG_COLOR } = require('./charts');

const PILLAR_ORDER = ['year', 'month', 'day', 'hour'];
const PILLAR_LABEL = { year: '연주', month: '월주', day: '일주', hour: '시주' };
const POS = {
  year: { x: 110, y: 28 },
  month: { x: 192, y: 110 },
  day: { x: 110, y: 192 },
  hour: { x: 28, y: 110 }
};
const ALL_PAIRS = [['year', 'month'], ['month', 'day'], ['day', 'hour'], ['year', 'day'], ['month', 'hour'], ['year', 'hour']];

function esc(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

/**
 * @param {Object} engine computeSaju() 결과 (palja, hapchung 필요)
 * @param {number} size SVG 한 변 길이(px)
 */
function buildStarChartSvg(engine, size = 220) {
  const { palja, hapchung } = engine;
  const branches = {
    year: palja.yearPillar.branch, month: palja.monthPillar.branch,
    day: palja.dayPillar.branch, hour: palja.hourPillar.branch
  };
  const stems = {
    year: palja.yearPillar.stem, month: palja.monthPillar.stem,
    day: palja.dayPillar.stem, hour: palja.hourPillar.stem
  };

  const chungSet = new Set((hapchung?.chung || []).map(c => c.pillars.slice().sort().join('-')));
  const yukhapSet = new Set((hapchung?.yukhap || []).map(h => h.pillars.slice().sort().join('-')));

  /* 삼합/방합은 yukhap/chung과 달리 pillars가 아니라 branches(지지 글자) 목록으로
     기록돼 있다 — 같은 지지가 여러 기둥에 걸쳐 있을 수 있으므로, 그 그룹에 속한
     지지를 가진 모든 기둥 쌍을 찾아 연결선 대상으로 삼는다. 이전 버전은 육합/충만
     체크해서, 삼합/방합만 걸린 명식은 항상 무늬 없는 기본 그리드만 보였다(실제로
     "실제 계산된 합충 관계를 그린다"는 표지 캡션과 어긋난 부분이었음). */
  function pairSetFromGroups(groups) {
    const set = new Set();
    (groups || []).forEach(g => {
      const matchedPillars = PILLAR_ORDER.filter(k => g.branches.includes(branches[k]));
      for (let i = 0; i < matchedPillars.length; i++) {
        for (let j = i + 1; j < matchedPillars.length; j++) {
          set.add([matchedPillars[i], matchedPillars[j]].sort().join('-'));
        }
      }
    });
    return set;
  }
  const samhapCompleteSet = pairSetFromGroups(hapchung?.samhap?.complete);
  const samhapHalfSet = pairSetFromGroups(hapchung?.samhap?.half);
  const banghapCompleteSet = pairSetFromGroups(hapchung?.banghap?.complete);
  const banghapHalfSet = pairSetFromGroups(hapchung?.banghap?.half);

  const gridLines = ALL_PAIRS.map(([a, b]) => {
    const key = [a, b].sort().join('-');
    const isChung = chungSet.has(key);
    const isYukhap = yukhapSet.has(key);
    const isGroupComplete = samhapCompleteSet.has(key) || banghapCompleteSet.has(key);
    const isGroupHalf = samhapHalfSet.has(key) || banghapHalfSet.has(key);
    let stroke = '#2a3350', width = 1, dash = '3 4', opacity = 0.55;
    if (isChung) { stroke = '#b5573f'; width = 1.6; dash = '5 3'; opacity = 0.9; }
    else if (isGroupComplete) { stroke = '#c7a13a'; width = 2.2; dash = 'none'; opacity = 0.95; }
    else if (isYukhap) { stroke = '#c7a13a'; width = 1.8; dash = 'none'; opacity = 0.9; }
    else if (isGroupHalf) { stroke = '#c7a13a'; width = 1.4; dash = 'none'; opacity = 0.65; }
    const dashAttr = dash === 'none' ? '' : `stroke-dasharray="${dash}"`;
    return `<line x1="${POS[a].x}" y1="${POS[a].y}" x2="${POS[b].x}" y2="${POS[b].y}" stroke="${stroke}" stroke-width="${width}" ${dashAttr} opacity="${opacity}"/>`;
  }).join('\n');

  const points = PILLAR_ORDER.map(k => {
    const ohaeng = STEM_OHAENG[stems[k]].ohaeng;
    const color = OHAENG_COLOR[ohaeng];
    const p = POS[k];
    /* anchor를 항상 middle로 두고 dx=0으로 고정 — month/hour 기둥에 start/end 앵커를 쓰면
       라벨 텍스트가 viewBox 가장자리(0, 220) 밖으로 밀려나가 잘리는 문제가 있었다. */
    const labelDy = k === 'year' ? -14 : 20;
    const labelDx = 0;
    const anchor = 'middle';
    return `
      <circle cx="${p.x}" cy="${p.y}" r="5.5" fill="${color}" opacity="0.95"/>
      <circle cx="${p.x}" cy="${p.y}" r="9" fill="none" stroke="${color}" stroke-width="1" opacity="0.35"/>
      <text x="${p.x + labelDx}" y="${p.y + labelDy + 4}" font-size="10.5" fill="#8d96b8" text-anchor="${anchor}" font-family="'Malgun Gothic',sans-serif">${PILLAR_LABEL[k]} ${esc(stems[k] + branches[k])}</text>
    `;
  }).join('\n');

  return `<svg width="${size}" height="${size}" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${points}
  </svg>`;
}

module.exports = { buildStarChartSvg };
