'use strict';

const V = require('./visuals');

function buildNewYearVisuals(reading) {
  const data = reading.data;
  const overallMonthsHtml = V.monthFlowHtml(data.months, { title: data.year + '년 월별 총운' });
  const topicBarsHtml = V.scoreBarsHtml(data.topics.map((t) => ({ label: t.label, sub: data.year + '년', score: t.score })));
  const topicCardsHtml = '<div class="ny-topic-grid">' + data.topics.map((t) => {
    const best = t.best ? t.best.month + '월' : '자료 없음';
    const caution = t.caution ? t.caution.month + '월' : '두드러진 주의 달 없음';
    const months = V.sparklineHtml(t.months, { best: t.best && t.best.month, caution: t.caution && t.caution.month });
    return '<article class="ny-topic"><div class="ny-topic-head"><h3>' + V.esc(t.label) + '</h3><b>' + t.score + '<small>점</small></b></div>' +
      '<p>가장 좋은 달 <strong>' + V.esc(best) + '</strong> · 조심할 달 <strong>' + V.esc(caution) + '</strong></p>' + months + '</article>';
  }).join('') + '</div>';
  const quarterRows = data.quarters.map((q) => ({ label: q.label, sub: q.range, score: q.avg }));
  const quarterBarsHtml = V.scoreBarsHtml(quarterRows);
  const quarters = data.quarters.map((q) => ({ ...q, color: V.TIER_COLOR[V.scoreTier(q.avg).key] }));

  return { overallMonthsHtml, topicBarsHtml, topicCardsHtml, quarterBarsHtml, quarters };
}

function newYearWebHtml(reading) {
  const v = buildNewYearVisuals(reading);
  const panel = (title, sub, html) => '<section class="vz-panel"><div class="ttl">' + V.esc(title) +
    (sub ? ' <small>' + V.esc(sub) + '</small>' : '') + '</div>' + html + '</section>';
  return '<div class="vz-web newyear-visuals">' +
    panel(reading.year + '년 총운 흐름', '월별 점수는 절기 기준이며, 숫자는 명식 엔진이 계산했습니다.', v.overallMonthsHtml) +
    panel('주제별 ' + reading.year + '년 점수', '재물·일·애정·건강 흐름', v.topicBarsHtml) +
    panel('네 가지 주제의 월별 흐름', '금색은 가장 좋은 달, 붉은색은 조심할 달', v.topicCardsHtml) +
    panel('분기별 흐름', '각 분기 3개월의 평균 점수', v.quarterBarsHtml) +
    '</div>';
}

module.exports = { buildNewYearVisuals, newYearWebHtml };
