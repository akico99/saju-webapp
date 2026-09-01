'use strict';
/* 천간/지지 기본 상수 — 오행·음양·지장간·한글표기·십신 산출용 생극 관계 */

const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

const STEM_OHAENG = {
  '甲': { ohaeng: '木', yinyang: '양' },
  '乙': { ohaeng: '木', yinyang: '음' },
  '丙': { ohaeng: '火', yinyang: '양' },
  '丁': { ohaeng: '火', yinyang: '음' },
  '戊': { ohaeng: '土', yinyang: '양' },
  '己': { ohaeng: '土', yinyang: '음' },
  '庚': { ohaeng: '金', yinyang: '양' },
  '辛': { ohaeng: '金', yinyang: '음' },
  '壬': { ohaeng: '水', yinyang: '양' },
  '癸': { ohaeng: '水', yinyang: '음' }
};

// 지지 지장간 (본기/중기/여기 순서 고정 — 격국 투출 우선순위 판정에 이 순서를 그대로 씀)
// 각 항목: { stem, weight, slot: '본기'|'중기'|'여기' }
const BRANCH_HIDDEN = {
  '子': [{ stem: '癸', weight: 1.0, slot: '본기' }],
  '丑': [{ stem: '己', weight: 0.6, slot: '본기' }, { stem: '癸', weight: 0.2, slot: '중기' }, { stem: '辛', weight: 0.2, slot: '여기' }],
  '寅': [{ stem: '甲', weight: 0.6, slot: '본기' }, { stem: '丙', weight: 0.2, slot: '중기' }, { stem: '戊', weight: 0.2, slot: '여기' }],
  '卯': [{ stem: '乙', weight: 1.0, slot: '본기' }],
  '辰': [{ stem: '戊', weight: 0.6, slot: '본기' }, { stem: '乙', weight: 0.2, slot: '중기' }, { stem: '癸', weight: 0.2, slot: '여기' }],
  '巳': [{ stem: '丙', weight: 0.6, slot: '본기' }, { stem: '戊', weight: 0.2, slot: '중기' }, { stem: '庚', weight: 0.2, slot: '여기' }],
  '午': [{ stem: '丁', weight: 0.7, slot: '본기' }, { stem: '己', weight: 0.3, slot: '중기' }],
  '未': [{ stem: '己', weight: 0.6, slot: '본기' }, { stem: '丁', weight: 0.2, slot: '중기' }, { stem: '乙', weight: 0.2, slot: '여기' }],
  '申': [{ stem: '庚', weight: 0.6, slot: '본기' }, { stem: '壬', weight: 0.2, slot: '중기' }, { stem: '戊', weight: 0.2, slot: '여기' }],
  '酉': [{ stem: '辛', weight: 1.0, slot: '본기' }],
  '戌': [{ stem: '戊', weight: 0.6, slot: '본기' }, { stem: '辛', weight: 0.2, slot: '중기' }, { stem: '丁', weight: 0.2, slot: '여기' }],
  '亥': [{ stem: '壬', weight: 0.7, slot: '본기' }, { stem: '甲', weight: 0.3, slot: '중기' }]
};
const BRANCH_MAIN_STEM = Object.fromEntries(
  Object.entries(BRANCH_HIDDEN).map(([b, arr]) => [b, arr[0].stem])
);

const STEM_KO = { '甲':'갑','乙':'을','丙':'병','丁':'정','戊':'무','己':'기','庚':'경','辛':'신','壬':'임','癸':'계' };
const BRANCH_KO = { '子':'자','丑':'축','寅':'인','卯':'묘','辰':'진','巳':'사','午':'오','未':'미','申':'신','酉':'유','戌':'술','亥':'해' };

const SHIPSIN_KO = {
  '比肩': '비견', '劫財': '겁재',
  '食神': '식신', '傷官': '상관',
  '偏財': '편재', '正財': '정재',
  '偏官': '편관', '正官': '정관',
  '偏印': '편인', '正印': '정인'
};
const SHIPSIN_GROUP = {
  '비견': '비겁', '겁재': '비겁',
  '식신': '식상', '상관': '식상',
  '편재': '재성', '정재': '재성',
  '편관': '관성', '정관': '관성',
  '편인': '인성', '정인': '인성'
};

// 오행 생(生)·극(克) 관계
const PRODUCES = { '木':'火', '火':'土', '土':'金', '金':'水', '水':'木' }; // A生B
const CONTROLS = { '木':'土', '火':'金', '土':'水', '金':'木', '水':'火' }; // A克B
function productOf(ohaeng) { return PRODUCES[ohaeng]; }
function controlsOf(ohaeng) { return CONTROLS[ohaeng]; }
function whoProduces(ohaeng) { return Object.keys(PRODUCES).find(k => PRODUCES[k] === ohaeng); } // ohaeng를 生하는 오행
function whoControls(ohaeng) { return Object.keys(CONTROLS).find(k => CONTROLS[k] === ohaeng); } // ohaeng를 克하는 오행

// 일간 vs 대상 천간 → 십신 (한자)
function getShipsin(dayStem, targetStem) {
  const day = STEM_OHAENG[dayStem];
  const target = STEM_OHAENG[targetStem];
  if (!day || !target) return null;
  const sameYY = day.yinyang === target.yinyang;
  const dO = day.ohaeng, tO = target.ohaeng;

  if (dO === tO) return sameYY ? '比肩' : '劫財';
  if (productOf(dO) === tO) return sameYY ? '食神' : '傷官';
  if (controlsOf(dO) === tO) return sameYY ? '偏財' : '正財';
  if (controlsOf(tO) === dO) return sameYY ? '偏官' : '正官';
  if (productOf(tO) === dO) return sameYY ? '偏印' : '正印';
  return null;
}

const UNSEONG_TABLE = {
  '甲': { '亥':'장생','子':'목욕','丑':'관대','寅':'건록','卯':'제왕','辰':'쇠','巳':'병','午':'사','未':'묘','申':'절','酉':'태','戌':'양' },
  '乙': { '午':'장생','巳':'목욕','辰':'관대','卯':'건록','寅':'제왕','丑':'쇠','子':'병','亥':'사','戌':'묘','酉':'절','申':'태','未':'양' },
  '丙': { '寅':'장생','卯':'목욕','辰':'관대','巳':'건록','午':'제왕','未':'쇠','申':'병','酉':'사','戌':'묘','亥':'절','子':'태','丑':'양' },
  '丁': { '酉':'장생','申':'목욕','未':'관대','午':'건록','巳':'제왕','辰':'쇠','卯':'병','寅':'사','丑':'묘','子':'절','亥':'태','戌':'양' },
  '戊': { '寅':'장생','卯':'목욕','辰':'관대','巳':'건록','午':'제왕','未':'쇠','申':'병','酉':'사','戌':'묘','亥':'절','子':'태','丑':'양' },
  '己': { '酉':'장생','申':'목욕','未':'관대','午':'건록','巳':'제왕','辰':'쇠','卯':'병','寅':'사','丑':'묘','子':'절','亥':'태','戌':'양' },
  '庚': { '巳':'장생','午':'목욕','未':'관대','申':'건록','酉':'제왕','戌':'쇠','亥':'병','子':'사','丑':'묘','寅':'절','卯':'태','辰':'양' },
  '辛': { '子':'장생','亥':'목욕','戌':'관대','酉':'건록','申':'제왕','未':'쇠','午':'병','巳':'사','辰':'묘','卯':'절','寅':'태','丑':'양' },
  '壬': { '申':'장생','酉':'목욕','戌':'관대','亥':'건록','子':'제왕','丑':'쇠','寅':'병','卯':'사','辰':'묘','巳':'절','午':'태','未':'양' },
  '癸': { '卯':'장생','寅':'목욕','丑':'관대','子':'건록','亥':'제왕','戌':'쇠','酉':'병','申':'사','未':'묘','午':'절','巳':'태','辰':'양' }
};
const WANGJI_UNSEONG = new Set(['장생', '관대', '건록', '제왕']); // 득지 판정에 쓰는 "왕지"

module.exports = {
  HEAVENLY_STEMS, EARTHLY_BRANCHES,
  STEM_OHAENG, BRANCH_HIDDEN, BRANCH_MAIN_STEM,
  STEM_KO, BRANCH_KO, SHIPSIN_KO, SHIPSIN_GROUP,
  PRODUCES, CONTROLS, productOf, controlsOf, whoProduces, whoControls,
  getShipsin,
  UNSEONG_TABLE, WANGJI_UNSEONG
};
