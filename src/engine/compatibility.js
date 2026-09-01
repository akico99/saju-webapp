'use strict';
/* 궁합(宮合) — 두 사람의 팔자를 비교하는 신규 모듈. 기존 hapchung.js는 "한 사람의
   4기둥 안에서" 합충형해를 찾지만, 이건 "두 사람의 8기둥 사이"에서 찾는 별개 로직이다.
   가장 중요한 단서 두 가지를 우선 본다: ① 일지-일지 관계(배우자궁끼리의 합/충),
   ② 일간 상호 십신(상대가 나에게 무슨 존재로 다가오는지). 나머지 기둥 간 합/충은
   보조 지표로 개수만 집계한다. */

const { getShipsin, SHIPSIN_KO } = require('./constants');

const YUKHAP = [
  { pair: ['子', '丑'], element: '土' },
  { pair: ['寅', '亥'], element: '木' },
  { pair: ['卯', '戌'], element: '火' },
  { pair: ['辰', '酉'], element: '金' },
  { pair: ['巳', '申'], element: '水' },
  { pair: ['午', '未'], element: null }
];
const CHUNG = [
  ['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']
];
const SAMHAP_GROUPS = [
  { branches: ['申', '子', '辰'], element: '水' },
  { branches: ['亥', '卯', '未'], element: '木' },
  { branches: ['寅', '午', '戌'], element: '火' },
  { branches: ['巳', '酉', '丑'], element: '金' }
];

const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];
const PILLAR_KO = { year: '연지', month: '월지', day: '일지', hour: '시지' };

function branchMap(palja) {
  return {
    year: palja.yearPillar.branch, month: palja.monthPillar.branch,
    day: palja.dayPillar.branch, hour: palja.hourPillar.branch
  };
}

function classifyPair(b1, b2) {
  const yukhap = YUKHAP.find(h => (h.pair[0] === b1 && h.pair[1] === b2) || (h.pair[0] === b2 && h.pair[1] === b1));
  if (yukhap) return { type: 'yukhap', element: yukhap.element };
  const chung = CHUNG.find(([x, y]) => (x === b1 && y === b2) || (x === b2 && y === b1));
  if (chung) return { type: 'chung' };
  const samhap = SAMHAP_GROUPS.find(g => g.branches.includes(b1) && g.branches.includes(b2) && b1 !== b2);
  if (samhap) return { type: 'samhap', element: samhap.element };
  return null;
}

/**
 * @param {Object} engineA computeSaju() 결과 (본인)
 * @param {Object} engineB computeSaju() 결과 (상대)
 */
function analyzeCompatibility(engineA, engineB) {
  const branchesA = branchMap(engineA.palja);
  const branchesB = branchMap(engineB.palja);

  // 전체 8기둥(4x4) 교차 비교 — 합/충 목록화
  const crossYukhap = [];
  const crossChung = [];
  const crossSamhap = [];
  PILLAR_KEYS.forEach(kA => {
    PILLAR_KEYS.forEach(kB => {
      const rel = classifyPair(branchesA[kA], branchesB[kB]);
      if (!rel) return;
      const entry = { pillarA: kA, pillarB: kB, branchA: branchesA[kA], branchB: branchesB[kB], element: rel.element };
      if (rel.type === 'yukhap') crossYukhap.push(entry);
      else if (rel.type === 'chung') crossChung.push(entry);
      else if (rel.type === 'samhap') crossSamhap.push(entry);
    });
  });

  // 일지-일지(배우자궁 대 배우자궁) — 궁합에서 가장 비중 있게 보는 단서
  const dayRelation = classifyPair(branchesA.day, branchesB.day);

  // 일간 상호 십신 — 상대가 나에게, 내가 상대에게 어떤 기운으로 다가오는지
  const shipsinAtoB = getShipsin(engineA.ilgan.char, engineB.ilgan.char); // B가 A에게
  const shipsinBtoA = getShipsin(engineB.ilgan.char, engineA.ilgan.char); // A가 B에게
  const shipsinAtoBKo = shipsinAtoB ? SHIPSIN_KO[shipsinAtoB] : null;
  const shipsinBtoAKo = shipsinBtoA ? SHIPSIN_KO[shipsinBtoA] : null;

  // 종합 점수(0~100, 참고용) — 합 1개당 +8, 삼합 +10, 충 1개당 -10, 일지 관계는 가중치 2배, 기본값 55
  let score = 55;
  score += crossYukhap.length * 8;
  score += crossSamhap.length * 10;
  score -= crossChung.length * 10;
  if (dayRelation?.type === 'yukhap' || dayRelation?.type === 'samhap') score += 12;
  if (dayRelation?.type === 'chung') score -= 15;
  score = Math.max(5, Math.min(95, Math.round(score)));

  return {
    crossYukhap, crossChung, crossSamhap,
    dayRelation, shipsinAtoB, shipsinBtoA, shipsinAtoBKo, shipsinBtoAKo,
    score
  };
}

module.exports = { analyzeCompatibility, PILLAR_KO, classifyPair };
