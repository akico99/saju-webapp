'use strict';
/* 개운법(17장) 끝에 붙는 캡처용 체크리스트 카드 — todayFortune.js가 이미 쓰는
   오행→색/방향/맛 표에, interpretation.md "마이크로 개운 루틴"에 적어둔
   시간대별 실천 항목을 더해 4개짜리 체크리스트를 만든다. 전부 고정 테이블
   값이라 LLM이 새로 지어내는 문구는 없다. */
const { OHAENG_COLOR, OHAENG_DIRECTION_ACTION, OHAENG_TASTE } = require('../engine/todayFortune');

const OHAENG_TIME_ACTION = {
  '木': { time: '오전 3~7시(인묘시)', action: '기상 직후 스트레칭·산책, 화분·식물 곁에 두기' },
  '火': { time: '오전 9시~오후 1시(사오시)', action: '중요한 미팅·발표는 이 시간대에, 따뜻한 차 한잔으로 시작' },
  '土': { time: '오전 7~9시·오후 1~3시(진술축미시)', action: '책상·방 정리정돈, 신뢰가 필요한 약속은 이 시간대에' },
  '金': { time: '오후 3~7시(신유시)', action: '결단이 필요한 결정, 마무리·정산 업무' },
  '水': { time: '오후 9시~새벽 1시(해자시)', action: '기획·아이디어 정리, 물 자주 마시기' }
};

/** @param {string} yongshinMain 용신 오행(木火土金水) */
function buildOhaengQuest(yongshinMain) {
  const color = OHAENG_COLOR[yongshinMain];
  const directionAction = OHAENG_DIRECTION_ACTION[yongshinMain];
  const taste = OHAENG_TASTE[yongshinMain];
  const timeAction = OHAENG_TIME_ACTION[yongshinMain];
  const items = [
    `${color} 계열 옷이나 소지품 하나 챙기기`,
    directionAction,
    `${taste} 나는 음식이나 음료 한 입 챙기기`
  ];
  if (timeAction) items.push(`${timeAction.time}: ${timeAction.action}`);
  return items;
}

module.exports = { buildOhaengQuest };
