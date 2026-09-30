'use strict';
/* 광고 성과 측정(메타·카카오 픽셀, 주문별 광고 유입 경로 저장)을 켜는 날짜.
   개인정보처리방침 개정안(9조 행태정보 수집)의 시행일과 같아야 한다 — 방침 13조의
   "시행 7일 전 고지"를 코드로 지키기 위해, 이 날짜 전에는 픽셀 ID를 내려주지 않고
   유입 경로도 저장하지 않는다. 방침을 다시 고치면 이 날짜와 privacy.html을 함께 바꾼다. */
const TRACKING_START = new Date('2026-10-08T00:00:00+09:00');

function trackingOn(now = Date.now()) {
  return now >= TRACKING_START.getTime();
}

module.exports = { TRACKING_START, trackingOn };
