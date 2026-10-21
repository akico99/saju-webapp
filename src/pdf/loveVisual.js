'use strict';
/* 연애 시기 리포트 결과 화면의 12개월 막대 — 엔진 숫자만으로 서버가 조립해 주문에 보관한다
   (orders.result_visual). 사용자 입력은 들어가지 않는다. 스타일은 public/love.css. */

function loveWebHtml(timing) {
  const rankOf = new Map(timing.top3.map((m, i) => [m.year + '-' + m.month, i + 1]));
  const bars = timing.months.map((m, i) => {
    const ym = m.year + '-' + m.month;
    const rank = rankOf.get(ym);
    const yearMark = i === 0 || m.month === 1 ? `<small>${m.year}</small>` : '';
    const height = Math.max(8, Math.min(100, Math.round(m.score)));
    return `<div class="love-bar${rank ? ' is-top' : ''}"${rank ? ` data-rank="${rank}"` : ''} data-ym="${ym}" style="--h:${height}%">`
      + `<span class="love-rank">${rank || ''}</span><i></i><b>${m.month}월</b>${yearMark}</div>`;
  }).join('');
  return `<section class="love-chart" aria-label="앞으로 12개월 연애 흐름"><h3 class="fr-h">앞으로 12개월 연애 흐름</h3>`
    + `<div class="love-bars">${bars}</div>`
    + '<p class="love-chart-note">막대가 높을수록 인연 신호가 강한 달이에요. 숫자는 강한 순서예요.</p></section>';
}

module.exports = { loveWebHtml };
