'use strict';
/* 무료 사주 분석에서 공개하는 "세 번째로 좋은 달"의 성격을 쉬운 말로 옮긴다.

   근거는 monthlyFlow가 정한 그 달의 십신 묶음(stemGroup·branchGroup)뿐이다. 1·2위 달은 유료의 핵심이라
   이 모듈은 3위 한 달만 받는다(호출하는 쪽이 top3[2]만 넘긴다). 점수 숫자는 문장에 넣지 않는다. */

const { SHIPSIN_GROUP } = require('./constants');

const loveStarOf = (gender) => (gender === '남' ? '재성' : gender === '여' ? '관성' : null);

/* 그 달에 들어오는 기운의 이름 — 모두 "기운"으로 끝나 조사(이/과)를 고정할 수 있다. */
function groupName(group, gender, kind) {
  if (kind !== 'year' && group === loveStarOf(gender)) return '연인을 뜻하는 기운';
  return {
    비겁: '나와 같은 편의 기운',
    식상: '표현하고 드러내는 기운',
    재성: '재물과 현실 감각의 기운',
    관성: '규칙과 책임의 기운',
    인성: '배움과 보살핌의 기운'
  }[group] || '고른 기운';
}

const LOVE_LINE = {
  star: '새 사람이 눈에 들어오거나 지금 관계가 한 걸음 가까워지기 쉬운 때예요. 마음이 가는 사람이 있다면 약속을 먼저 잡아 보기 좋아요.',
  식상: '마음을 말이나 행동으로 꺼내기 쉬운 때예요. 먼저 연락하거나 나를 보여 주는 자리에서 매력이 잘 드러나요.',
  비겁: '친구나 모임을 통해 사람을 만나기 쉬운 때예요. 다만 자존심이 앞서기 쉬우니 한 걸음 물러서 듣는 여유가 도움이 돼요.',
  인성: '서두르기보다 상대를 천천히 알아 가기 좋은 때예요. 대화가 깊어지는 자리에서 마음이 열리기 쉬워요.',
  재성: '관계에서도 생활과 계획을 함께 맞춰 보기 좋은 때예요. 함께할 구체적인 일정을 세우면 마음이 더 단단해져요.',
  관성: '약속을 지키고 믿음을 쌓는 모습이 매력으로 보이는 때예요. 꾸준한 연락이 관계를 받쳐 줘요.'
};
const YEAR_LINE = {
  비겁: '동료와 힘을 모으거나 혼자 밀고 나가는 일에 힘이 실리는 때예요. 미뤄 둔 일을 직접 시작해 보기 좋아요.',
  식상: '아이디어를 꺼내고 결과물을 내보이기 좋은 때예요. 준비한 것을 발표하거나 새로 만들어 보는 일이 잘 풀리기 쉬워요.',
  재성: '돈과 거래, 구체적인 결과를 챙기기 좋은 때예요. 지출과 저축 계획을 다시 세워 보면 도움이 돼요.',
  관성: '일에서 평가를 받거나 자리를 다지기 좋은 때예요. 맡은 일을 꼼꼼히 마무리하는 모습이 눈에 띄기 쉬워요.',
  인성: '공부·자격·문서 일을 진행하거나 윗사람의 도움을 받기 좋은 때예요. 배우고 싶던 것을 시작하기에 알맞아요.'
};
const PAIR_LINE = {
  star: '관계에 대한 마음이 또렷해지기 쉬운 때예요.',
  식상: '마음을 말로 꺼내기 쉬운 때예요.',
  비겁: '자존심이 부딪히기 쉬워 서로 한발씩 물러서 듣는 태도가 중요해지는 때예요.',
  인성: '관계를 차분히 돌아보기 좋은 때예요.',
  재성: '생활과 계획을 현실적으로 맞춰 보기 좋은 때예요.',
  관성: '약속과 믿음을 다지기 좋은 때예요.'
};

/* 재회·궁합의 a·b 행에는 십신 이름만 있다. 묶음이 없으면 십신으로 채운다. */
const groupsOf = (m) => [m.stemGroup || SHIPSIN_GROUP[m.stemShipsin], m.branchGroup || SHIPSIN_GROUP[m.branchShipsin]].filter(Boolean);

/* 그 달의 대표 묶음 — 주제에 유리한 묶음(연애면 연인을 뜻하는 기운·표현의 기운)을 먼저 고른다. */
function mainGroup(m, gender, kind) {
  const gs = groupsOf(m);
  if (kind !== 'year') {
    const star = loveStarOf(gender);
    if (star && gs.includes(star)) return 'star';
    if (gs.includes('식상')) return '식상';
  }
  return gs[0] || null;
}

/* 대표 묶음 하나의 이름. 두 사람 문장에서는 "나와 같은 편" 대신 누구에게나 읽히는 이름을 쓴다. */
const PAIR_NAME = { 비겁: '자존심과 독립의 기운', 인성: '생각하고 품는 기운' };
function mainName(m, gender, kind, pair) {
  const g = mainGroup(m, gender, kind);
  if (!g) return '고른 기운';
  if (g === 'star') return '연인을 뜻하는 기운';
  return (pair && PAIR_NAME[g]) || groupName(g, gender, kind);
}

const monthLabel = (m) => m.year + '년 ' + m.month + '월';

/** 한 사람(연애·신년운세). m: monthlyFlow 행. kind: 'love' | 'year'. */
function describeThird(m, gender, kind) {
  const g = mainGroup(m, gender, kind);
  const table = kind === 'year' ? YEAR_LINE : LOVE_LINE;
  const line = table[g] || (kind === 'year' ? '큰 쏠림 없이 고르게 흐르는 때예요. 하던 일을 꾸준히 이어 가기 좋아요.' : '큰 쏠림 없이 잔잔하게 흐르는 때예요. 편한 자리에서 자연스럽게 사람을 만나 보세요.');
  return { label: monthLabel(m), text: '이달에는 ' + mainName(m, gender, kind) + '이 들어와요. ' + line };
}

/** 두 사람(재회·궁합). m: { year, month, a: {stemGroup...}, b: {...} } — a·b에 묶음이 없으면 십신으로 채운다. */
function describeThirdPair(m, genderA, genderB, opts = {}) {
  const lineA = PAIR_LINE[mainGroup(m.a, genderA, 'love')] || '';
  const who = opts.them || '그 사람';
  const nameA = mainName(m.a, genderA, 'love', true), nameB = mainName(m.b, genderB, 'love', true);
  let text = '두 사람 모두에게 관계의 기운이 움직이는 달이에요. ' + (nameA === nameB
    ? '나와 ' + who + ' 모두에게 ' + nameA + '이 들어와요.'
    : '나에게는 ' + nameA + '이, ' + who + '에게는 ' + nameB + '이 들어와요.');
  if (lineA) text += ' 내 쪽에서 보면 ' + lineA;
  if (opts.boundary) text += ' 연락할 때라기보다 내 마음을 정리하는 달로 읽어 주세요.';
  return { label: monthLabel(m), text };
}

module.exports = { describeThird, describeThirdPair, groupName, monthLabel };

