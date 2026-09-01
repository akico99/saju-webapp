'use strict';
/* 격국(格局) 판정 — 투출(透出) 우선순위(본기→중기→여기) + 파격(破格) + 종격(從格) 후보.
   기존 엔진은 항상 "월지 지장간 본기의 십신"만 격으로 잡았다(투출 여부 무시). */

const { BRANCH_HIDDEN, STEM_OHAENG, getShipsin, SHIPSIN_KO } = require('./constants');

const KYUKGUK_MAP = {
  '正官': '정관격', '偏官': '편관격(칠살격)',
  '正財': '정재격', '偏財': '편재격',
  '正印': '정인격', '偏印': '편인격',
  '食神': '식신격', '傷官': '상관격',
  '比肩': '건록격', '劫財': '양인격'
};

/**
 * @param {Object} core manse-core.analyze() 결과
 * @param {Object} hapchung hapchung.analyzeHapchung() 결과
 * @param {Object} strength strength.analyzeStrength() 결과
 * @param {Object} counts counts.buildCounts() 결과
 */
function analyzeKyukguk(core, hapchung, strength, counts) {
  const { palja } = core;
  const dayStem = palja.dayPillar.stem;
  const monthBranch = palja.monthPillar.branch;
  const hiddenSlots = BRANCH_HIDDEN[monthBranch]; // [{stem, weight, slot}], 본기 먼저

  // 일간을 제외한 노출 천간(연간/월간/시간) — 월간 자체 투출도 인정
  const visibleStems = [palja.yearPillar.stem, palja.monthPillar.stem, palja.hourPillar.stem];

  let basis = null; // 어느 슬롯이 격을 결정했는지
  let chosenStem = null;
  for (const slot of hiddenSlots) {
    if (visibleStems.includes(slot.stem)) {
      chosenStem = slot.stem;
      basis = slot.slot; // '본기' | '중기' | '여기'
      break;
    }
  }
  if (!chosenStem) {
    chosenStem = hiddenSlots[0].stem; // 무투출 폴백: 본기 자체
    basis = '본기(무투출 폴백)';
  }

  const shipsin = getShipsin(dayStem, chosenStem);
  const name = KYUKGUK_MAP[shipsin] || '잡격';

  // 파격: 월지가 형충회합상 충을 맞으면 격이 흔들림
  const pagyeokFlag = !!hapchung.monthBranchChungFlag;

  // 종격 후보: 신약 + 득령/득지/득세/통근 전부 실패 + 한 오행이 압도적(8자 중 5개 이상)
  const ohaengCounts = counts.ohaeng;
  const maxEntry = Object.entries(ohaengCounts).sort((a, b) => b[1] - a[1])[0];
  const dominantOhaeng = maxEntry[0];
  const dominantCount = maxEntry[1];
  const allWeak = !strength.deukryeong && !strength.deukji && !strength.deukse && !strength.tongkeun;
  const jonggyeokCandidate = strength.verdict === '신약' && allWeak && dominantCount >= 5;

  const JONGGYEOK_TYPE = { '比肩': '종왕격', '劫財': '종왕격', '食神': '종아격', '傷官': '종아격', '偏財': '종재격', '正財': '종재격', '偏官': '종살격', '正官': '종살격', '偏印': '종강격', '正印': '종강격' };
  let jonggyeok = { candidate: false, type: null };
  if (jonggyeokCandidate) {
    // 압도적 오행이 일간 오행과 같으면 종강/종왕, 아니면 그 오행이 일간에 대해 갖는 관계로 유형 추정
    const dominantStemLike = Object.keys(STEM_OHAENG).find(s => STEM_OHAENG[s].ohaeng === dominantOhaeng);
    const relShipsin = getShipsin(dayStem, dominantStemLike);
    jonggyeok = { candidate: true, type: JONGGYEOK_TYPE[relShipsin] || '종격(유형 미상)', dominantOhaeng };
  }

  return {
    name, basis, shipsin, shipsinKo: shipsin ? SHIPSIN_KO[shipsin] : null,
    pagyeokFlag,
    jonggyeok
  };
}

module.exports = { analyzeKyukguk, KYUKGUK_MAP };
