'use strict';
/* 오늘의 운세 — 로그인 사용자의 저장된 일간과 "오늘" 일진을 대조해 무료로 보여주는
   결정론적(=AI 미호출, 비용 0) 기능. computeSaju/getShipsin을 그대로 재사용한다. */
const { computeSaju } = require('./index');
const { getShipsin, SHIPSIN_KO, SHIPSIN_GROUP, STEM_KO, BRANCH_KO } = require('./constants');

const GROUP_CONTENT = {
  '비겁': { title: '어깨를 나란히 하는 날', desc: '동료·친구와의 협력이 힘이 되는 날입니다. 혼자 끌어안기보다 주변에 도움을 청해 보세요.' },
  '식상': { title: '재능이 꽃피는 날', desc: '표현하고 만들어내는 에너지가 살아나는 날입니다. 미뤄둔 아이디어를 꺼내 보기 좋습니다.' },
  '재성': { title: '결실을 맺는 날', desc: '노력한 것이 눈에 보이는 성과로 돌아올 가능성이 큽니다. 재물과 관련된 결정에도 유리합니다.' },
  '관성': { title: '명예가 드높은 날', desc: '책임 있는 자리에서 인정받기 좋은 날입니다. 다만 무리한 추진보다 원칙을 지키는 쪽이 유리합니다.' },
  '인성': { title: '귀인의 도움이 있는 날', desc: '배움이나 문서, 귀인의 조언에서 힌트를 얻는 날입니다. 공부·계약처럼 신중함이 필요한 일에 좋습니다.' }
};

/**
 * @param {Object} birth - users 테이블에 저장된 생년월일시 (연/월/일 필수, 시는 없어도 됨)
 * @param {Date} [now] - 테스트용 날짜 오버라이드
 */
function getTodayFortune(birth, now = new Date()) {
  if (!birth || !birth.year || !birth.month || !birth.day) {
    throw new Error('생년월일 정보가 없습니다. 프로필에서 먼저 등록해주세요.');
  }

  const myResult = computeSaju({
    year: birth.year, month: birth.month, day: birth.day,
    hour: birth.hour != null ? birth.hour : null, minute: birth.minute || 0,
    gender: birth.gender || null, isLunar: !!birth.isLunar, isLeap: !!birth.isLeap,
    city: birth.city || null
  });
  const myIlganStem = myResult.palja.dayPillar.stem;

  const todayResult = computeSaju({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: 12, minute: 0, gender: '남' });
  const todayStem = todayResult.palja.dayPillar.stem;
  const todayBranch = todayResult.palja.dayPillar.branch;

  const shipsinHanja = getShipsin(myIlganStem, todayStem);
  const shipsinKo = shipsinHanja ? SHIPSIN_KO[shipsinHanja] : '비견'; // 같은 글자(=일간과 오늘 간지가 같은 날)는 getShipsin이 比肩 반환
  const group = SHIPSIN_GROUP[shipsinKo] || '비겁';
  const content = GROUP_CONTENT[group];

  return {
    date: `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`,
    gapja: `${STEM_KO[todayStem]}${BRANCH_KO[todayBranch]}일`,
    group,
    title: content.title,
    desc: content.desc
  };
}

module.exports = { getTodayFortune };
