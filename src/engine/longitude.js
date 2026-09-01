'use strict';
/* 진태양시(경도) 보정 — 한국 표준시(KST)는 동경 135도 기준이라 실제 위치(약 127도)보다
   시계가 앞서 있다. 보정(분) = (실제경도 - 135) * 4분/도. 시각만 보정하고 절기/일진은
   보정된 시각을 기준으로 자연히 따라간다. */

const KST_MERIDIAN = 135;

const CITY_LON = {
  '서울': 126.98, '인천': 126.70, '수원': 127.03, '춘천': 127.73, '강릉': 128.90,
  '대전': 127.39, '세종': 127.29, '청주': 127.49, '천안': 127.11, '전주': 127.15,
  '광주': 126.85, '목포': 126.39, '여수': 127.66, '대구': 128.60, '안동': 128.73,
  '포항': 129.36, '부산': 129.08, '울산': 129.31, '창원': 128.68, '제주': 126.53,
  '평양': 125.75, '개성': 126.55
};
const DEFAULT_LON = CITY_LON['서울'];

function lonOffsetMin(lon) {
  return Math.round((lon - KST_MERIDIAN) * 4);
}

/**
 * 입력 시각(양력 분해값)에 경도 보정을 적용한 결과를 돌려준다.
 * @param {{year,month,day,hour,minute}} solar 보정 전 양력 시각
 * @param {number} lon 경도(도)
 * @returns {{before, after, offsetMin, dateShifted}}
 */
function applyOffset(solar, lon) {
  const offsetMin = lonOffsetMin(lon);
  const d = new Date(solar.year, solar.month - 1, solar.day, solar.hour, solar.minute + offsetMin, 0);
  const after = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  const dateShifted = (after.day !== solar.day || after.month !== solar.month || after.year !== solar.year);
  return { before: solar, after, offsetMin, dateShifted };
}

module.exports = { KST_MERIDIAN, CITY_LON, DEFAULT_LON, lonOffsetMin, applyOffset };
