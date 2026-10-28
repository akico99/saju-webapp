'use strict';
/* 연애 시기 리포트의 엔진 계산 — 무료 사주 분석과 유료 본문이 같은 숫자를 쓴다.

   - buildLoveTiming: 이번 달(KST)부터 12개월 연애 점수(monthlyFlow topic 'love', 성별 반영),
     그중 상위 세 달, 3개월씩 묶은 네 칸, 인연 신호가 강한 달 수.
   - buildLovePreview: 무료 사주 분석. 사주표·오행·타고난 매력과 계절 단위 흐름, 그리고 상위 세 달 중
     3위 달 하나(연·월과 그달의 성격)만 담는다. 1·2위 달과 달별 점수는 유료 상품의 핵심이라 응답에
     넣지 않는다(넣으면 개발자 도구로 바로 보인다). */
const { computeSaju } = require('./index');
const { monthlyFlow } = require('./monthlyFlow');
const { readBalance, readCharm } = require('./freeReadings');
const { describeThird } = require('./monthPlain');
const loveTimingConfig = require('../config/loveTiming');
const { Lunar } = require('lunar-javascript');

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

/* 유료 12개월의 시작 달. 무료 사주 분석에서 받은 startYm("2026-11")을 다시 보내면 그 달로 고정한다 —
   15일에 미리보고 16일에 결제해도 무료에서 본 흐름과 같은 12개월을 받게 하려는 것이다. 허용하는 값은
   지금 기준 시작 달과 그 직전 달 둘뿐이고, 나머지는 무시한다(임의의 과거·미래 창을 받지 않는다). */
function resolveStart(now, startYm) {
  const f = firstMonth(now);
  const m = typeof startYm === 'string' ? /^(\d{4})-(\d{1,2})$/.exec(startYm) : null;
  if (!m) return f;
  const want = { year: Number(m[1]), month: Number(m[2]) };
  const prev = f.month === 1 ? { year: f.year - 1, month: 12 } : { year: f.year, month: f.month - 1 };
  return [f, prev].some((a) => a.year === want.year && a.month === want.month) ? want : f;
}

function rangeLabel(a, b) {
  return a.year === b.year ? `${a.year}년 ${a.month}~${b.month}월` : `${a.year}년 ${a.month}월~${b.year}년 ${b.month}월`;
}

function levelOf(avg) {
  if (avg >= STRONG) return '강함';
  if (avg >= 45) return '보통';
  return '잔잔함';
}

function buildLoveTiming(engine, gender, now = new Date(), opts = {}) {
  const { year, month } = resolveStart(now, opts.startYm);
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
  // Object.hasOwn — '__proto__'·'toString' 같은 기본 속성 이름이 상황으로 통과하지 않게 한다.
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(SITUATIONS, key)) throw new Error('지금 연애 상황을 골라 주세요.');
  return SITUATIONS[key];
}

/* 서버 쪽 입력 검사 — 엔진은 13월·2월 31일·25시를 다음 달·날로 굴려 계산해 버린다. 그대로 두면
   "2월 30일"을 넣은 사람이 3월 2일 사주로 리포트를 받는다. 정수·범위·실제로 있는 날짜(음력은 윤달
   포함)를 확인하고 한국어로 알려 준다. */
function validateBirth(b, now = new Date()) {
  const isInt = (v) => Number.isInteger(v);
  const today = seoulYearMonth(now);
  const thisYear = today.year;
  const { year, month, day, hour, minute } = b;
  if (!isInt(year) || year < 1900 || year > thisYear) throw new Error('태어난 해를 다시 확인해 주세요.');
  if (!isInt(month) || month < 1 || month > 12 || !isInt(day) || day < 1 || day > 31) throw new Error('태어난 날짜를 다시 확인해 주세요.');
  let solar = { year, month, day };
  if (b.isLunar) {
    try {
      const s = Lunar.fromYmd(year, b.isLeap ? -month : month, day).getSolar();
      solar = { year: s.getYear(), month: s.getMonth(), day: s.getDay() };
    } catch (e) {
      throw new Error('음력 날짜를 다시 확인해 주세요. 그해에 없는 날짜이거나 윤달이 없는 달이에요.');
    }
  } else {
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw new Error('태어난 날짜를 다시 확인해 주세요. 그 달에 없는 날이에요.');
  }
  const key = (x) => x.year * 10000 + x.month * 100 + x.day;
  if (key(solar) > key(today)) throw new Error('아직 오지 않은 날짜예요. 생년월일을 다시 확인해 주세요.');
  if (hour != null && (!isInt(hour) || hour < 0 || hour > 23)) throw new Error('태어난 시각은 0~23시로 적어 주세요.');
  if (!isInt(minute) || minute < 0 || minute > 59) throw new Error('태어난 분은 0~59분으로 적어 주세요.');
}

function lockedTitles(situation) {
  return [
    '인연 신호가 가장 강한 두 달과 세 달의 할 일',
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
  validateBirth(birth);
  const engine = computeSaju(birth);
  const balance = readBalance(engine);
  const charm = readCharm(engine);
  const timing = buildLoveTiming(engine, birth.gender, now);
  const best = timing.seasons.reduce((a, s) => (s.avg > a.avg ? s : a), timing.seasons[0]);
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
    // 계절 평균 1위 칸과 월별 1위 달은 자주 다르다. 1위 달이 그 칸 안에 있다고 약속하지 않고, 어느
    // 경우든 같은 문장을 써서 1위 달의 위치도 흘리지 않는다.
    seasonLead: `계절로 묶어 보면 ${best.label}의 흐름이 가장 고르게 좋아요. 인연 신호가 가장 강한 한 달은 이 계절 밖에 있을 수도 있어서, 1·2위 두 달은 전체 풀이에서 알려 드려요.`,
    // 상위 세 달 중 3위만 공개한다. 1·2위의 연·월·점수는 싣지 않는다.
    third: describeThird(timing.top3[2], birth.gender, 'love'),
    startYm: `${timing.months[0].year}-${timing.months[0].month}`,
    strongCount: timing.strongCount,
    note: charm.note,
    locked: lockedTitles(situation),
    price: loveTimingConfig.priceKrw
  };
}

module.exports = { SITUATIONS, STRONG, buildLoveTiming, buildLovePreview, situationOf, seoulYearMonth, levelOf, validateBirth };
