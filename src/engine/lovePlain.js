'use strict';
/* 연애 무료 결과를 일반인이 읽을 수 있는 말로 옮기는 매핑표. 명리 용어(일간·십성·신살·오행 글자 수 등)는
   여기 출력에 없다. 원래 값(사주표·오행 글자 수·신살 원문)은 응답의 기존 필드에 그대로 남아 있고, 화면은
   맨 아래 '사주 원본 보기'(접힘)에서만 보여 준다. 다른 상품이 쓰는 freeReadings·monthPlain은 바꾸지 않는다.

   순서: 생활에서 생기는 일 -> 그래서 해볼 일 -> (짧게) 사주에서 그렇게 보는 이유. */
const { SHIPSIN_GROUP } = require('./constants');

// 신살 이름 -> 쉬운 제목 / 연애에서 보이는 모습 / 조심할 점
const CHARM_PLAIN = {
  '도화살': {
    title: '눈길이 먼저 가는 사람',
    shows: '특별히 애쓰지 않아도 관심이 모이고, 첫인상이 오래 남아요.',
    caution: '관심이 많이 오는 만큼 가벼운 호감과 진짜 인연을 구분해야 해요.'
  },
  '장성살': {
    title: '앞에 서면 빛나는 사람',
    shows: '앞에 서서 방향을 정할 때 매력이 살아나요. 결단력 있는 모습에 끌리는 사람이 다가와요.',
    caution: '늘 이끌려고 하면 상대가 지쳐요. 가끔은 따라가 주는 모습이 더 매력적이에요.'
  },
  '반안살': {
    title: '품위 있어 보이는 사람',
    shows: '함께 있으면 나도 대접받는 느낌이 들어서 곁에 두고 싶어져요.',
    caution: '거리감 있어 보일 수 있어요. 먼저 한마디 건네면 훨씬 가까워 보여요.'
  },
  '화개살': {
    title: '알수록 깊어지는 사람',
    shows: '처음엔 조용해 보여도 오래 알수록 좋아지는 사람이에요.',
    caution: '혼자만의 시간을 너무 지키면 다가올 틈이 없어져요.'
  },
  '역마살': {
    title: '새로운 곳에서 인연이 생기는 사람',
    shows: '활동적이고 어디든 가는 자유로움이 매력이에요. 새로운 곳에서 만난 인연이 많아요.',
    caution: '한곳에 머물지 않으면 관계가 깊어지기 전에 지나가기 쉬워요.'
  }
};

const hasBatchim = (word) => { const c = word.charCodeAt(word.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0; };
const eunneun = (w) => w + (hasBatchim(w) ? '은' : '는');

function charmPlain(charm) {
  const found = Array.isArray(charm && charm.found) ? charm.found : [];
  const items = found.map((f) => CHARM_PLAIN[f.name]).filter(Boolean).slice(0, 3);
  return {
    headline: items.length ? '눈에 띄는 매력이 ' + items.length + '가지 보여요' : '꾸미지 않을 때 가장 잘 보이는 매력이에요',
    items
  };
}

// 오행이 많은 쪽 -> 연애 습관 / 없는 쪽 -> 의식해서 챙길 점. 한자·오행 이름은 쓰지 않는다.
const HABIT_STRONG = {
  '木': { short: '새로 시작하는 힘이 센 편', line: '설레는 시작은 빠른 편이에요. 이어 가는 일은 의식해서 챙겨야 관계가 오래가요.' },
  '火': { short: '마음이 빨리 뜨거워지는 편', line: '좋아하면 표현이 솔직하고 마음이 빨리 달아올라요. 감정이 앞서 말이 먼저 나가는 일만 조심하면 돼요.' },
  '土': { short: '한번 마음을 주면 오래 지키는 편', line: '믿을 만하다는 말을 자주 들어요. 놓아야 할 관계를 붙들고 있지 않은지 가끔 돌아봐요.' },
  '金': { short: '좋고 싫음이 분명한 편', line: '선을 잘 긋고 결정이 빨라요. 옳은 말도 상처가 될 수 있으니 말투를 한 번 다듬어 봐요.' },
  '水': { short: '상대 마음을 잘 읽는 편', line: '눈치가 빠르고 분위기를 잘 읽어요. 생각만 깊어지고 행동이 늦어질 때는 먼저 한 걸음 움직여 봐요.' }
};
const HABIT_LACK = {
  '木': { short: '먼저 만남을 만드는 일', line: '새로운 만남을 먼저 만들기보다 기다리는 편이에요. 작은 모임에 한 번 나가 보는 것부터 해 봐요.' },
  '火': { short: '마음을 말로 꺼내는 일', line: '마음을 말로 꺼내는 일은 조금 어려운 편이에요. 좋은 건 좋다고 짧게라도 말해 봐요.' },
  '土': { short: '오래 지키는 힘', line: '약속과 연락의 리듬이 흐트러지기 쉬워요. 만나는 요일이나 연락 시간을 정해 두면 도움이 돼요.' },
  '金': { short: '선을 긋는 일', line: '불편한 말을 미루다 관계가 흐려지기 쉬워요. 싫은 건 작게라도 바로 말해 봐요.' },
  '水': { short: '상대 속마음을 읽는 일', line: '상대의 속마음을 읽는 데 시간이 걸릴 수 있어요. 궁금하면 짐작하지 말고 직접 물어봐요.' }
};

function habitPlain(balance) {
  const b = balance || {};
  const strong = (Array.isArray(b.strongestAll) && b.strongestAll[0]) || b.strongest || null;
  const lacking = Array.isArray(b.lacking) ? b.lacking : [];
  const s = strong && HABIT_STRONG[strong.el];
  const l = lacking.length ? HABIT_LACK[lacking[0].el] : null;
  let headline;
  if (s && l) headline = s.short + ' 대신, ' + eunneun(l.short) + ' 의식해서 챙겨야 해요';
  else if (l) headline = eunneun(l.short) + ' 의식해서 챙겨야 해요';
  else if (s && Array.isArray(b.bars) && b.bars.length && (strong.count - Math.min.apply(null, b.bars.map((x) => x.count))) > 2) headline = s.short + '이에요';
  else headline = '연애 습관이 한쪽으로 치우치지 않고 고른 편이에요';
  const lines = [];
  if (s && (l || (strong.count - Math.min.apply(null, (b.bars || [{ count: 0 }]).map((x) => x.count))) > 2)) lines.push(s.line);
  lacking.slice(0, 2).forEach((x) => { if (HABIT_LACK[x.el]) lines.push(HABIT_LACK[x.el].line); });
  if (!lines.length) lines.push('특별히 한쪽으로 쏠리지 않아서, 상대와 상황에 맞춰 자연스럽게 바꿔 가는 편이에요.');
  return { headline, lines };
}

// 3위 달: 들어오는 기운 이름 대신 그 달에 생활에서 일어나는 일을 말한다.
const MONTH_SCENE = {
  star: { line: '새로운 사람이 눈에 들어오거나 지금 관계가 한 걸음 가까워지기 쉬운 달이에요. 마음 가는 사람이 있다면 먼저 약속을 잡아 보세요.', why: '연애 인연' },
  식상: { line: '마음을 말이나 행동으로 꺼내기 쉬운 달이에요. 먼저 연락하거나 나를 보여 주는 자리에서 매력이 잘 드러나요.', why: '표현' },
  비겁: { line: '친구나 모임을 통해 사람을 만나기 쉬운 달이에요. 자존심이 앞서기 쉬우니 한 걸음 물러서 들어 보세요.', why: '친구·동료' },
  인성: { line: '서두르기보다 상대를 천천히 알아 가기 좋은 달이에요. 대화가 깊어지는 자리에서 마음이 열려요.', why: '차분히 알아 가는' },
  재성: { line: '함께할 일정과 계획을 구체적으로 맞춰 보기 좋은 달이에요. 날짜가 잡히면 마음도 더 단단해져요.', why: '현실적인 계획' },
  관성: { line: '약속을 지키고 믿음을 쌓는 모습이 매력으로 보이는 달이에요. 꾸준한 연락이 관계를 받쳐 줘요.', why: '약속과 책임' }
};
const FLAT_SCENE = { line: '큰 쏠림 없이 잔잔한 달이에요. 편한 자리에서 자연스럽게 사람을 만나 보세요.', why: '' };

function groupsOf(m) {
  return [m.stemGroup || SHIPSIN_GROUP[m.stemShipsin], m.branchGroup || SHIPSIN_GROUP[m.branchShipsin]].filter(Boolean);
}
function sceneOf(m, gender) {
  const gs = groupsOf(m || {});
  const star = gender === '남' ? '재성' : gender === '여' ? '관성' : null;
  if (star && gs.includes(star)) return MONTH_SCENE.star;
  if (gs.includes('식상')) return MONTH_SCENE.식상;
  return MONTH_SCENE[gs[0]] || FLAT_SCENE;
}
function describeThirdPlain(m, gender) {
  const sc = sceneOf(m, gender);
  const text = sc.line + (sc.why ? ' 사주에서는 이 달에 ' + sc.why + ' 흐름이 겹쳐서 이렇게 봐요.' : '');
  return { label: m.year + '년 ' + m.month + '월', text };
}

// 상황별 유료 장 제목과 한 줄 설명(잠금 카드용).
const SITUATION_PLAIN = {
  single: { title: '솔로인 지금 할 일', line: '새 인연을 만나려면 어디서 무엇부터 해야 하는지, 지금 할 수 있는 일을 알려 드려요.', rows: ['새 인연이 생길 자리', '먼저 해볼 일', '조심할 점'] },
  some: { title: '썸을 연애로 바꾸려면', line: '썸이 흐지부지되지 않고 연애로 이어지려면 언제 어떻게 움직일지 순서대로 알려 드려요.', rows: ['먼저 다가갈 시기', '마음을 꺼내는 방법', '흐지부지 막는 법'] },
  dating: { title: '지금 관계를 깊게 하려면', line: '지금 만나는 사람과 더 가까워지려면 무엇을 바꾸고 언제 움직일지 알려 드려요.', rows: ['더 가까워지는 방법', '부딪히기 쉬운 점', '함께 해볼 일'] },
  breakup: { title: '이별 뒤 지금 할 일', line: '마음을 정리하고 다음 인연을 준비하려면 지금 무엇부터 하면 되는지 알려 드려요.', rows: ['마음 정리 순서', '다시 시작할 시기', '조심할 점'] }
};
function situationPlain(key) { return SITUATION_PLAIN[key] || null; }

function buildPlain(parts, situationKey) {
  return { charm: charmPlain(parts.charm), habit: habitPlain(parts.balance), situation: situationPlain(situationKey) };
}

module.exports = { CHARM_PLAIN, HABIT_STRONG, HABIT_LACK, MONTH_SCENE, SITUATION_PLAIN, charmPlain, habitPlain, describeThirdPlain, situationPlain, buildPlain };
