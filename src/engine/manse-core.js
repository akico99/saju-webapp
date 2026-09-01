'use strict';
/* 만세력 기본 계산 — 팔자/일간/오행분포(내부가중)/십신분포(내부가중)/대운/12운성.
   브랜드 전용 점수(의대적성/의사인연) 제거, 신살은 shinsal.js로 분리. */

const {
  STEM_OHAENG, BRANCH_HIDDEN, BRANCH_MAIN_STEM,
  STEM_KO, BRANCH_KO, SHIPSIN_KO,
  getShipsin, UNSEONG_TABLE
} = require('./constants');

/**
 * @param {Object} input
 *   year, month, day, hour, minute — 양력 기준 시각(경도보정 등은 호출자가 이미 반영)
 *   gender — '남' | '여'
 *   isLunar — boolean (해당 없음, solar 변환은 호출자가 처리하고 넘긴다고 가정하지 않고 여기서도 지원)
 *   isLeap — boolean
 * @param {{Solar, Lunar}} lib lunar-javascript 모듈 (Solar/Lunar 생성자)
 */
function analyze(input, lib) {
  const { Solar, Lunar } = lib;
  const { year, month, day, hour, minute = 0, gender, isLunar = false, isLeap = false } = input;

  let solar;
  if (isLunar) {
    const lunar = Lunar.fromYmdHms(year, month, day, hour, minute, 0);
    solar = lunar.getSolar();
  } else {
    solar = Solar.fromYmdHms(year, month, day, hour, minute, 0);
  }
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const yearPillar = { stem: ec.getYearGan(), branch: ec.getYearZhi() };
  const monthPillar = { stem: ec.getMonthGan(), branch: ec.getMonthZhi() };
  const dayPillar = { stem: ec.getDayGan(), branch: ec.getDayZhi() };
  const hourPillar = { stem: ec.getTimeGan(), branch: ec.getTimeZhi() };
  const palja = { yearPillar, monthPillar, dayPillar, hourPillar };

  const dayStem = dayPillar.stem;
  const ilgan = { char: dayStem, ko: STEM_KO[dayStem], ...STEM_OHAENG[dayStem] };

  // 오행 분포 (천간 1.0 + 지장간 가중치) — 내부 계산용, 사용자 노출 금지(소수점 계약)
  const ohaengWeighted = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  [yearPillar, monthPillar, dayPillar, hourPillar].forEach(p => {
    ohaengWeighted[STEM_OHAENG[p.stem].ohaeng] += 1.0;
    (BRANCH_HIDDEN[p.branch] || []).forEach(h => { ohaengWeighted[STEM_OHAENG[h.stem].ohaeng] += h.weight; });
  });
  Object.keys(ohaengWeighted).forEach(k => { ohaengWeighted[k] = Math.round(ohaengWeighted[k] * 10) / 10; });

  // 십신 분포 (내부 가중) — 일간 제외 3천간 + 4지지 지장간
  const shipsinWeighted = { '比肩':0,'劫財':0,'食神':0,'傷官':0,'偏財':0,'正財':0,'偏官':0,'正官':0,'偏印':0,'正印':0 };
  [yearPillar.stem, monthPillar.stem, hourPillar.stem].forEach(s => {
    const sh = getShipsin(dayStem, s);
    if (sh) shipsinWeighted[sh] += 1;
  });
  [yearPillar.branch, monthPillar.branch, dayPillar.branch, hourPillar.branch].forEach(b => {
    (BRANCH_HIDDEN[b] || []).forEach(h => {
      const sh = getShipsin(dayStem, h.stem);
      if (sh) shipsinWeighted[sh] += h.weight;
    });
  });
  Object.keys(shipsinWeighted).forEach(k => { shipsinWeighted[k] = Math.round(shipsinWeighted[k] * 10) / 10; });

  // 대운 (성별 기반 순행/역행은 lunar-javascript가 처리)
  const yun = ec.getYun(gender === '남' ? 1 : 0);
  const daewoon = yun.getDaYun().slice(0, 9).map(d => ({
    startYear: d.getStartYear(),
    startAge: d.getStartAge(),
    ganZhi: d.getGanZhi(),
    stem: d.getGanZhi()[0],
    branch: d.getGanZhi()[1],
    // 세운(1년 단위) — 이 대운 구간에 속한 개별 연도들. 1년 단위 그래프에 쓴다.
    years: d.getLiuNian(10).map(l => ({
      year: l.getYear(), age: l.getAge(), ganZhi: l.getGanZhi()
    }))
  }));

  // 기둥별 십신/12운성 (일지 자신은 십신 없음 — 일간 기준점이므로)
  const pillars = { year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar };
  const manse = {};
  Object.entries(pillars).forEach(([key, pill]) => {
    const stem = pill.stem, branch = pill.branch;
    const stemShipsin = (key === 'day') ? null : getShipsin(dayStem, stem);
    const mainHidden = BRANCH_MAIN_STEM[branch];
    const branchShipsin = mainHidden ? getShipsin(dayStem, mainHidden) : null;
    const unseong = (UNSEONG_TABLE[dayStem] || {})[branch] || '';
    manse[key] = {
      stem, branch,
      stemKo: STEM_KO[stem], branchKo: BRANCH_KO[branch],
      stemOhaeng: STEM_OHAENG[stem]?.ohaeng, stemYinyang: STEM_OHAENG[stem]?.yinyang,
      branchOhaeng: STEM_OHAENG[mainHidden]?.ohaeng, branchYinyang: STEM_OHAENG[mainHidden]?.yinyang,
      stemShipsin, stemShipsinKo: stemShipsin ? SHIPSIN_KO[stemShipsin] : null,
      branchShipsin, branchShipsinKo: branchShipsin ? SHIPSIN_KO[branchShipsin] : null,
      unseong,
      shinsals: [] // shinsal.js가 채운다
    };
  });

  return {
    palja, ilgan,
    ohaengWeighted, shipsinWeighted,
    manse, daewoon,
    meta: {
      gender,
      solar: { y: solar.getYear(), m: solar.getMonth(), d: solar.getDay(), h: solar.getHour(), min: solar.getMinute() },
      lunar: { y: lunar.getYear(), m: lunar.getMonth(), d: lunar.getDay(), isLeap: lunar.getMonth() < 0 }
    }
  };
}

module.exports = { analyze };
