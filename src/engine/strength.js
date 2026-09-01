'use strict';
/* 신강/신약 판정 — 득령(得令)/득지(得地)/득세(得勢)/통근(通根) 종합.
   기존 엔진은 "일간 오행 개수(내부가중) >= 3.0" 단일 임계값뿐이었다. 정통 명리학의
   판단법(득령>득지=득세, 통근은 보조 근거)을 반영해 다수결로 신강/신약/중화를 정한다. */

const { STEM_OHAENG, BRANCH_HIDDEN, BRANCH_MAIN_STEM, UNSEONG_TABLE, WANGJI_UNSEONG } = require('./constants');

const SELF_OR_SUPPORT = (ilganOhaeng, targetOhaeng) => {
  // 비겁(같은 오행) 또는 인성(나를 생하는 오행)이면 true
  const { PRODUCES } = require('./constants');
  const producesIlgan = Object.entries(PRODUCES).find(([, v]) => v === ilganOhaeng)?.[0];
  return targetOhaeng === ilganOhaeng || targetOhaeng === producesIlgan;
};

/**
 * @param {Object} core manse-core.analyze() 결과
 */
function analyzeStrength(core) {
  const { palja, ilgan } = core;
  const dayStem = palja.dayPillar.stem;
  const ilganOhaeng = ilgan.ohaeng;

  // 득령(得令): 월지 지장간 본기의 오행이 일간과 비겁/인성 관계인가
  const monthBranch = palja.monthPillar.branch;
  const monthMainStem = BRANCH_HIDDEN[monthBranch][0].stem;
  const monthMainOhaeng = STEM_OHAENG[monthMainStem].ohaeng;
  const deukryeong = SELF_OR_SUPPORT(ilganOhaeng, monthMainOhaeng);

  // 득지(得地): 일지 12운성이 왕지(장생/관대/건록/제왕)인가
  const dayBranch = palja.dayPillar.branch;
  const dayBranchUnseong = (UNSEONG_TABLE[dayStem] || {})[dayBranch] || '';
  const deukji = WANGJI_UNSEONG.has(dayBranchUnseong);

  // 득세(得勢): 일간 제외 나머지 천간(연간/월간/시간) 중 비겁/인성이 2개 이상인가
  const otherStems = [palja.yearPillar.stem, palja.monthPillar.stem, palja.hourPillar.stem];
  const supportStemCount = otherStems.filter(s => SELF_OR_SUPPORT(ilganOhaeng, STEM_OHAENG[s].ohaeng)).length;
  const deukse = supportStemCount >= 2;

  // 통근(通根): 일간과 같은 오행이 어느 지지의 지장간에든 있는가
  const allBranches = [palja.yearPillar.branch, palja.monthPillar.branch, palja.dayPillar.branch, palja.hourPillar.branch];
  const tongkeun = allBranches.some(b => (BRANCH_HIDDEN[b] || []).some(h => STEM_OHAENG[h.stem].ohaeng === ilganOhaeng));

  // 종합 판정: 득령에 가중치 2, 득지/득세/통근 각 가중치 1
  const score = (deukryeong ? 2 : -2) + (deukji ? 1 : -1) + (deukse ? 1 : -1) + (tongkeun ? 1 : -1);
  let verdict;
  if (score >= 2) verdict = '신강';
  else if (score <= -2) verdict = '신약';
  else verdict = '중화';

  return {
    deukryeong, deukji, deukse, tongkeun,
    score, verdict,
    detail: {
      monthMainOhaeng, dayBranchUnseong, supportStemCount
    }
  };
}

module.exports = { analyzeStrength };
