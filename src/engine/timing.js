'use strict';
/* 시기 진단 유틸 — 이직 시기, 재회 신호, 출산택일 세 신규 상품이 공통으로 쓰는 계산.
   전부 이미 있는 만세력/십신/형충 계산 위에서 "다른 각도로 점수를 매기는" 것뿐이라
   새 사주 계산 로직은 없다. */

const {
  getShipsin, SHIPSIN_KO, SHIPSIN_GROUP, STEM_OHAENG, BRANCH_MAIN_STEM
} = require('./constants');

// 십신 그룹별로 "이직·이동"에 얼마나 우호적인 기운인지 점수화.
// 관성(직위·조직) > 식상(활동력·새 시도) > 재성(실리) > 비겁(주도성) > 인성(안정 선호=이동엔 소극적)
const CAREER_GROUP_SCORE = { '관성': 88, '식상': 74, '재성': 58, '비겁': 46, '인성': 32 };
const CAREER_GROUP_DESC = {
  '관성': '새로운 자리나 직책과 관련된 기운이 들어오는 시기예요. 이직·승진 이야기가 나오기 좋아요.',
  '식상': '하고 싶은 걸 펼치고 싶은 마음이 커지는 시기예요. 새로운 시도를 해보기 좋아요.',
  '재성': '수입이나 조건을 실질적으로 따지게 되는 시기예요. 조건 비교하며 움직이기 좋아요.',
  '비겁': '내 힘으로 부딪혀보고 싶은 마음이 강해지는 시기예요. 독립하거나 주도적으로 움직이기 좋아요.',
  '인성': '지금 자리를 지키며 배우고 다지는 게 더 잘 맞는 시기예요. 이직보다는 준비 기간에 가까워요.'
};

function shipsinGroupOfChar(dayStem, ch) {
  if (!ch) return null;
  if (STEM_OHAENG[ch]) {
    const sh = getShipsin(dayStem, ch);
    return sh ? SHIPSIN_GROUP[SHIPSIN_KO[sh]] : null;
  }
  const mainStem = BRANCH_MAIN_STEM[ch];
  if (!mainStem) return null;
  const sh = getShipsin(dayStem, mainStem);
  return sh ? SHIPSIN_GROUP[SHIPSIN_KO[sh]] : null;
}

function careerScoreOfGanZhi(dayStem, ganZhi) {
  if (!ganZhi || ganZhi.length < 2) return { score: 50, group: null };
  const stemGroup = shipsinGroupOfChar(dayStem, ganZhi[0]);
  const branchGroup = shipsinGroupOfChar(dayStem, ganZhi[1]);
  const s1 = stemGroup ? CAREER_GROUP_SCORE[stemGroup] : 50;
  const s2 = branchGroup ? CAREER_GROUP_SCORE[branchGroup] : 50;
  const score = Math.round(s1 * 0.5 + s2 * 0.5);
  // 지지(연간 흐름의 실제 배경)를 우세 그룹으로 대표시킨다 — 없으면 천간 그룹.
  const group = branchGroup || stemGroup;
  return { score, group, groupKo: group };
}

/**
 * @param {Object} engineResult computeSaju() 결과
 * @param {number} fromYear 시작 연도(보통 올해)
 * @param {number} count 몇 년치 볼지
 */
function computeCareerTimeline(engineResult, fromYear, count) {
  const dayStem = engineResult.ilgan.char;
  const years = engineResult.daewoon.flatMap((d) => d.years).filter((y) => y.ganZhi);
  const picked = years.filter((y) => y.year >= fromYear && y.year < fromYear + count);
  return picked.map((y) => {
    const { score, group } = careerScoreOfGanZhi(dayStem, y.ganZhi);
    return {
      year: y.year, age: y.age, ganZhi: y.ganZhi,
      score, group, desc: group ? CAREER_GROUP_DESC[group] : '무난하게 흘러가는 해예요.'
    };
  });
}

// 출산택일용 — 사주 8글자의 오행이 얼마나 골고루 있는지로 점수화(치우침이 적을수록 높음).
function balanceScoreOf(ohaengCounts) {
  const values = Object.values(ohaengCounts);
  const lackingCount = values.filter((v) => v === 0).length;
  const maxCount = Math.max(...values);
  let score = 100 - lackingCount * 16 - Math.max(0, maxCount - 3) * 8;
  return Math.max(10, Math.min(95, Math.round(score)));
}

module.exports = {
  CAREER_GROUP_SCORE, CAREER_GROUP_DESC,
  shipsinGroupOfChar, careerScoreOfGanZhi, computeCareerTimeline,
  balanceScoreOf
};
