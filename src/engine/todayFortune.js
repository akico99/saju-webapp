'use strict';
/* 오늘의 운세 — 로그인 사용자의 저장된 일간과 "오늘" 일진을 대조해 무료로 보여주는
   결정론적(=AI 미호출, 비용 0) 기능. computeSaju/getShipsin을 그대로 재사용한다.
   점수는 life-graph와 완전히 같은 방식(relationScore, 오늘 간지 오행 vs 용신)으로 계산해서
   "오늘따라 왜 이 문구가 나왔는지"에 근거가 있게 하고, 매일 숫자가 바뀌어 다시 들어올
   이유(후킹)를 만든다. */
const { computeSaju } = require('./index');
const { getShipsin, SHIPSIN_KO, SHIPSIN_GROUP, STEM_KO, BRANCH_KO, STEM_OHAENG, BRANCH_MAIN_STEM } = require('./constants');
const { relationScore } = require('../pdf/charts');

const GROUP_CONTENT = {
  '비겁': {
    title: '어깨를 나란히 하는 날',
    desc: '동료·친구와의 협력이 힘이 되는 날입니다. 혼자 끌어안고 있던 일이 있다면 오늘은 주변에 슬쩍 도움을 청해 보세요. 여럿이 모이는 자리일수록 운이 붙습니다.',
    tip: '오늘은 혼자 하는 일보다, 누군가와 함께하는 약속을 하나 잡아보세요.',
    topic: 'relationship', topicLabel: '인간관계'
  },
  '식상': {
    title: '재능이 꽃피는 날',
    desc: '표현하고 만들어내는 에너지가 살아나는 날입니다. 미뤄둔 아이디어나 하고 싶던 말이 있다면 오늘 꺼내 보세요. 평소보다 감각이 예민해져서 시도한 것들이 반응을 얻기 쉽습니다.',
    tip: '머릿속에만 있던 아이디어를 오늘 하나라도 실제로 꺼내보세요.',
    topic: 'career', topicLabel: '직업·적성운'
  },
  '재성': {
    title: '결실을 맺는 날',
    desc: '노력한 것이 눈에 보이는 성과로 돌아올 가능성이 큰 날입니다. 재물과 관련된 결정, 협상, 지출 계획에도 비교적 유리하게 흘러갑니다. 다만 성과가 보인다고 무리하게 확장하진 마세요.',
    tip: '미뤄왔던 돈 관련 계획(지출 점검, 협상, 제안)이 있다면 오늘 움직여보세요.',
    topic: 'wealth', topicLabel: '재물운'
  },
  '관성': {
    title: '명예가 드높은 날',
    desc: '책임 있는 자리에서 인정받기 좋은 날입니다. 상사나 윗사람, 조직과의 관계에서 신뢰를 쌓기 좋은 타이밍이에요. 다만 무리한 추진보다는 원칙을 지키는 쪽이 오히려 더 유리하게 작용합니다.',
    tip: '보고, 발표, 면접처럼 "평가받는 자리"가 있다면 오늘이 유리합니다.',
    topic: 'career', topicLabel: '직업·적성운'
  },
  '인성': {
    title: '귀인의 도움이 있는 날',
    desc: '배움이나 문서, 귀인의 조언에서 힌트를 얻는 날입니다. 공부, 계약, 자격증처럼 신중함이 필요한 일에 특히 좋습니다. 평소 존경하던 사람의 말 한마디가 오늘따라 크게 와닿을 수 있어요.',
    tip: '중요한 서류에 서명하거나, 배우고 싶었던 걸 오늘 알아보기 좋은 날이에요.',
    topic: 'total', topicLabel: '오늘의 나 총평'
  }
};

function scoreTierNote(score) {
  if (score >= 75) return '오늘은 평소보다 뚜렷하게 힘을 받는 날이에요.';
  if (score >= 50) return '나쁘지 않게 흘러가는, 무난한 하루예요.';
  return '오늘은 큰 결정보다 하던 대로 차분하게 움직이는 게 유리해요.';
}

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
  const yongshinMain = myResult.yongshin.final.main;

  const todayResult = computeSaju({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: 12, minute: 0, gender: '남' });
  const todayStem = todayResult.palja.dayPillar.stem;
  const todayBranch = todayResult.palja.dayPillar.branch;

  const shipsinHanja = getShipsin(myIlganStem, todayStem);
  const shipsinKo = shipsinHanja ? SHIPSIN_KO[shipsinHanja] : '비견'; // 같은 글자(=일간과 오늘 간지가 같은 날)는 getShipsin이 比肩 반환
  const group = SHIPSIN_GROUP[shipsinKo] || '비겁';
  const content = GROUP_CONTENT[group];

  // life-graph와 동일한 계산(오늘 간지의 오행이 내 용신과 얼마나 맞는지) — 매일 값이 바뀌는
  // 숫자 하나를 더해서 "오늘은 몇 점일까" 궁금증을 만든다.
  const stemOhaeng = STEM_OHAENG[todayStem]?.ohaeng;
  const branchMainStem = BRANCH_MAIN_STEM[todayBranch];
  const branchOhaeng = branchMainStem ? STEM_OHAENG[branchMainStem]?.ohaeng : null;
  const rawScore = Math.round(relationScore(stemOhaeng, yongshinMain) * 0.5 + relationScore(branchOhaeng, yongshinMain) * 0.5);
  const score = Math.max(5, Math.min(95, rawScore));

  return {
    date: `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`,
    gapja: `${STEM_KO[todayStem]}${BRANCH_KO[todayBranch]}일`,
    group,
    score,
    scoreNote: scoreTierNote(score),
    title: content.title,
    desc: content.desc,
    tip: content.tip,
    topic: content.topic,
    topicLabel: content.topicLabel
  };
}

module.exports = { getTodayFortune };
