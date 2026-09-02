'use strict';
/* 신살(神殺) — 기존 4종(도화/역마/화개/장성)은 연지(年支) 단독 기준이었다(같은 부류의
   버그로 보고 일지(日支) 기준도 함께 확인해 어느 기준으로 성립했는지 태그한다).
   신규 5종(천을귀인/문창귀인/양인/괴강/백호)을 추가한다.
   매핑표 출처는 docs/design-decisions.md 참고. */

// 삼합 그룹 대표 지지 → 목표 지지 (도화/역마/화개/장성 4종 공통 패턴: 寅午戌·申子辰·巳酉丑·亥卯未 각 그룹이 같은 목표를 가짐)
const SHINSAL_DOHWA = { '寅':'卯','午':'卯','戌':'卯', '申':'酉','子':'酉','辰':'酉', '亥':'子','卯':'子','未':'子', '巳':'午','酉':'午','丑':'午' };
const SHINSAL_YEONGMA = { '寅':'申','午':'申','戌':'申', '申':'寅','子':'寅','辰':'寅', '亥':'巳','卯':'巳','未':'巳', '巳':'亥','酉':'亥','丑':'亥' };
const SHINSAL_HWAGAE = { '寅':'戌','午':'戌','戌':'戌', '申':'辰','子':'辰','辰':'辰', '亥':'未','卯':'未','未':'未', '巳':'丑','酉':'丑','丑':'丑' };
const SHINSAL_JANGSEONG = { '寅':'午','午':'午','戌':'午', '申':'子','子':'子','辰':'子', '亥':'卯','卯':'卯','未':'卯', '巳':'酉','酉':'酉','丑':'酉' };

// 천을귀인(天乙貴人) — 일간 기준 지지 2개
const CHEONEUL = {
  '甲': ['丑','未'], '戊': ['丑','未'], '庚': ['丑','未'],
  '乙': ['子','申'], '己': ['子','申'],
  '丙': ['亥','酉'], '丁': ['亥','酉'],
  '辛': ['寅','午'],
  '壬': ['巳','卯'], '癸': ['巳','卯']
};

// 문창귀인(文昌貴人) — 일간 기준 지지 1개
const MUNCHANG = {
  '甲': '巳', '乙': '午', '丙': '申', '戊': '申', '丁': '酉', '己': '酉',
  '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯'
};

// 양인(羊刃) — 양간에만 해당
const YANGIN = { '甲': '卯', '丙': '午', '戊': '午', '庚': '酉', '壬': '子' };

// 괴강(魁罡) — 일주 간지
const GOEGANG_ILJU = new Set(['庚辰', '壬辰', '庚戌', '壬戌']);

// 백호(白虎) — 사주 어느 기둥이든
const BAEKHO_GANJI = new Set(['甲辰', '乙未', '丙戌', '丁丑', '戊辰', '壬戌', '癸丑']);

// 반안살(攀鞍殺) — 12신살 중 하나. 장성살 지지(SHINSAL_JANGSEONG의 결과, 삼합국의 왕지)
// 바로 다음 지지가 반안살이다(子丑寅卯辰巳午未申酉戌亥 순행 기준). 예: 寅午戌국의
// 장성살은 午, 반안살은 그다음인 未.
const BRANCH_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
function bananSalBranch(yearBranch) {
  const jangseong = SHINSAL_JANGSEONG[yearBranch];
  if (!jangseong) return null;
  const idx = BRANCH_ORDER.indexOf(jangseong);
  return BRANCH_ORDER[(idx + 1) % 12];
}

// 지지 → 방위(8방위로 단순화, 개운법 안내 수준). 재물운/건강운 리포트에서 "이 방향에
// 서류함을 두세요/베개를 두세요" 같은 안내에 쓴다.
const BRANCH_DIRECTION_KO = {
  '子': '정북쪽', '丑': '북동쪽', '寅': '동북쪽', '卯': '정동쪽',
  '辰': '동남쪽', '巳': '남동쪽', '午': '정남쪽', '未': '남서쪽',
  '申': '서남쪽', '酉': '정서쪽', '戌': '서북쪽', '亥': '북서쪽'
};

const PILLAR_KEYS = ['year', 'month', 'day', 'hour'];

/**
 * @param {Object} core manse-core.analyze() 결과 (core.manse[key].shinsals 배열에 채워 넣는다)
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

  // 연지 기준 / 일지 기준 각각 계산 후 병기
  const perPillarTags = { year: [], month: [], day: [], hour: [] };

  function tagIfMatch(table, refBranch, refLabel, name) {
    const target = table[refBranch];
    if (!target) return;
    PILLAR_KEYS.forEach(k => {
      if (branches[k] === target) perPillarTags[k].push(`${name}(${refLabel}기준)`);
    });
  }

  [
    [SHINSAL_DOHWA, '도화'], [SHINSAL_YEONGMA, '역마'],
    [SHINSAL_HWAGAE, '화개'], [SHINSAL_JANGSEONG, '장성']
  ].forEach(([table, name]) => {
    tagIfMatch(table, yearBranch, '연지', name);
    if (dayBranch !== yearBranch) tagIfMatch(table, dayBranch, '일지', name);
  });

  // 천을귀인 — 일간 기준, 지지 2개 중 하나라도 present인 기둥에 태그
  (CHEONEUL[dayStem] || []).forEach(target => {
    PILLAR_KEYS.forEach(k => { if (branches[k] === target) perPillarTags[k].push('천을귀인'); });
  });

  // 문창귀인 — 일간 기준, 지지 1개
  const munchangTarget = MUNCHANG[dayStem];
  if (munchangTarget) {
    PILLAR_KEYS.forEach(k => { if (branches[k] === munchangTarget) perPillarTags[k].push('문창귀인'); });
  }

  // 양인 — 양간 일간에만, 지지 1개
  const yanginTarget = YANGIN[dayStem];
  if (yanginTarget) {
    PILLAR_KEYS.forEach(k => { if (branches[k] === yanginTarget) perPillarTags[k].push('양인'); });
  }

  // 괴강 — 일주 간지 자체
  const ilju = palja.dayPillar.stem + palja.dayPillar.branch;
  if (GOEGANG_ILJU.has(ilju)) perPillarTags.day.push('괴강');

  // 백호 — 사주 어느 기둥이든 간지 일치
  PILLAR_KEYS.forEach(k => {
    const pillar = core.palja[k + 'Pillar'];
    const ganji = pillar.stem + pillar.branch;
    if (BAEKHO_GANJI.has(ganji)) perPillarTags[k].push('백호');
  });

  // core.manse[key].shinsals 에 반영 (중복 제거)
  PILLAR_KEYS.forEach(k => {
    core.manse[k].shinsals = [...new Set(perPillarTags[k])];
  });

  return perPillarTags;
}

module.exports = {
  analyzeShinsal, CHEONEUL, MUNCHANG, YANGIN, GOEGANG_ILJU, BAEKHO_GANJI,
  bananSalBranch, BRANCH_DIRECTION_KO
};
