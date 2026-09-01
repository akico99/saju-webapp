'use strict';
/* 엔진 오케스트레이터 — manse-core/counts/hapchung/strength/kyukguk/yongshin/shinsal을
   전부 조립해 하나의 JSON 계약으로 반환한다. LLM 프롬프트 빌더와 PDF 렌더러가 동일하게
   이 결과 객체 하나만 소비한다(중복 로직 없음). */

let Solar, Lunar;
try {
  ({ Solar, Lunar } = require('lunar-javascript'));
} catch (e) {
  throw new Error('lunar-javascript 미설치. saju-webapp 폴더에서: npm install');
}

const { CITY_LON, DEFAULT_LON, applyOffset } = require('./longitude');
const manseCore = require('./manse-core');
const { buildCounts } = require('./counts');
const { analyzeHapchung } = require('./hapchung');
const { analyzeStrength } = require('./strength');
const { analyzeKyukguk } = require('./kyukguk');
const { analyzeYongshin } = require('./yongshin');
const { analyzeShinsal } = require('./shinsal');

/**
 * @param {Object} input
 *   year, month, day — 필수
 *   hour, minute — 선택(모르면 정오로 가정 + 경고)
 *   gender — '남' | '여' (선택, 모르면 남으로 가정 + 경고)
 *   isLunar, isLeap — 음력/윤달 여부
 *   city — CITY_LON 키 중 하나 (선택, 출생지)
 *   lon — 경도 직접 지정 (선택, city보다 우선)
 *   lonOff — true면 진태양시 보정을 끄고 표준시 그대로 계산
 */
function computeSaju(input) {
  const {
    year, month, day,
    hour = null, minute = 0,
    gender = null,
    isLunar = false, isLeap = false,
    city = null, lon: lonInput = null, lonOff = false
  } = input;

  if (!year || !month || !day) throw new Error('생년월일(year/month/day)이 필요합니다.');

  const warnings = [];
  const hourGiven = hour != null;
  const genderGiven = !!gender;
  const resolvedHour = hourGiven ? hour : 12;
  const resolvedMinute = hourGiven ? minute : 0;
  const resolvedGender = genderGiven ? gender : '남';
  if (!hourGiven) warnings.push('시(時) 미상 → 정오로 가정함. 시주·일부 신살은 불확실.');
  if (!genderGiven) warnings.push('성별 미입력 → 남자로 가정함. 대운 순행/역행 및 육친 해석에 영향.');

  let offsetMin = 0, solarBefore = null, solarAfter = null, dateShifted = false, lonLabel = null;
  let calcInput = { year, month, day, hour: resolvedHour, minute: resolvedMinute, isLunar };

  if (!lonOff) {
    const lon = lonInput != null ? lonInput : (city && CITY_LON[city] != null ? CITY_LON[city] : DEFAULT_LON);
    lonLabel = lonInput != null ? `경도 ${lonInput}°E` : (city && CITY_LON[city] != null ? `${city} ${CITY_LON[city]}°E` : `서울(기본) ${DEFAULT_LON}°E`);

    let sy = year, sm = month, sd = day, sh = resolvedHour, smin = resolvedMinute;
    if (isLunar) {
      const s = Lunar.fromYmdHms(year, month, day, resolvedHour, resolvedMinute, 0).getSolar();
      sy = s.getYear(); sm = s.getMonth(); sd = s.getDay(); sh = s.getHour(); smin = s.getMinute();
    }
    const off = applyOffset({ year: sy, month: sm, day: sd, hour: sh, minute: smin }, lon);
    offsetMin = off.offsetMin;
    solarBefore = off.before;
    solarAfter = off.after;
    dateShifted = off.dateShifted;
    calcInput = { ...off.after, isLunar: false };
  }

  const core = manseCore.analyze({
    year: calcInput.year, month: calcInput.month, day: calcInput.day,
    hour: calcInput.hour, minute: calcInput.minute,
    gender: resolvedGender, isLunar: calcInput.isLunar, isLeap
  }, { Solar, Lunar });

  const counts = buildCounts(core);
  const hapchung = analyzeHapchung(core.palja);
  const strength = analyzeStrength(core);
  const kyukguk = analyzeKyukguk(core, hapchung, strength, counts);
  const yongshin = analyzeYongshin(core, strength, hapchung, counts);
  analyzeShinsal(core); // core.manse[*].shinsals를 채움 (부수효과)

  return {
    meta: {
      input: { year, month, day, hour: hourGiven ? hour : null, minute, gender: genderGiven ? gender : null, isLunar, isLeap, city, lon: lonInput },
      hourGiven, genderGiven,
      lonOff, offsetMin, lonLabel, solarBefore, solarAfter, dateShifted,
      solarResolved: core.meta.solar, lunarResolved: core.meta.lunar,
      warnings
    },
    palja: core.palja,
    ilgan: core.ilgan,
    counts,
    manse: core.manse,
    daewoon: core.daewoon,
    hapchung,
    strength,
    kyukguk,
    yongshin
  };
}

module.exports = { computeSaju };
