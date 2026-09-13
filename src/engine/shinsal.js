'use strict';
/* 신살(神殺) — 원국 4기둥뿐 아니라 대운·세운 기둥까지 태그한다.
   기존엔 12신살 중 4개(도화/역마/화개/장성)만 있었는데, 나머지 8개(겁살/재살/천살/지살/
   월살/망신살/반안살+육해살)를 추가해 12신살을 전부 채운다. 공망·암록·협록·비인살도 추가.
   매핑표 출처는 docs/design-decisions.md 참고. */

const { UNSEONG_TABLE } = require('./constants');

const BRANCH_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const STEM_ORDER = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

// ── 12신살 ──
// 삼합 그룹(寅午戌·申子辰·巳酉丑·亥卯未) 중 그 그룹의 왕지(旺支, 장성살 지지)로 매핑.
const SAMHAP_WANGJI = {
  '寅': '午', '午': '午', '戌': '午',
  '申': '子', '子': '子', '辰': '子',
  '巳': '酉', '酉': '酉', '丑': '酉',
  '亥': '卯', '卯': '卯', '未': '卯'
};
// 왕지(장성살)를 0번으로 놓고 지지 순행 순서(BRANCH_ORDER)를 따라 12신살이 정해진다.
const SHINSAL_12_ORDER = [
  '장성살', '반안살', '역마살', '육해살', '화개살', '겁살',
  '재살', '천살', '지살', '도화살', '월살', '망신살'
];

/** 특정 연/일지가 속한 삼합 그룹 기준으로, 지지별 12신살 이름 맵을 만든다. */
function twelveShinsalMap(refBranch) {
  const wangji = SAMHAP_WANGJI[refBranch];
  if (!wangji) return {};
  const startIdx = BRANCH_ORDER.indexOf(wangji);
  const map = {};
  SHINSAL_12_ORDER.forEach((name, offset) => {
    map[BRANCH_ORDER[(startIdx + offset) % 12]] = name;
  });
  return map;
}

// ── 일간 기준 특수살 ──
// 천을귀인(天乙貴人) — 일간 기준 지지 2개
const CHEONEUL = {
  '甲': ['丑', '未'], '戊': ['丑', '未'], '庚': ['丑', '未'],
  '乙': ['子', '申'], '己': ['子', '申'],
  '丙': ['亥', '酉'], '丁': ['亥', '酉'],
  '辛': ['寅', '午'],
  '壬': ['巳', '卯'], '癸': ['巳', '卯']
};

// 문창귀인(文昌貴人) — 일간 기준 지지 1개
const MUNCHANG = {
  '甲': '巳', '乙': '午', '丙': '申', '戊': '申', '丁': '酉', '己': '酉',
  '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯'
};

// 양인(羊刃) — 양간에만 해당
const YANGIN = { '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子' };

// 비인살(飛刃殺) — 양인의 정반대(충) 지지
function oppositeBranch(branch) {
  const idx = BRANCH_ORDER.indexOf(branch);
  return idx < 0 ? null : BRANCH_ORDER[(idx + 6) % 12];
}
const BIIN = Object.fromEntries(
  Object.entries(YANGIN).map(([stem, branch]) => [stem, oppositeBranch(branch)])
);

// 록(祿, 12운성 "건록" 지지) — UNSEONG_TABLE에서 직접 역산(단일 출처 유지, 별도 표 안 둠)
function rokBranchFor(stem) {
  const table = UNSEONG_TABLE[stem] || {};
  return Object.keys(table).find((b) => table[b] === '건록') || null;
}

// 육합(六合) 쌍 — 암록 계산에 사용
const YUKHAP_PARTNER = {
  '子': '丑', '丑': '子', '寅': '亥', '亥': '寅', '卯': '戌', '戌': '卯',
  '辰': '酉', '酉': '辰', '巳': '申', '申': '巳', '午': '未', '未': '午'
};
// 암록(暗祿) — 록지의 육합 파트너 지지
function amrokBranchFor(stem) {
  const rok = rokBranchFor(stem);
  return rok ? YUKHAP_PARTNER[rok] : null;
}
// 협록(夾祿) — 록지 바로 앞/뒤 지지 두 개. 원국에 이 둘이 "모두" 있어야 성립.
function hyeoprokBranchesFor(stem) {
  const rok = rokBranchFor(stem);
  if (!rok) return [];
  const idx = BRANCH_ORDER.indexOf(rok);
  return [BRANCH_ORDER[(idx - 1 + 12) % 12], BRANCH_ORDER[(idx + 1) % 12]];
}

// 괴강(魁罡) — 일주 간지
const GOEGANG_ILJU = new Set(['庚辰', '壬辰', '庚戌', '壬戌']);

// 백호(白虎) — 사주 어느 기둥이든
const BAEKHO_GANJI = new Set(['甲辰', '乙未', '丙戌', '丁丑', '戊辰', '壬戌', '癸丑']);

// ── 공망(空亡) ──
// 일주(또는 연주) 간지가 속한 "순(旬)"을 구해, 그 순에서 짝을 못 이루는 지지 2개를 반환.
function gongmangPairFor(stem, branch) {
  const s = STEM_ORDER.indexOf(stem);
  const b = BRANCH_ORDER.indexOf(branch);
  if (s < 0 || b < 0) return [];
  const startBranch = (b - s + 12) % 12; // 이 순에서 갑(甲)과 짝지어지는 지지
  return [BRANCH_ORDER[(startBranch + 10) % 12], BRANCH_ORDER[(startBranch + 11) % 12]];
}

const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];

// 지지 → 방위(8방위로 단순화, 개운법 안내 수준). 재물운/건강운 리포트에서 "이 방향에
// 서류함을 두세요/베개를 두세요" 같은 안내에 쓴다.
const BRANCH_DIRECTION_KO = {
  '子': '정북쪽', '丑': '북동쪽', '寅': '동북쪽', '卯': '정동쪽',
  '辰': '동남쪽', '巳': '남동쪽', '午': '정남쪽', '未': '남서쪽',
  '申': '서남쪽', '酉': '정서쪽', '戌': '서북쪽', '亥': '북서쪽'
};

/**
 * 대운·세운처럼 원국 밖의 임의의 간지 하나가 이 사람에게 어떤 신살에 해당하는지 태그.
 * @param {Object} core manse-core.analyze() 결과
 * @param {string} ganZhi 간지 2글자(예: '壬午')
 */
function shinsalsForGanji(core, ganZhi) {
  if (!ganZhi || ganZhi.length < 2) return [];
  const stem = ganZhi[0], branch = ganZhi[1];
  const dayStem = core.palja.dayPillar.stem;
  const yearBranch = core.palja.yearPillar.branch;
  const dayBranch = core.palja.dayPillar.branch;
  const tags = [];

  const yearMap = twelveShinsalMap(yearBranch);
  if (yearMap[branch]) tags.push(`${yearMap[branch]}(연지기준)`);
  if (dayBranch !== yearBranch) {
    const dayMap = twelveShinsalMap(dayBranch);
    if (dayMap[branch]) tags.push(`${dayMap[branch]}(일지기준)`);
  }

  if ((CHEONEUL[dayStem] || []).includes(branch)) tags.push('천을귀인');
  if (MUNCHANG[dayStem] === branch) tags.push('문창귀인');
  if (YANGIN[dayStem] === branch) tags.push('양인');
  if (BIIN[dayStem] === branch) tags.push('비인살');
  if (amrokBranchFor(dayStem) === branch) tags.push('암록');
  if (GOEGANG_ILJU.has(stem + branch)) tags.push('괴강');
  if (BAEKHO_GANJI.has(stem + branch)) tags.push('백호');

  const yearGongmang = gongmangPairFor(core.palja.yearPillar.stem, yearBranch);
  const dayGongmang = gongmangPairFor(core.palja.dayPillar.stem, dayBranch);
  if (yearGongmang.includes(branch)) tags.push('공망(연주기준)');
  if (dayGongmang.includes(branch) && dayGongmang.join() !== yearGongmang.join()) tags.push('공망(일주기준)');

  return [...new Set(tags)];
}

/**
 * @param {Object} core manse-core.analyze() 결과 (core.manse[key].shinsals와
 *   core.daewoon[*].shinsals / .years[*].shinsals에 채워 넣는다)
 */
function analyzeShinsal(core) {
  const { palja } = core;
  const branches = {
    year: palja.yearPillar.branch, month: palja.monthPillar.branch,
    day: palja.dayPillar.branch, hour: palja.hourPillar.branch
  };
  const yearBranch = branches.year;
  const dayBranch = branches.day;
  const dayStem = palja.dayPillar.stem;

  const perPillarTags = { year: [], month: [], day: [], hour: [] };

  // 12신살(연지 기준 / 일지 기준 병기)
  const yearMap = twelveShinsalMap(yearBranch);
  const dayMap = dayBranch !== yearBranch ? twelveShinsalMap(dayBranch) : null;
  PILLAR_KEYS.forEach((k) => {
    if (yearMap[branches[k]]) perPillarTags[k].push(`${yearMap[branches[k]]}(연지기준)`);
    if (dayMap && dayMap[branches[k]]) perPillarTags[k].push(`${dayMap[branches[k]]}(일지기준)`);
  });

  // 천을귀인 — 일간 기준, 지지 2개 중 하나라도 present인 기둥에 태그
  (CHEONEUL[dayStem] || []).forEach((target) => {
    PILLAR_KEYS.forEach((k) => { if (branches[k] === target) perPillarTags[k].push('천을귀인'); });
  });

  // 문창귀인 — 일간 기준, 지지 1개
  const munchangTarget = MUNCHANG[dayStem];
  if (munchangTarget) {
    PILLAR_KEYS.forEach((k) => { if (branches[k] === munchangTarget) perPillarTags[k].push('문창귀인'); });
  }

  // 양인 — 양간 일간에만, 지지 1개
  const yanginTarget = YANGIN[dayStem];
  if (yanginTarget) {
    PILLAR_KEYS.forEach((k) => { if (branches[k] === yanginTarget) perPillarTags[k].push('양인'); });
  }

  // 비인살 — 양인의 충 지지
  const biinTarget = BIIN[dayStem];
  if (biinTarget) {
    PILLAR_KEYS.forEach((k) => { if (branches[k] === biinTarget) perPillarTags[k].push('비인살'); });
  }

  // 암록 — 록지의 육합 파트너 지지
  const amrokTarget = amrokBranchFor(dayStem);
  if (amrokTarget) {
    PILLAR_KEYS.forEach((k) => { if (branches[k] === amrokTarget) perPillarTags[k].push('암록'); });
  }

  // 협록 — 록지 앞/뒤 지지 두 개가 원국에 "모두" 있어야 성립
  const hyeoprokPair = hyeoprokBranchesFor(dayStem);
  if (hyeoprokPair.length === 2 && PILLAR_KEYS.some((k) => branches[k] === hyeoprokPair[0])
    && PILLAR_KEYS.some((k) => branches[k] === hyeoprokPair[1])) {
    PILLAR_KEYS.forEach((k) => { if (hyeoprokPair.includes(branches[k])) perPillarTags[k].push('협록'); });
  }

  // 괴강 — 일주 간지 자체
  const ilju = palja.dayPillar.stem + palja.dayPillar.branch;
  if (GOEGANG_ILJU.has(ilju)) perPillarTags.day.push('괴강');

  // 백호 — 사주 어느 기둥이든 간지 일치
  PILLAR_KEYS.forEach((k) => {
    const pillar = core.palja[k + 'Pillar'];
    const ganji = pillar.stem + pillar.branch;
    if (BAEKHO_GANJI.has(ganji)) perPillarTags[k].push('백호');
  });

  // 공망 — 연주 기준 / 일주 기준 병기
  const yearGongmang = gongmangPairFor(palja.yearPillar.stem, yearBranch);
  const dayGongmang = gongmangPairFor(palja.dayPillar.stem, dayBranch);
  const sameGongmang = yearGongmang.join() === dayGongmang.join();
  PILLAR_KEYS.forEach((k) => {
    if (yearGongmang.includes(branches[k])) perPillarTags[k].push('공망(연주기준)');
    if (!sameGongmang && dayGongmang.includes(branches[k])) perPillarTags[k].push('공망(일주기준)');
  });

  // core.manse[key].shinsals 에 반영 (중복 제거)
  PILLAR_KEYS.forEach((k) => {
    core.manse[k].shinsals = [...new Set(perPillarTags[k])];
  });

  // 대운·세운 기둥에도 동일 기준으로 신살 태그
  (core.daewoon || []).forEach((d) => {
    d.shinsals = shinsalsForGanji(core, d.ganZhi);
    (d.years || []).forEach((y) => { y.shinsals = shinsalsForGanji(core, y.ganZhi); });
  });

  return perPillarTags;
}

// 하위호환 — lifeTopics.js(재물운/건강운 리포트의 "이 방향" 개운법 안내)가 쓰던 이름.
// 새 twelveShinsalMap(연지 기준)에서 값이 '반안살'인 지지를 역으로 찾아 그대로 대체한다.
function bananSalBranch(yearBranch) {
  const map = twelveShinsalMap(yearBranch);
  return Object.keys(map).find((b) => map[b] === '반안살') || null;
}

module.exports = {
  analyzeShinsal, shinsalsForGanji,
  CHEONEUL, MUNCHANG, YANGIN, BIIN, GOEGANG_ILJU, BAEKHO_GANJI,
  twelveShinsalMap, gongmangPairFor, amrokBranchFor, hyeoprokBranchesFor,
  bananSalBranch, BRANCH_DIRECTION_KO
};
