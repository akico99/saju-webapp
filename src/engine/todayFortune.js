'use strict';
/* 오늘의 운세 — 로그인 사용자의 저장된 일간과 "오늘" 일진을 대조해 무료로 보여주는
   결정론적(=AI 미호출, 비용 0) 기능. computeSaju/getShipsin을 그대로 재사용한다.
   점수는 life-graph와 완전히 같은 방식(relationScore, 오늘 간지 오행 vs 용신)으로 계산해서
   "오늘따라 왜 이 문구가 나왔는지"에 근거가 있게 하고, 매일 숫자가 바뀌어 다시 들어올
   이유(후킹)를 만든다.

   전용 페이지(today-fortune.html)를 위해 세 줄 요약/날씨/DO·DON'T/액땜 체크리스트/
   업셀 추천을 추가했다 — 전부 이미 계산되는 group(오늘 십성 그룹)과 yongshinMain
   (용신 오행) 두 값만으로 고정 표에서 골라 조합하는 방식이라, 여기서도 지어내는
   내용은 없다. */
const { computeSaju } = require('./index');
const { getShipsin, SHIPSIN_KO, SHIPSIN_GROUP, STEM_KO, BRANCH_KO, STEM_OHAENG, BRANCH_MAIN_STEM } = require('./constants');
const { relationScore } = require('../pdf/charts');

const GROUP_CONTENT = {
  '비겁': {
    title: '어깨를 나란히 하는 날',
    desc: '동료·친구와의 협력이 힘이 되는 날입니다. 혼자 끌어안고 있던 일이 있다면 오늘은 주변에 슬쩍 도움을 청해 보세요. 여럿이 모이는 자리일수록 운이 붙습니다.',
    tip: '오늘은 혼자 하는 일보다, 누군가와 함께하는 약속을 하나 잡아보세요.',
    topic: 'relationship', topicLabel: '인간관계',
    summary3: ['혼자보다 함께일 때 힘이 붙는 날', '주변에 먼저 손 내밀면 반응이 좋아요', '여럿이 모이는 자리라면 참석해보세요'],
    dos: ['평소 서먹했던 동료·친구에게 먼저 연락하기', '함께할 사람이 필요한 일은 오늘 부탁해보기'],
    donts: ['혼자 끝까지 끌어안고 버티기'],
    questAction: '오늘 만나는 사람에게 안부 인사를 먼저 건네보세요'
  },
  '식상': {
    title: '재능이 꽃피는 날',
    desc: '표현하고 만들어내는 에너지가 살아나는 날입니다. 미뤄둔 아이디어나 하고 싶던 말이 있다면 오늘 꺼내 보세요. 평소보다 감각이 예민해져서 시도한 것들이 반응을 얻기 쉽습니다.',
    tip: '머릿속에만 있던 아이디어를 오늘 하나라도 실제로 꺼내보세요.',
    topic: 'career', topicLabel: '직업·적성운',
    summary3: ['표현하고 만드는 에너지가 살아나는 날', '미뤄둔 아이디어를 꺼내기 좋은 타이밍', '평소보다 감각이 예민해져 있어요'],
    dos: ['미뤄둔 아이디어나 하고 싶던 말 하나 실행하기', '창작·기획처럼 표현하는 작업에 시간 쓰기'],
    donts: ['생각만 하고 아무것도 꺼내지 않기'],
    questAction: '머릿속에만 있던 생각 하나를 오늘 메모나 말로 꺼내보세요'
  },
  '재성': {
    title: '결실을 맺는 날',
    desc: '노력한 것이 눈에 보이는 성과로 돌아올 가능성이 큰 날입니다. 재물과 관련된 결정, 협상, 지출 계획에도 비교적 유리하게 흘러갑니다. 다만 성과가 보인다고 무리하게 확장하진 마세요.',
    tip: '미뤄왔던 돈 관련 계획(지출 점검, 협상, 제안)이 있다면 오늘 움직여보세요.',
    topic: 'wealth', topicLabel: '재물운',
    summary3: ['노력한 게 성과로 돌아오기 쉬운 날', '돈 관련 결정·협상에 비교적 유리해요', '다만 성과 보인다고 무리한 확장은 금물'],
    dos: ['미뤄뒀던 지출 점검이나 협상 진행하기', '작은 성과라도 눈에 보이면 바로 기록해두기'],
    donts: ['잘된다고 무리하게 벌리거나 확장하기'],
    questAction: '오늘 지갑이나 통장 잔액을 한 번 들여다보세요'
  },
  '관성': {
    title: '명예가 드높은 날',
    desc: '책임 있는 자리에서 인정받기 좋은 날입니다. 상사나 윗사람, 조직과의 관계에서 신뢰를 쌓기 좋은 타이밍이에요. 다만 무리한 추진보다는 원칙을 지키는 쪽이 오히려 더 유리하게 작용합니다.',
    tip: '보고, 발표, 면접처럼 "평가받는 자리"가 있다면 오늘이 유리합니다.',
    topic: 'career', topicLabel: '직업·적성운',
    summary3: ['책임 있는 자리에서 인정받기 좋은 날', '윗사람·조직과 신뢰 쌓기 좋은 타이밍', '무리한 추진보다 원칙 지키기가 유리해요'],
    dos: ['보고·발표·면접처럼 평가받는 자리 적극적으로 임하기', '원칙과 절차를 평소보다 꼼꼼히 지키기'],
    donts: ['정해진 절차를 건너뛰고 무리하게 밀어붙이기'],
    questAction: '오늘 만나는 윗사람이나 어른께 존중하는 태도로 먼저 인사해보세요'
  },
  '인성': {
    title: '귀인의 도움이 있는 날',
    desc: '배움이나 문서, 귀인의 조언에서 힌트를 얻는 날입니다. 공부, 계약, 자격증처럼 신중함이 필요한 일에 특히 좋습니다. 평소 존경하던 사람의 말 한마디가 오늘따라 크게 와닿을 수 있어요.',
    tip: '중요한 서류에 서명하거나, 배우고 싶었던 걸 오늘 알아보기 좋은 날이에요.',
    topic: 'total', topicLabel: '오늘의 나 총평',
    summary3: ['배움과 조언에서 힌트를 얻는 날', '공부·계약처럼 신중한 일에 특히 좋아요', '존경하는 사람의 말이 크게 와닿을 수 있어요'],
    dos: ['중요한 서류 확인이나 서명, 계약 검토하기', '배우고 싶었던 것 하나 찾아보거나 시작하기'],
    donts: ['조언을 귀담아듣지 않고 혼자 결정하기'],
    questAction: '오늘 존경하는 사람이나 어른에게 안부를 물어보세요'
  }
};

function scoreTierNote(score) {
  if (score >= 75) return '오늘은 평소보다 뚜렷하게 힘을 받는 날이에요.';
  if (score >= 50) return '나쁘지 않게 흘러가는, 무난한 하루예요.';
  return '오늘은 큰 결정보다 하던 대로 차분하게 움직이는 게 유리해요.';
}

// 점수(오늘 간지가 용신과 얼마나 맞는지)를 날씨로 은유 — 날씨는 대표적인 "쉬운 비유"라
// 명리학 지식 없이도 직관적으로 오늘의 흐름을 이해할 수 있게 해준다.
const WEATHER_TIERS = [
  { min: 75, icon: '☀️', label: '맑음', note: '기운이 뚜렷하게 잘 드는 날이에요. 하고 싶었던 걸 시도하기 좋아요.' },
  { min: 55, icon: '🌤️', label: '구름 조금', note: '무난하게 흘러가는, 대체로 나쁘지 않은 하루예요.' },
  { min: 35, icon: '☁️', label: '흐림', note: '눈에 띄게 나쁘진 않지만, 큰 결정은 하루 정도 미뤄도 좋아요.' },
  { min: 0, icon: '🌧️', label: '비', note: '기운이 가라앉는 날이니, 무리하지 말고 컨디션 관리에 집중하세요.' }
];
function weatherOf(score) {
  const tier = WEATHER_TIERS.find((t) => score >= t.min);
  return { icon: tier.icon, label: tier.label, note: tier.note };
}

// 액땜 퀘스트용 오행→색/방향/맛 — dateSelect.js의 보충법 표와 동일 기준(interpretation.md).
const OHAENG_COLOR = { '木': '청록색', '火': '빨강', '土': '노랑이나 황토색', '金': '흰색', '水': '검정이나 남색' };
const OHAENG_DIRECTION_ACTION = {
  '木': '동쪽 방향으로 잠깐 나가 바람 쐬기', '火': '남쪽 방향으로 잠깐 나가 바람 쐬기',
  '土': '익숙한 동네를 잠깐 산책하기', '金': '서쪽 방향으로 잠깐 나가 바람 쐬기', '水': '북쪽 방향으로 잠깐 나가 바람 쐬기'
};
const OHAENG_TASTE = { '木': '신맛', '火': '쓴맛', '土': '단맛', '金': '매운맛', '水': '짠맛' };

function questOf(yongshinMain, questAction) {
  const color = OHAENG_COLOR[yongshinMain], directionAction = OHAENG_DIRECTION_ACTION[yongshinMain], taste = OHAENG_TASTE[yongshinMain];
  return [
    { done: false, text: `${color} 계열 옷이나 소품 하나 챙기기` },
    { done: false, text: directionAction },
    { done: false, text: `${taste} 나는 음식이나 음료 한 입 챙기기` },
    { done: false, text: questAction }
  ];
}

// 랜덤 서비스 추천(업셀) — 실제 존재하는 상품만 담는다.
const UPSELL_CANDIDATES = [
  { label: '지금 인연이 궁금하다면', name: '궁합운', href: '/life-topics.html?topic=compat', price: '2,900원' },
  { label: '돈 흐름이 궁금하다면', name: '재물운', href: '/life-topics.html?topic=wealth', price: '990원' },
  { label: '요즘 컨디션이 궁금하다면', name: '건강운', href: '/life-topics.html?topic=health', price: '990원' },
  { label: '이사를 계획 중이라면', name: '이사 리포트', href: '/date-select.html?occasion=moving', price: '990원' },
  { label: '개업을 준비 중이라면', name: '개업 리포트', href: '/date-select.html?occasion=opening', price: '990원' },
  { label: '내 인생 전체가 궁금하다면', name: '평생사주 100p', href: '/lifetime-report.html', price: '14,900원' }
];
function randomUpsell() {
  return UPSELL_CANDIDATES[Math.floor(Math.random() * UPSELL_CANDIDATES.length)];
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
    topicLabel: content.topicLabel,
    summary3: content.summary3,
    weather: weatherOf(score),
    dos: content.dos,
    donts: content.donts,
    quest: questOf(yongshinMain, content.questAction),
    upsell: randomUpsell()
  };
}

module.exports = { getTodayFortune };
