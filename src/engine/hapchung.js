'use strict';
/* 형충회합(刑沖會合) — 지지 간의 합/충/형 관계를 계산한다.
   기존 엔진엔 이 로직이 전혀 없었음(격국 파격 판정도, 십신 해석 보정도 불가능했던 원인).
   우선순위 규칙(연구 결과, docs/design-decisions.md 참고): 삼합/방합이 완전 성립하면
   같은 지지가 걸린 육합/충은 "약화(weakened)" 태그만 붙이고 데이터는 남긴다(삭제하지 않음) —
   서술 단계에서 "합이 있지만 삼합에 묶여 힘을 못 씀" 같은 뉘앙스를 낼 수 있도록. */

const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];
const PILLAR_KO = { year: '연지', month: '월지', day: '일지', hour: '시지' };

// 육합(인접 지지만 성립) — 합화 오행 포함(午未合은 전통적으로 합화 오행 불명확 → null)
const YUKHAP = [
  { pair: ['子', '丑'], element: '土' },
  { pair: ['寅', '亥'], element: '木' },
  { pair: ['卯', '戌'], element: '火' },
  { pair: ['辰', '酉'], element: '金' },
  { pair: ['巳', '申'], element: '水' },
  { pair: ['午', '未'], element: null }
];
const ADJACENT_PAIRS = [['year', 'month'], ['month', 'day'], ['day', 'hour']];

// 충 (전체 지지 쌍 어디서든 성립 — 인접 제한 없음)
const CHUNG = [
  ['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']
];

// 삼합(완전 3개/반합 2개, 왕지가 반드시 포함되어야 반합 인정)
const SAMHAP = [
  { branches: ['申', '子', '辰'], wangji: '子', element: '水' },
  { branches: ['亥', '卯', '未'], wangji: '卯', element: '木' },
  { branches: ['寅', '午', '戌'], wangji: '午', element: '火' },
  { branches: ['巳', '酉', '丑'], wangji: '酉', element: '金' }
];

// 방합(완전 3개/2개+왕지 반합)
const BANGHAP = [
  { branches: ['寅', '卯', '辰'], wangji: '卯', element: '木' },
  { branches: ['巳', '午', '未'], wangji: '午', element: '火' },
  { branches: ['申', '酉', '戌'], wangji: '酉', element: '金' },
  { branches: ['亥', '子', '丑'], wangji: '子', element: '水' }
];

// 형(刑)
const SAMHYEONG_GROUPS = [
  { branches: ['寅', '巳', '申'], name: '무은지형' },
  { branches: ['丑', '戌', '未'], name: '무례지형' }
];
const SANGHYEONG_PAIRS = [['子', '卯']]; // 무례지형(상형)
const JAHYEONG_BRANCHES = ['辰', '午', '酉', '亥']; // 자형 — 같은 지지가 2개 이상일 때 성립

function pillarBranchMap(palja) {
  return {
    year: palja.yearPillar.branch,
    month: palja.monthPillar.branch,
    day: palja.dayPillar.branch,
    hour: palja.hourPillar.branch
  };
}

function findPairKey(branches, a, b) {
  const keys = PILLAR_KEYS.filter(k => branches[k] === a || branches[k] === b);
  return keys;
}

/**
 * @param {Object} palja core.palja (manse-core.analyze()의 palja)
 */
function analyzeHapchung(palja) {
  const branches = pillarBranchMap(palja);
  const present = new Set(Object.values(branches));

  // 육합 (인접 기둥끼리만)
  const yukhap = [];
  ADJACENT_PAIRS.forEach(([k1, k2]) => {
    const b1 = branches[k1], b2 = branches[k2];
    const match = YUKHAP.find(h => (h.pair[0] === b1 && h.pair[1] === b2) || (h.pair[0] === b2 && h.pair[1] === b1));
    if (match) yukhap.push({ pillars: [k1, k2], branches: [b1, b2], element: match.element, weakened: false });
  });

  // 충 (전체 쌍)
  const chung = [];
  for (let i = 0; i < PILLAR_KEYS.length; i++) {
    for (let j = i + 1; j < PILLAR_KEYS.length; j++) {
      const k1 = PILLAR_KEYS[i], k2 = PILLAR_KEYS[j];
      const b1 = branches[k1], b2 = branches[k2];
      const match = CHUNG.find(([x, y]) => (x === b1 && y === b2) || (x === b2 && y === b1));
      if (match) chung.push({ pillars: [k1, k2], branches: [b1, b2], weakened: false });
    }
  }

  // 삼합 (완전/반합)
  const samhapComplete = [];
  const samhapHalf = [];
  SAMHAP.forEach(g => {
    const have = g.branches.filter(b => present.has(b));
    if (have.length === 3) {
      samhapComplete.push({ branches: g.branches, element: g.element });
    } else if (have.length === 2 && have.includes(g.wangji)) {
      samhapHalf.push({ branches: have, element: g.element, wangji: g.wangji });
    }
  });

  // 방합 (완전/반합)
  const banghapComplete = [];
  const banghapHalf = [];
  BANGHAP.forEach(g => {
    const have = g.branches.filter(b => present.has(b));
    if (have.length === 3) {
      banghapComplete.push({ branches: g.branches, element: g.element });
    } else if (have.length === 2 && have.includes(g.wangji)) {
      banghapHalf.push({ branches: have, element: g.element, wangji: g.wangji });
    }
  });

  // 형
  const hyeong = [];
  SAMHYEONG_GROUPS.forEach(g => {
    const haveKeys = PILLAR_KEYS.filter(k => g.branches.includes(branches[k]));
    const haveBranches = haveKeys.map(k => branches[k]);
    const uniqueBranches = [...new Set(haveBranches)];
    if (uniqueBranches.length >= 2) {
      hyeong.push({ type: '삼형', name: g.name, pillars: haveKeys, branches: uniqueBranches, complete: uniqueBranches.length === 3 });
    }
  });
  SANGHYEONG_PAIRS.forEach(([a, b]) => {
    const keys = findPairKey(branches, a, b);
    if (keys.length >= 2 && new Set(keys.map(k => branches[k])).size === 2) {
      hyeong.push({ type: '상형', name: '무례지형', pillars: keys, branches: [a, b], complete: true });
    }
  });
  JAHYEONG_BRANCHES.forEach(b => {
    const keys = PILLAR_KEYS.filter(k => branches[k] === b);
    if (keys.length >= 2) {
      hyeong.push({ type: '자형', name: `${b}자형`, pillars: keys, branches: [b, b], complete: true });
    }
  });

  // 우선순위 태깅: 삼합/방합 완전체에 걸린 지지가 관여하는 육합/충은 weakened=true
  const lockedBranches = new Set();
  [...samhapComplete, ...banghapComplete].forEach(g => g.branches.forEach(b => lockedBranches.add(b)));
  yukhap.forEach(h => { if (h.branches.some(b => lockedBranches.has(b))) h.weakened = true; });
  chung.forEach(c => { if (c.branches.some(b => lockedBranches.has(b))) c.weakened = true; });

  const monthBranch = branches.month;
  const monthBranchChungFlag = chung.some(c => c.pillars.includes('month'));

  return {
    yukhap, chung,
    samhap: { complete: samhapComplete, half: samhapHalf },
    banghap: { complete: banghapComplete, half: banghapHalf },
    hyeong,
    monthBranchChungFlag
  };
}

module.exports = { analyzeHapchung, PILLAR_KO };
