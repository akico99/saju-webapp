'use strict';
/* 택일 리포트(이사·개업·결혼·출산) 시각 요소 조립 — 라우트가 이미 계산한 모든 후보 점수를
   달력·막대·히트맵·카드로 바꾼다. PDF 템플릿과 웹 결과 화면이 같은 조각을 쓴다. */
const V = require('./visuals');

function pad(n) { return String(n).padStart(2, '0'); }
function altLine(t, i) {
  return (i + 2) + '순위 · ' + t.month + '.' + pad(t.day) + ' (' + t.weekday + ')' + (t.hour ? ' ' + t.hour + '시' : '') + ' · ' + t.score + '점';
}

// "피하면 좋은 날" 목록 — 날짜·점수·엔진이 본 이유. 이유 문장은 라우트가 엔진 사실로만 만든다.
function avoidListHtml(list) {
  return '<div class="vz-avoid-list">' + list.map((a) => '<div class="row"><span class="dt">' + a.month + '.' + pad(a.day) + ' (' + V.esc(a.weekday) + ')</span><span class="sc">' + a.score + '점</span>' +
    '<span class="why">' + V.esc(a.reason || '이 달 안에서 점수가 낮은 편이에요') +
    (a.scoreA != null ? '<small>' + V.esc(a.scoreA + ' / ' + a.scoreB) + ' (두 사람 점수)</small>' : '') + '</span></div>').join('') + '</div>';
}

function buildDateSelectParts(v) {
  if (!v) return null;
  const best = v.best;
  const tier = best ? V.scoreTier(best.score) : null;
  // 이사·개업·결혼의 순위표는 "날짜" 점수, 추천일 카드는 "날짜+시간" 점수라 숫자가 다르다 —
  // 둘을 나란히 밝혀서 90점/87점이 어긋나 보이지 않게 한다. 출산은 둘 다 시각 단위라 하나만.
  const dayScore = v.kind !== 'birth' && v.top && v.top[0] ? v.top[0].score : null;
  const verdict = {
    value: v.bestValue || '',
    sub: best ? (dayScore != null ? '날짜 점수 ' + dayScore + '점 · 추천 시각까지 맞추면 ' + best.score + '점 (' + tier.label + ')' : '종합 점수 ' + best.score + '점 · ' + tier.label) : '',
    alts: (v.top || []).slice(1, 3).map(altLine)
  };
  const panels = [];
  let cards = '';

  if (v.kind === 'month') {
    const ranks = {};
    (v.top || []).forEach((t, i) => { ranks[t.day] = i + 1; });
    const avoidMap = {};
    (v.avoid || []).forEach((a) => { avoidMap[a.day] = true; });
    panels.push({ title: v.month + '월 한 달 날짜 점수', sub: '날마다 내 용신·' + v.label + ' 궁합으로 매긴 점수', html: V.monthCalendarHtml(v.year, v.month, v.days || [], ranks, avoidMap),
      cap: '<b>진한 초록 날짜일수록 이 달 안에서 흐름이 가장 좋은 날</b>이고, 금색 테두리가 1~3순위예요.' + ((v.avoid || []).length ? ' 빨간 점선 칸(피함)은 이 달 점수가 가장 낮은 날이에요.' : '') + ' 추천일이 어렵다면 초록 칸 안에서 고르면 됩니다.' });
    if ((v.avoid || []).length) panels.push({ title: '피하면 좋은 날', sub: '이 달 점수가 가장 낮은 3일', html: avoidListHtml(v.avoid),
      cap: '꼭 그 날이어야 한다면 큰 문제는 아니고, <b>다른 날을 고를 수 있을 때 피하는 편이 무난</b>하다는 참고예요.' });
    if ((v.hours || []).length) panels.push({ title: '추천일의 시간대별 점수', sub: best ? best.month + '월 ' + best.day + '일' : '', html: V.hourBarsHtml(v.hours, best && best.hour),
      cap: '짐을 들이거나 문을 여는 <b>첫 행동을 가장 높은 막대 시간에</b> 맞추면 됩니다.' });
    const e = v.extras || {};
    if (v.occasion === 'moving') {
      cards = V.infoCardsHtml([
        best && { icon: '01', title: '이사 당일 추천 시간', value: best.hour + '시', note: '첫 짐을 이 시간에 들이세요' },
        e.direction && { icon: '02', title: '잘 맞는 방향', value: e.direction.direction, note: e.direction.note },
        e.homeObject && { icon: '03', title: '가장 먼저 들일 물건', value: e.homeObject, note: e.color ? '포인트 색: ' + e.color : '' }
      ]);
    } else {
      cards = V.infoCardsHtml([
        best && { icon: '01', title: '문을 여는 시간', value: best.hour + '시', note: '첫 손님 맞이·오픈 행사를 이 시간에' },
        e.business && { icon: '02', title: '힘이 실리는 분야', value: e.business.field, note: e.business.note },
        e.bizObject && { icon: '03', title: '공간에 둘 소품', value: e.bizObject, note: e.color ? '포인트 색: ' + e.color : '' }
      ]);
    }
  } else if (v.kind === 'couple') {
    panels.push({ title: v.year + '년 한 해 흐름', sub: '달마다 두 사람 모두에게 가장 좋은 주말', html: V.yearMonthsHtml(v.year, v.months || [], best && best.month),
      cap: '막대가 높은 달이 두 사람의 흐름이 함께 올라가는 달이에요. <b>금색 테두리가 추천 달</b>입니다.' });
    const rows = (v.top || []).map((t, i) => ({ label: (i + 1) + '순위 ' + t.month + '.' + pad(t.day) + ' (' + t.weekday + ')', sub: (v.names || [])[0] + ' ' + t.scoreA + ' · ' + (v.names || [])[1] + ' ' + t.scoreB, score: t.score, highlight: i === 0 }));
    if (rows.length) panels.push({ title: '두 사람 모두에게 좋은 주말 TOP 5', sub: '두 사람 점수의 평균', html: V.scoreBarsHtml(rows) });
    if ((v.avoid || []).length) panels.push({ title: '피하면 좋은 날', sub: '올해 두 사람 점수가 가장 낮은 주말 3개', html: avoidListHtml(v.avoid),
      cap: '다른 날을 고를 수 있을 때 <b>피하는 편이 무난</b>하다는 참고예요. 피할 수 없다면 크게 걱정하지 않으셔도 됩니다.' });
    if ((v.hours || []).length) panels.push({ title: '추천일의 시간대별 점수', sub: '두 사람 평균', html: V.hourBarsHtml(v.hours, best && best.hour) });
    const e = v.extras || {};
    const names = v.names || ['본인', '상대방'];
    panels.push({ title: '두 사람에게 어울리는 색과 소재', sub: '각자의 용신 기운', html: '<div class="vz-swatches">' +
      V.swatchHtml((v.yongshin || [])[0], names[0] + ' · ' + (e.colorA || ''), e.textureA) + V.swatchHtml((v.yongshin || [])[1], names[1] + ' · ' + (e.colorB || ''), e.textureB) + '</div>' });
    cards = V.infoCardsHtml([
      { icon: '01', title: '궁합 참고 점수', value: v.compatScore + '점', note: '합·충 개수로 계산한 참고 수치' },
      { icon: '02', title: '맞물리는 지점', value: (e.yukhap + e.samhap) + '곳', note: '서로 자연스럽게 통하는 자리(육합·삼합)' },
      { icon: '03', title: '부딪히는 지점', value: e.chung + '곳', note: '의견을 맞추는 노력이 필요한 자리(충)' }
    ]);
  } else if (v.kind === 'birth') {
    panels.push({ title: '예정일 전후 날짜 × 시간 점수', sub: '오행이 얼마나 골고루 갖춰지는지', html: V.heatmapHtml(v.rows || [], v.hours || [], v.best),
      cap: '칸이 진한 초록일수록 다섯 기운이 고르게 갖춰지는 순간이에요. <b>금색 테두리가 추천 시각</b>입니다. 의학적 예측이 아니라 명리학적 참고 자료예요.' });
    if (v.bestCounts) panels.push({ title: '추천 시각에 태어나면 갖추는 오행', sub: '', html: V.ohaengRadarSvg(v.bestCounts, { size: 200 }),
      cap: (v.lacking || []).length ? '비어 있는 기운: <b>' + v.lacking.join('·') + '</b>' : '<b>다섯 기운이 모두 갖춰지는 순간</b>이에요.' });
    const e = v.extras || {};
    cards = V.infoCardsHtml([
      best && { icon: '01', title: '추천 날짜', value: best.month + '월 ' + best.day + '일', note: best.hour + '시 전후' },
      { icon: '02', title: '다섯 기운', value: (v.lacking || []).length ? (5 - v.lacking.length) + '가지 갖춤' : '모두 갖춤', note: '오행 균형 기준' },
      e.taste && { icon: '03', title: '산모에게 좋은 맛', value: e.taste, note: '산모의 용신 기운을 채우는 맛' }
    ]);
  }
  return { verdict, panels, cards };
}

/* 웹 결과 화면용 — PDF와 같은 조각을 한 덩어리로. 모든 글자는 visuals.js에서 이스케이프된다. */
function dateSelectWebHtml(v) {
  const p = buildDateSelectParts(v);
  if (!p) return '';
  return '<div class="vz-web">' + verdictHtml(p.verdict, (v.label || '') + ' 추천일') + p.cards +
    p.panels.map((x) => '<div class="vz-panel"><div class="ttl">' + V.esc(x.title) + (x.sub ? ' <small>' + V.esc(x.sub) + '</small>' : '') + '</div>' + x.html + (x.cap ? '<p class="cap">' + x.cap + '</p>' : '') + '</div>').join('') + '</div>';
}

function verdictHtml(vd, kicker) {
  return '<div class="vz-verdict"><div class="k">' + V.esc(kicker) + '</div><div class="h">' + V.esc(vd.value) + '</div>' +
    (vd.sub ? '<div class="vd-sub">' + V.esc(vd.sub) + '</div>' : '') +
    (vd.alts.length ? '<div class="vd-alts">' + vd.alts.map((a) => '<span>' + V.esc(a) + '</span>').join('') + '</div>' : '') + '</div>';
}

module.exports = { buildDateSelectParts, dateSelectWebHtml, verdictHtml };

