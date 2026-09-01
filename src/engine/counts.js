'use strict';
/* 개수 기반 요약 — 소수점 가중치 대신 실제 글자 개수로 강약을 말하기 위한 계약.
   LLM 프롬프트/화면 표시엔 이 모듈의 출력만 사용하고, manse-core의 *Weighted 값은
   절대 사용자에게 노출하지 않는다(내부 계산 전용). */

const { SHIPSIN_GROUP } = require('./constants');

function grade(n) {
  return n === 0 ? '없음' : n === 1 ? '약함' : n === 2 ? '보통' : n === 3 ? '강함' : '과다';
}

/**
 * @param {Object} core manse-core.analyze()의 반환값 (manse 필드 필요)
 */
function buildCounts(core) {
  const pillars = ['year', 'month', 'day', 'hour'].map(k => core.manse[k]).filter(Boolean);

  const ohaeng = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  pillars.forEach(p => {
    if (p.stemOhaeng) ohaeng[p.stemOhaeng]++;
    if (p.branchOhaeng) ohaeng[p.branchOhaeng]++;
  });

  const shipsinDetail = { 비견:0, 겁재:0, 식신:0, 상관:0, 편재:0, 정재:0, 편관:0, 정관:0, 편인:0, 정인:0 };
  const shipsinGroup = { 비겁:0, 식상:0, 재성:0, 관성:0, 인성:0 };
  pillars.forEach(p => {
    [p.stemShipsinKo, p.branchShipsinKo].forEach(s => {
      if (s && Object.prototype.hasOwnProperty.call(shipsinDetail, s)) {
        shipsinDetail[s]++;
        shipsinGroup[SHIPSIN_GROUP[s]]++;
      }
    });
  });

  const ohaengGrade = {}; Object.keys(ohaeng).forEach(k => ohaengGrade[k] = grade(ohaeng[k]));
  const shipsinGroupGrade = {}; Object.keys(shipsinGroup).forEach(k => shipsinGroupGrade[k] = grade(shipsinGroup[k]));
  const lacking = Object.keys(ohaeng).filter(k => ohaeng[k] === 0);
  const missingShipsin = Object.keys(shipsinGroup).filter(k => shipsinGroup[k] === 0);

  return { ohaeng, ohaengGrade, lacking, shipsinDetail, shipsinGroup, shipsinGroupGrade, missingShipsin };
}

module.exports = { buildCounts, grade };
