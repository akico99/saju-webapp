'use strict';
/* 「다시, 우리」 엔진 계산 — 무료 첫 장과 유료 본문이 같은 숫자를 쓴다.

   - 두 사람의 관계 구조: engine/compatibility.analyzeCompatibility 그대로(끌림·부딪힘).
   - 12개월 관계 신호: 각자 monthlyFlow(topic 'love', 성별 반영)를 구해 평균한 값. 상위 세 달이 유료의
     "다시 이어질 흐름"이다. 연락하라는 날짜가 아니라 두 사람 모두에게 관계의 기운이 움직이는 달이다.
   - 무료 첫 장에는 달 이름·달별 점수를 넣지 않는다(개발자 도구로 바로 보인다). 계절 네 칸만 준다.

   안전: 상대가 차단했거나(contact=blocked) 그 사람이 먼저 이별을 말했으면(initiator=them) "경계 존중 모드"다.
   이때 본문은 연락을 권하지 않고 회복 중심으로 쓴다(llm/reunionReading.js). */
const { computeSaju } = require('./index');
const { monthlyFlow } = require('./monthlyFlow');
const { analyzeCompatibility } = require('./compatibility');
const { readBalance, readCharm, pillarsOf } = require('./freeReadings');
const { validateBirth, seoulYearMonth } = require('./loveTiming');
const reunionConfig = require('../config/reunion');

const SINCE = {
  m1: { label: '1개월 이내' },
  m6: { label: '1~6개월' },
  y1: { label: '6개월~1년' },
  y1plus: { label: '1년 이상' }
};
const INITIATOR = {
  me: { label: '내가 먼저' },
  them: { label: '그 사람이 먼저' },
  mutual: { label: '서로' }
};
const CONTACT = {
  sometimes: { label: '가끔 연락해요' },
  cut: { label: '연락이 끊겼어요' },
  blocked: { label: '차단됐어요' }
};

const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
function pickKey(table, key, message) {
  if (!own(table, key)) throw new Error(message);
  return key;
}
function validateStory(story) {
  story = story || {};
  return {
    since: pickKey(SINCE, story.since, '헤어진 지 얼마나 됐는지 골라 주세요.'),
    initiator: pickKey(INITIATOR, story.initiator, '누가 먼저 이별을 말했는지 골라 주세요.'),
    contact: pickKey(CONTACT, story.contact, '지금 연락 상태를 골라 주세요.')
  };
}
/* 경계 존중 모드 — 차단됐거나 상대가 먼저 거리를 원했다. 연락 권유를 하지 않는다. */
const boundaryMode = (story) => story.contact === 'blocked' || story.initiator === 'them';

const STRONG = 65;
function levelOf(avg) {
  if (avg >= STRONG) return '강함';
  if (avg >= 45) return '보통';
  return '잔잔함';
}
function firstMonth(now) {
  const { year, month, day } = seoulYearMonth(now);
  if (day <= 15) return { year, month };
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
// 무료에서 본 12개월과 같은 창을 쓰게 한다. 지금 시작 달과 그 직전 달만 허용한다.
function resolveStart(now, startYm) {
  const f = firstMonth(now);
  const m = typeof startYm === 'string' ? /^(\d{4})-(\d{1,2})$/.exec(startYm) : null;
  if (!m) return f;
  const want = { year: Number(m[1]), month: Number(m[2]) };
  const prev = f.month === 1 ? { year: f.year - 1, month: 12 } : { year: f.year, month: f.month - 1 };
  return [f, prev].some((a) => a.year === want.year && a.month === want.month) ? want : f;
}
function rangeLabel(a, b) {
  return a.year === b.year ? a.year + '년 ' + a.month + '~' + b.month + '월' : a.year + '년 ' + a.month + '월~' + b.year + '년 ' + b.month + '월';
}

/** 두 사람의 12개월 관계 신호. months[i] = { year, month, score(두 사람 평균), a, b } */
function buildReunionTiming(engineA, engineB, now = new Date(), opts = {}) {
  const { year, month } = resolveStart(now, opts.startYm);
  const gA = engineA.meta.input.gender, gB = engineB.meta.input.gender;
  const rowsA = monthlyFlow(engineA, { fromYear: year, fromMonth: month, count: 12, topic: 'love', gender: gA });
  const rowsB = monthlyFlow(engineB, { fromYear: year, fromMonth: month, count: 12, topic: 'love', gender: gB });
  const months = rowsA.map((a, i) => {
    const b = rowsB[i];
    return {
      year: a.year, month: a.month, score: Math.round((a.score + b.score) / 2),
      a: { score: a.score, stemShipsin: a.stemShipsin, branchShipsin: a.branchShipsin },
      b: { score: b.score, stemShipsin: b.stemShipsin, branchShipsin: b.branchShipsin }
    };
  });
  const top3 = months.map((m, index) => ({ ...m, index }))
    .sort((x, y) => y.score - x.score || x.index - y.index)
    .slice(0, 3);
  const seasons = [0, 1, 2, 3].map((q) => {
    const part = months.slice(q * 3, q * 3 + 3);
    const avg = Math.round(part.reduce((s, m) => s + m.score, 0) / part.length);
    return { label: rangeLabel(part[0], part[part.length - 1]), level: levelOf(avg), avg };
  });
  return { months, top3, seasons, strongCount: months.filter((m) => m.score >= STRONG).length };
}

/* ---------- 관계 구조를 쉬운 말로 ---------- */
const PILLAR_PLAIN = { year: '어린 시절·집안 자리', month: '사회·일 자리', day: '배우자 자리', hour: '말년·속마음 자리' };
const GROUP_OF = { 비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성', 정재: '재성', 편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성' };
// "상대가 나에게 어떤 기운으로 다가오는가" — 일간끼리의 십신을 관계의 말로 옮긴다.
const RELATION_PLAIN = {
  비겁: '친구처럼 대등하게 맞서는 기운',
  식상: '내가 표현하고 챙겨 주게 되는 기운',
  재성: '내가 붙잡고 책임지려 하는 기운',
  관성: '나를 긴장시키고 다잡게 하는 기운',
  인성: '나를 품고 받쳐 주는 기운'
};
const relationPlain = (ko) => RELATION_PLAIN[GROUP_OF[ko]] || '뚜렷한 방향이 없는 기운';
const OHAENG_PLAIN = { 木: '나무(木)', 火: '불(火)', 土: '흙(土)', 金: '쇠(金)', 水: '물(水)' };
const OHAENG_ORDER = ['木', '火', '土', '金', '水'];

function hourKnown(engine) { return pillarsOf(engine).length === 4; }

/* 시각을 모르는 사람의 시주는 정오 가정이라 근거로 쓰지 않는다. 그 기둥이 걸린 교차 관계를 뺀다. */
function compatOf(engineA, engineB) {
  const c = analyzeCompatibility(engineA, engineB);
  const okA = hourKnown(engineA), okB = hourKnown(engineB);
  const keep = (e) => (okA || e.pillarA !== 'hour') && (okB || e.pillarB !== 'hour');
  return { ...c, crossYukhap: c.crossYukhap.filter(keep), crossChung: c.crossChung.filter(keep), crossSamhap: c.crossSamhap.filter(keep) };
}

/** 끌림·부딪힘을 사람이 읽는 문장 목록으로. 무료 첫 장과 유료 프롬프트가 같은 문장을 쓴다. */
function describeBond(engineA, engineB) {
  const c = compatOf(engineA, engineB);
  const attraction = [], friction = [];
  const notDay = (x) => !(x.pillarA === 'day' && x.pillarB === 'day');
  const pair = (e) => '나의 ' + PILLAR_PLAIN[e.pillarA] + '와 그 사람의 ' + PILLAR_PLAIN[e.pillarB];
  if (c.dayRelation && (c.dayRelation.type === 'yukhap' || c.dayRelation.type === 'samhap')) attraction.push('두 사람의 배우자 자리가 서로를 끌어당기는 관계예요. 처음 가까워질 때 설명하기 어려운 편안함이 생기기 쉬운 구조예요.');
  if (c.dayRelation && c.dayRelation.type === 'chung') friction.push('두 사람의 배우자 자리가 서로 부딪히는 관계예요. 가까워질수록 생활 방식과 속도 차이가 크게 느껴지기 쉬운 구조예요.');
  for (const e of c.crossYukhap.filter(notDay).slice(0, 2)) attraction.push(pair(e) + '가 서로 끌어당겨요.');
  for (const e of c.crossSamhap.filter(notDay).slice(0, 1)) attraction.push(pair(e) + '가 같은 방향으로 모이는 기운이에요.');
  for (const e of c.crossChung.filter(notDay).slice(0, 2)) friction.push(pair(e) + '가 서로 부딪혀요.');
  const toMe = c.shipsinAtoBKo ? relationPlain(c.shipsinAtoBKo) : null;
  const toThem = c.shipsinBtoAKo ? relationPlain(c.shipsinBtoAKo) : null;
  // 오행 보완: 내게 없는(0개) 기운을 그 사람이 넉넉히 가졌는지, 그 반대인지.
  const ohA = engineA.counts.ohaeng, ohB = engineB.counts.ohaeng;
  const fillsMe = OHAENG_ORDER.filter((o) => !ohA[o] && ohB[o] >= 2).map((o) => OHAENG_PLAIN[o]);
  const fillsThem = OHAENG_ORDER.filter((o) => !ohB[o] && ohA[o] >= 2).map((o) => OHAENG_PLAIN[o]);
  if (fillsMe.length) attraction.push('나에게 없는 ' + fillsMe.join('·') + ' 기운을 그 사람이 넉넉히 가졌어요. 곁에 있으면 내 빈자리가 채워지는 느낌을 받기 쉬워요.');
  if (fillsThem.length) attraction.push('그 사람에게 없는 ' + fillsThem.join('·') + ' 기운을 내가 넉넉히 가졌어요.');
  if (!attraction.length) attraction.push('두 사람 사주 사이에 눈에 띄게 끌어당기는 글자는 적어요. 끌림이 사주의 합보다 성격과 시기에서 왔을 가능성이 커요.');
  if (!friction.length) friction.push('두 사람 사주 사이에 정면으로 부딪히는 글자는 눈에 띄지 않아요. 엇갈림은 글자의 충돌보다 표현 방식과 시기 차이에서 왔을 가능성이 커요.');
  return { compat: c, attraction, friction, toMe, toThem, fillsMe, fillsThem };
}

function lockedTitles(boundary) {
  return [
    '한 줄 답과 우리가 끌렸던 이유',
    '엇갈린 지점 — 같은 장면이 반복된 이유',
    '그 사람의 사주 성향(속마음이 아닌 기질)',
    boundary ? '마음의 흐름이 바뀌는 세 달' : '다시 이어질 흐름 — 관계 신호가 강한 세 달',
    boundary ? '지금은 멈춰야 할 이유와 신호' : '다가간다면, 멈춰야 할 신호',
    '나를 위한 회복',
    '앞으로 12개월, 달마다 흐름'
  ];
}

/* 무료 첫 장. 입력 검사(validateBirth)를 여기서도 한다. */
function buildReunionPreview(input, now = new Date()) {
  const story = validateStory(input.story);
  for (const b of [input.me, input.them]) {
    if (b.gender !== '여' && b.gender !== '남') throw new Error('두 사람의 성별을 골라 주세요.');
    validateBirth(b, now);
  }
  const engineA = computeSaju(input.me), engineB = computeSaju(input.them);
  const bond = describeBond(engineA, engineB);
  const timing = buildReunionTiming(engineA, engineB, now);
  const boundary = boundaryMode(story);
  const best = timing.seasons.reduce((a, s) => (s.avg > a.avg ? s : a), timing.seasons[0]);
  const balA = readBalance(engineA), balB = readBalance(engineB);
  return {
    story: { since: SINCE[story.since].label, initiator: INITIATOR[story.initiator].label, contact: CONTACT[story.contact].label, boundary },
    me: { pillars: readCharm(engineA).pillars, ilgan: engineA.ilgan.char + '(' + engineA.ilgan.ko + ')', balance: { headline: balA.headline, bars: balA.bars } },
    them: { pillars: readCharm(engineB).pillars, ilgan: engineB.ilgan.char + '(' + engineB.ilgan.ko + ')', balance: { headline: balB.headline, bars: balB.bars } },
    bond: { attraction: bond.attraction, friction: bond.friction, toMe: bond.toMe, toThem: bond.toThem },
    seasons: timing.seasons,
    seasonLead: '두 사람의 관계 기운을 계절로 묶으면 ' + best.label + '이 가장 고르게 움직여요. 신호가 가장 강한 한 달은 이 계절 밖에 있을 수도 있어서, 정확한 세 달은 전체 풀이에서 알려 드려요.',
    strongCount: timing.strongCount,
    startYm: timing.months[0].year + '-' + timing.months[0].month,
    note: [hourKnown(engineA) ? '' : '내 태어난 시각을 몰라 시주는 근거로 쓰지 않았어요.', hourKnown(engineB) ? '' : '그 사람의 태어난 시각을 몰라 시주는 근거로 쓰지 않았어요.'].filter(Boolean).join(' ') || null,
    safety: boundary
      ? '지금은 상대가 거리를 원한 상황이에요. 이 풀이는 연락을 권하지 않고, 그 경계를 존중하면서 내 마음을 회복하는 쪽으로 읽어 드려요.'
      : '이 풀이는 재회를 약속하지 않아요. 두 사람의 기질과 시기를 읽어, 다가갈지 멈출지를 스스로 정하도록 돕는 참고 자료예요.',
    locked: lockedTitles(boundary),
    price: reunionConfig.priceKrw
  };
}

module.exports = { SINCE, INITIATOR, CONTACT, STRONG, validateStory, boundaryMode, buildReunionTiming, buildReunionPreview, describeBond, relationPlain, levelOf, hourKnown, lockedTitles, PILLAR_PLAIN, OHAENG_PLAIN };
