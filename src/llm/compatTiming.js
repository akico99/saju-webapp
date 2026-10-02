'use strict';
/* 궁합의 "두 사람의 앞으로 3년"(재회는 앞으로 6개월) 숫자 — 엔진이 정하고 AI는 해석만 한다.

   각자 monthlyFlow.js의 연도별(yearlyFlow) 또는 월별(monthlyFlow) 점수를 'love' 주제로 구한다.
   점수 = 용신 점수 60% + 연애 십신 점수 40%(남=재성·식상, 여=관성·식상이 들어오는 때가 높음).
   두 사람 평균(combined)은 반올림한 값이고, 평균이 가장 높은 때가 PDF의 "함께 올라가는 해/달"이다.
   프롬프트(확정값)와 PDF 그래프가 같은 객체를 쓰므로 AI가 숫자를 새로 만들 자리가 없다. */
const { yearlyFlow, monthlyFlow } = require('../engine/monthlyFlow');

const MONTH_COUNT = 6;
const YEAR_COUNT = 3;

/** 한국 시간 기준 현재 연·월. */
function kstYearMonth(now) {
  const k = new Date((now instanceof Date ? now : new Date()).getTime() + 9 * 3600 * 1000);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth() + 1 };
}

const pick = (r) => ({ score: r.score, ganZhiKo: r.ganZhiKo, stemShipsin: r.stemShipsin, branchShipsin: r.branchShipsin });

/**
 * @returns {{mode:'year'|'month', periods:Array, bestIndex:number}|null} 계산 실패 시 null(리포트는 시기 그래프 없이 계속된다).
 *   periods[i] = { label, shortLabel, year, month?, a:{score,...}, b:{score,...}, combined, bothRise }
 */
function buildCompatTiming(engineA, engineB, relation, now) {
  try {
    const { year, month } = kstYearMonth(now);
    const gA = (engineA.meta && engineA.meta.input && engineA.meta.input.gender) || null;
    const gB = (engineB.meta && engineB.meta.input && engineB.meta.input.gender) || null;
    const isMonth = relation === 'ex';
    let rowsA, rowsB;
    if (isMonth) {
      rowsA = monthlyFlow(engineA, { fromYear: year, fromMonth: month, count: MONTH_COUNT, topic: 'love', gender: gA });
      rowsB = monthlyFlow(engineB, { fromYear: year, fromMonth: month, count: MONTH_COUNT, topic: 'love', gender: gB });
    } else {
      const years = Array.from({ length: YEAR_COUNT }, (_, i) => year + i);
      rowsA = yearlyFlow(engineA, years, { topic: 'love', gender: gA });
      rowsB = yearlyFlow(engineB, years, { topic: 'love', gender: gB });
    }
    const periods = rowsA.map((a, i) => {
      const b = rowsB[i];
      const prevA = rowsA[i - 1], prevB = rowsB[i - 1];
      return {
        year: a.year, month: isMonth ? a.month : undefined,
        label: isMonth ? a.year + '년 ' + a.month + '월' : a.year + '년',
        shortLabel: isMonth ? a.month + '월' : a.year + '년',
        a: pick(a), b: pick(b),
        combined: Math.round((a.score + b.score) / 2),
        bothRise: !!prevA && a.score > prevA.score && b.score > prevB.score
      };
    });
    let bestIndex = 0;
    periods.forEach((p, i) => { if (p.combined > periods[bestIndex].combined) bestIndex = i; });
    return { mode: isMonth ? 'month' : 'year', periods, bestIndex };
  } catch (e) {
    return null;
  }
}

/** 프롬프트에 넣는 확정값 블록(텍스트). nameA/nameB는 표시 이름. 계산 실패(null)면 빈 문자열. */
function timingPromptBlock(timing, nameA, nameB) {
  if (!timing) return '';
  const unit = timing.mode === 'month' ? '달' : '해';
  const line = (who) => timing.periods.map((p) => {
    const x = p[who];
    return '- ' + p.label + ' ' + x.ganZhiKo + '(천간 ' + (x.stemShipsin || '-') + '·지지 ' + (x.branchShipsin || '-') + '): ' + x.score + '점';
  }).join('\n');
  const best = timing.periods[timing.bestIndex];
  const rises = timing.periods.filter((p) => p.bothRise).map((p) => p.label);
  return [
    '점수 기준: 용신 점수 60% + 연애 십신 점수 40%, 5~95점. 높을수록 그때의 기운이 그 사람에게 유리하다는 참고값.',
    '[' + nameA + '님]', line('a'),
    '[' + nameB + '님]', line('b'),
    '[두 사람 평균] ' + timing.periods.map((p) => p.label + ' ' + p.combined + '점').join(' / '),
    '평균이 가장 높은 ' + unit + ': ' + best.label + ' (' + best.combined + '점)',
    '두 사람 모두 직전보다 점수가 오르는 ' + unit + ': ' + (rises.length ? rises.join(', ') : '없음')
  ].join('\n');
}

module.exports = { buildCompatTiming, timingPromptBlock, kstYearMonth, MONTH_COUNT, YEAR_COUNT };

