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
    desc: '오늘의 십성은 동료·친구와 나란히 움직이는 주제로 읽습니다. 혼자 끌어안고 있던 일이 있다면 주변에 도움을 청해 보는 것도 한 방법입니다.',
    tip: '오늘은 혼자 하는 일보다, 누군가와 함께하는 약속을 하나 잡아보세요.',
    topic: 'relationship', topicLabel: '인간관계',
    summary3: ['오늘 살필 주제는 협력과 동료', '도움이 필요하다면 구체적으로 요청하기', '함께할 수 있는 일을 한 가지 찾아보기'],
    dos: ['평소 서먹했던 동료·친구에게 먼저 연락하기', '함께할 사람이 필요한 일은 오늘 부탁해보기'],
    donts: ['혼자 끝까지 끌어안고 버티기'],
    questAction: '오늘 만나는 사람에게 안부 인사를 먼저 건네보세요'
  },
  '식상': {
    title: '표현을 꺼내보는 날',
    desc: '오늘의 십성은 표현하고 만들어내는 일과 연결해 읽습니다. 미뤄둔 아이디어나 하고 싶던 말을 작게라도 꺼내 보세요.',
    tip: '머릿속에만 있던 아이디어를 오늘 하나라도 실제로 꺼내보세요.',
    topic: 'career', topicLabel: '직업·적성운',
    summary3: ['오늘 살필 주제는 표현과 창작', '미뤄둔 생각 하나를 밖으로 꺼내보기', '성과보다 시도 자체에 초점 맞추기'],
    dos: ['미뤄둔 아이디어나 하고 싶던 말 하나 실행하기', '창작·기획처럼 표현하는 작업에 시간 쓰기'],
    donts: ['생각만 하고 아무것도 꺼내지 않기'],
    questAction: '머릿속에만 있던 생각 하나를 오늘 메모나 말로 꺼내보세요'
  },
  '재성': {
    title: '성과와 지출을 점검하는 날',
    desc: '오늘의 십성은 성과와 자원의 사용에 연결해 읽습니다. 지출이나 진행 중인 일을 점검하는 계기로 삼되, 운세만으로 금융 결정을 내리지는 마세요.',
    tip: '미뤄왔던 지출 내역을 확인하고 필요한 계획을 정리해 보세요.',
    topic: 'wealth', topicLabel: '재물운',
    summary3: ['오늘 살필 주제는 성과와 자원', '지출과 진행 상황을 차분히 확인하기', '결정을 서두르지 않고 조건 검토하기'],
    dos: ['미뤄뒀던 지출 내역 점검하기', '작은 성과라도 눈에 보이면 바로 기록해두기'],
    donts: ['잘된다고 무리하게 벌리거나 확장하기'],
    questAction: '오늘 지갑이나 통장 잔액을 한 번 들여다보세요'
  },
  '관성': {
    title: '맡은 역할을 살피는 날',
    desc: '오늘의 십성은 책임과 원칙에 연결해 읽습니다. 평가를 받는 일이 있다면 운세의 길흉보다 준비한 내용과 절차를 확인해 보세요.',
    tip: '보고나 발표가 예정돼 있다면 내용과 절차를 한 번 더 점검해 보세요.',
    topic: 'career', topicLabel: '직업·적성운',
    summary3: ['오늘 살필 주제는 책임과 원칙', '준비한 내용과 절차를 확인하기', '무리한 추진보다 기준을 분명히 하기'],
    dos: ['예정된 보고·발표의 내용 점검하기', '원칙과 절차를 평소보다 꼼꼼히 지키기'],
    donts: ['정해진 절차를 건너뛰고 무리하게 밀어붙이기'],
    questAction: '오늘 만나는 윗사람이나 어른께 존중하는 태도로 먼저 인사해보세요'
  },
  '인성': {
    title: '배움과 조언을 살피는 날',
    desc: '오늘의 십성은 배움·문서·조언의 주제로 읽습니다. 공부할 일이나 확인할 서류가 있다면 차분히 살펴보세요. 이 결과가 계약의 유불리를 판단해 주지는 않습니다.',
    tip: '중요한 서류는 차분히 읽고, 배우고 싶었던 것을 하나 찾아보세요.',
    topic: 'total', topicLabel: '오늘의 나 총평',
    summary3: ['오늘 살필 주제는 배움과 조언', '공부하거나 문서를 차분히 읽어보기', '필요한 조언이 있다면 질문해 보기'],
    dos: ['중요한 서류는 내용부터 차분히 확인하기', '배우고 싶었던 것 하나 찾아보거나 시작하기'],
    donts: ['조언을 귀담아듣지 않고 혼자 결정하기'],
    questAction: '오늘 존경하는 사람이나 어른에게 안부를 물어보세요'
  }
};

function scoreTierNote(score) {
  if (score >= 75) return '오늘 간지와 용신 오행의 관계가 비교적 높은 참고 지수로 나타났어요.';
  if (score >= 50) return '오늘 간지와 용신 오행의 관계가 중간 정도의 참고 지수로 나타났어요.';
  return '오늘 간지와 용신 오행의 관계가 낮은 참고 지수로 나타났어요.';
}

// 점수(오늘 간지가 용신과 얼마나 맞는지)를 날씨로 은유 — 날씨는 대표적인 "쉬운 비유"라
// 명리학 지식 없이도 직관적으로 오늘의 흐름을 이해할 수 있게 해준다.
const WEATHER_TIERS = [
  { min: 75, icon: '☀️', label: '맑음', note: '오늘의 참고 지수를 날씨로 표현한 비유입니다. 실제 사건을 예측하지 않습니다.' },
  { min: 55, icon: '🌤️', label: '구름 조금', note: '오늘의 참고 지수를 날씨로 표현한 비유입니다. 실제 날씨나 사건과는 무관합니다.' },
  { min: 35, icon: '☁️', label: '흐림', note: '오늘의 참고 지수를 날씨로 표현한 비유입니다. 중요한 결정을 미룰 근거는 아닙니다.' },
  { min: 0, icon: '🌧️', label: '비', note: '오늘의 참고 지수를 날씨로 표현한 비유입니다. 나쁜 일이 생긴다는 뜻은 아닙니다.' }
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
/* 업셀 추천은 그날 실제로 나온 주제(topic)를 따라간다.
   예전에는 후보 6개 중 무작위로 골랐는데, 그러면 "오늘은 직업·적성 쪽으로 기운이
   기울어 있다"고 읽어준 다음 엉뚱하게 이사 리포트를 권하게 된다. 읽은 내용과 권하는
   상품이 어긋나면 추천이 아니라 광고로 읽힌다(2026-09).
   topic은 오늘 십성 그룹에서 나온 계산값이라, 날짜가 바뀌면 추천도 같이 바뀐다. */
const TOPIC_UPSELL = {
  relationship: { label: '사람 사이가 신경 쓰인다면', name: '대인관계·인복', href: '/quick.html?topic=relationship', price: '3,900원' },
  career: { label: '일의 방향이 궁금하다면', name: '직업·적성운', href: '/quick.html?topic=career', price: '3,900원' },
  wealth: { label: '돈 흐름이 궁금하다면', name: '재물운', href: '/quick.html?topic=wealth', price: '3,900원' },
  total: { label: '내 사주가 처음이라면', name: '내 사주 첫 풀이', href: '/quick.html?topic=intro', price: '3,900원' }
};
const FALLBACK_UPSELL = { label: '내 인생 전체가 궁금하다면', name: '평생사주 100p', href: '/lifetime-report.html', price: '14,900원' };

function upsellFor(topic) {
  return TOPIC_UPSELL[topic] || FALLBACK_UPSELL;
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
    city: birth.city || null, lonOff: !!birth.noLonCorrection
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
    upsell: upsellFor(content.topic)
  };
}

/* 7일 흐름 — 오늘부터 일주일치 점수만 뽑는다. 같은 계산을 날짜만 바꿔 7번 돌리는 것이라
   지어내는 값이 없고, 오늘의 운세와 숫자가 어긋날 일도 없다.
   무료로 주는 건 점수와 "참고 지수가 가장 높은 날"까지. 날짜별 해설 전체는 그날그날 들어와서
   보게 두는 편이 재방문 이유가 된다. */
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
function getWeekFortune(birth, now = new Date()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const f = getTodayFortune(birth, d);
    days.push({
      offset: i,
      date: f.date,
      weekday: WEEKDAY_KO[d.getDay()],
      score: f.score,
      title: f.title
    });
  }
  const best = days.reduce((a, b) => (b.score > a.score ? b : a), days[0]);
  return { days, bestOffset: best.offset };
}

module.exports = { getTodayFortune, getWeekFortune, OHAENG_COLOR, OHAENG_DIRECTION_ACTION, OHAENG_TASTE };
