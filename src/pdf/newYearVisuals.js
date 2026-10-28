'use strict';
/* 2027 신년운세 결과 화면의 그래프 — 엔진 숫자만으로 서버가 조립해 주문에 보관한다(orders.result_visual).
   사용자 입력은 들어가지 않는다. 12개월 막대는 연애 상품과 같은 마크업(love-bar)이라 public/love.css와
   reading.css의 요약 그래프·강한 달 카드 플립을 그대로 쓴다. 네 주제 막대 스타일은 public/new-year-reading.css. */
const V = require('./visuals');
const { levelOf } = require('../llm/newYearReading');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clampH = (s) => Math.max(8, Math.min(100, Math.round(Number(s) || 0)));

function newYearWebHtml(reading) {
  const data = reading.data;
  const rankOf = new Map(data.top3.map((m, i) => [m.month, i + 1]));
  const watch = data.watch && data.watch.month;
  const bars = data.months.map((m, i) => {
    const rank = rankOf.get(m.month);
    const cls = 'love-bar' + (rank ? ' is-top' : '') + (m.month === watch ? ' is-watch' : '');
    return '<div class="' + cls + '"' + (rank ? ' data-rank="' + rank + '"' : '') + (m.month === watch ? ' data-watch="1"' : '') + ' data-ym="' + data.year + '-' + m.month + '" style="--h:' + clampH(m.score) + '%">'
      + '<span class="love-rank">' + (rank || (m.month === watch ? '!' : '')) + '</span><i></i><b>' + m.month + '월</b>' + (i === 0 ? '<small>' + data.year + '</small>' : '') + '</div>';
  }).join('');
  const topics = data.topics.map((t) => '<li><span>' + esc(t.label) + '</span><i><b style="width:' + clampH(t.score) + '%"></b></i><em>' + esc(levelOf(t.score)) + '</em></li>').join('');
  return '<section class="love-chart ny-chart" aria-label="' + data.year + '년 12개월 흐름"><h3 class="fr-h">' + data.year + '년 12개월 흐름</h3>'
    + '<div class="love-bars">' + bars + '</div>'
    + '<p class="love-chart-note">막대가 높을수록 흐름이 좋은 달이에요. 숫자는 좋은 순서, !는 속도를 조절할 달이에요.</p></section>'
    + '<section class="ny-topics" aria-label="네 주제의 ' + data.year + '년"><h3 class="fr-h">네 주제의 ' + data.year + '년</h3><ul>' + topics + '</ul></section>';
}

/* 예전 템플릿(templates/newYear.ejs)용 그래프 묶음 — 옛 주문 화면 호환으로만 남긴다. */
function buildNewYearVisuals(reading) {
  const data = reading.data;
  const overallMonthsHtml = V.monthFlowHtml(data.months, { title: data.year + '년 월별 총운' });
  const topicBarsHtml = V.scoreBarsHtml(data.topics.map((t) => ({ label: t.label, sub: data.year + '년', score: t.score })));
  const quarterBarsHtml = V.scoreBarsHtml(data.quarters.map((q) => ({ label: q.label, sub: q.range, score: q.avg })));
  return { overallMonthsHtml, topicBarsHtml, topicCardsHtml: '', quarterBarsHtml, quarters: data.quarters };
}

module.exports = { newYearWebHtml, buildNewYearVisuals };
