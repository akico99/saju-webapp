'use strict';
/* 연애 시기 리포트의 엔진 계산 — 무료 첫 장과 유료 본문이 같은 숫자를 쓴다.

   - buildLoveTiming: 이번 달(KST)부터 12개월 연애 점수(monthlyFlow topic 'love', 성별 반영),
     그중 상위 세 달, 3개월씩 묶은 네 칸, 인연 신호가 강한 달 수.
   - buildLovePreview: 무료 첫 장. 사주표·오행·타고난 매력과 계절 단위 흐름만 담는다.
     어느 달이 가장 강한지는 유료 상품의 핵심이라 달별 점수·달 이름은 응답에 넣지 않는다
     (넣으면 개발자 도구로 바로 보인다). */
const { computeSaju } = require('./index');
const { monthlyFlow } = require('./monthlyFlow');
const { readBalance, readCharm } = require('./freeReadings');
const loveTimingConfig = require('../config/loveTiming');

const SITUATIONS = {
  single: { label: '솔로', actionTitle: '솔로인 지금 할 일', focus: '새 인연이 시작되는 때' },
  some: { label: '썸', actionTitle: '썸을 연애로 바꾸려면', focus: '썸이 연애로 넘어가는 때' },
  dating: { label: '연애 중', actionTitle: '지금 관계를 깊게 하려면', focus: '지금 관계가 깊어지는 때' },
  breakup: { label: '이별 후', actionTitle: '이별 뒤 지금 할 일', focus: '마음을 정리하고 새 흐름을 맞는 때' }
};

// 이 점수 이상인 달을 "인연 신호가 강한 달"로 센다(deepReading.tier의 '순조로운 시기' 경계와 같다).
const STRONG = 65;

function seoulYearMonth(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const pick = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/* 12개월의 첫 달. 달의 절반이 지났으면 다음 달부터 센다 — "가장 강한 달은 이번 달"이라는 답이
   남은 열흘짜리 달을 가리키면 산 사람이 쓸 수 없다. */
function firstMonth(now) {
  const { year, month, day } = seoulYearMonth(now);
  if (day <= 15) return { year, month };
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function rangeLabel(a, b) {
  return a.year === b.year ? `${a.year}년 ${a.month}~${b.month}월` : `${a.year}년 ${a.month}월~${b.year}년 ${b.month}월`;
}

function levelOf(avg) {
  if (avg >= STRONG) return '강함';
  if (avg >= 45) return '보통';
  return '잔잔함';
}

function buildLoveTiming(engine, gender, now = new Date()) {
  const { year, month } = firstMonth(now);
  const months = monthlyFlow(engine, { fromYear: year, fromMonth: month, count: 12, topic: 'love', gender });
  const top3 = months
    .map((m, index) => ({ ...m, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 3);
  const seasons = [0, 1, 2, 3].map((q) => {
    const part = months.slice(q * 3, q * 3 + 3);
    const avg = Math.round(part.reduce((sum, m) => sum + m.score, 0) / part.length);
    return { label: rangeLabel(part[0], part[part.length - 1]), level: levelOf(avg), avg };
  });
  const strongCount = months.filter((m) => m.score >= STRONG).length;
  return { months, top3, seasons, strongCount };
}

function situationOf(key) {
  const s = SITUATIONS[key];
  if (!s) throw new Error('지금 연애 상황을 골라 주세요.');
  return s;
}

function lockedTitles(situation) {
  return [
    '인연 신호가 가장 강한 세 달과 그때 할 일',
    '나에게 끌리는 사람, 내가 끌리는 사람',
    '만남이 생기기 쉬운 자리',
    '반복되기 쉬운 연애 패턴',
    '조심할 인연의 신호',
    situation.actionTitle,
    '앞으로 12개월, 달마다 한 줄'
  ];
}

function buildLovePreview(birth, situationKey, now = new Date()) {
  const situation = situationOf(situationKey);
  if (birth.gender !== '여' && birth.gender !== '남') throw new Error('성별을 골라 주세요. 연애운 계산에 쓰여요.');
  const engine = computeSaju(birth);
  const balance = readBalance(engine);
  const charm = readCharm(engine);
  const timing = buildLoveTiming(engine, birth.gender, now);
  return {
    situation: { key: situationKey, label: situation.label },
    pillars: charm.pillars,
    balance: { headline: balance.headline, lead: balance.lead, bars: balance.bars },
    charm: {
      headline: charm.headline,
      base: charm.base,
      found: charm.found.map((f) => ({ name: f.name, title: f.title, core: f.core, shadow: f.shadow, pillarKo: f.pillarKo }))
    },
    seasons: timing.seasons,
    strongCount: timing.strongCount,
    note: charm.note,
    locked: lockedTitles(situation),
    price: loveTimingConfig.priceKrw
  };
}

module.exports = { SITUATIONS, STRONG, buildLoveTiming, buildLovePreview, situationOf, seoulYearMonth, levelOf };
