'use strict';
/* 두 사람의 궁합(compat_v2) — 엔진 계산, 무료 사주 분석, 유료 본문 생성.

   숫자(두 사람 각자의 12개월 연애 점수, 평균, 함께 좋은 세 달, 앞으로 3년)는 엔진이 정하고 AI는 해석만 한다.
   - 12개월: monthlyFlow(topic 'love', 성별 반영)를 두 사람 각자 구해 반올림 평균을 낸다(compatTiming.js와 같은 방식).
   - 3년: llm/compatTiming.buildCompatTiming의 연도별 값을 그대로 쓴다.
   - 두 사람 사이의 구조: engine/compatibility.analyzeCompatibility. 시각을 모르는 사람의 시주(정오 가정)는 근거에서 뺀다.
   연애 리포트(loveTimingReading.js)와 같은 생성 방식이다: 묶음별 생성, 분량 보정 ASK_RATIO, 잘린 응답 재시도, 강조 보정. */
const { BASE_RULES } = require('./baseSystemPrompt');
const { generateText, sumUsage } = require('./client');
const { EVIDENCE_RULE, splitEvidence, startReview } = require('./readingReview');
const { ensureHighlight } = require('./loveTimingReading');
const { buildCompatTiming } = require('./compatTiming');
const { analyzeCompatibility } = require('../engine/compatibility');
const { monthlyFlow } = require('../engine/monthlyFlow');
const { computeSaju } = require('../engine/index');
const { SHIPSIN_GROUP } = require('../engine/constants');
const { readBalance, readCharm, pillarsOf, hasBatchim } = require('../engine/freeReadings');
const { STRONG, levelOf, seoulYearMonth, validateBirth } = require('../engine/loveTiming');
const { describeThirdPair } = require('../engine/monthPlain');
const config = require('../config/compatV2');

const RELATIONS = config.RELATIONS;
function relationOf(key) {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(RELATIONS, key)) throw new Error('두 사람의 관계를 골라 주세요.');
  return RELATIONS[key];
}

/* ---------- 쉬운 말 사전 ---------- */
const OHAENG_PLAIN = { 木: '나무(木)', 火: '불(火)', 土: '흙(土)', 金: '쇠(金)', 水: '물(水)' };
const SAENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const GEUK = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };
const PILLAR_PLAIN = { year: '어린 시절·집안 자리', month: '부모·사회 자리', day: '배우자 자리', hour: '자녀·말년 자리' };
const STRENGTH_PLAIN = { 신강: '스스로의 기운이 센 편', 신약: '스스로의 기운이 여린 편', 중화: '기운이 고르게 맞춰진 편' };
// 일간 상호 십신 — "상대가 나에게 어떤 존재로 다가오는지"
const STAR_PLAIN = {
  비겁: '나란히 서는 친구 같은 존재',
  식상: '내가 표현하고 챙겨 주고 싶어지는 존재',
  재성: '내가 다가가 붙잡고 싶어지는 존재(현실적인 끌림)',
  관성: '나를 다잡아 주고 긴장하게 하는 존재',
  인성: '나를 품어 주고 기대게 하는 존재'
};
function groupPlain(group, gender) {
  if (group === '관성') return gender === '여' ? '연인을 뜻하는 별(규칙과 책임의 기운이기도 함)' : '규칙과 책임의 기운';
  if (group === '재성') return gender === '남' ? '연인을 뜻하는 별(재물의 기운이기도 함)' : '재물과 현실 감각의 기운';
  return { 비겁: '나와 같은 편의 기운', 식상: '표현하고 드러내는 기운', 인성: '배움과 보살핌의 기운' }[group] || '중립적인 기운';
}
const shipsinPlain = (shipsin, gender) => groupPlain(SHIPSIN_GROUP[shipsin], gender);
const starPlain = (shipsinKo) => STAR_PLAIN[SHIPSIN_GROUP[shipsinKo]] || '특별히 기울지 않은 존재';

const lastHangul = (w) => { const t = String(w); for (let i = t.length - 1; i >= 0; i--) { const c = t.charCodeAt(i); if (c >= 0xAC00 && c <= 0xD7A3) return t[i]; } return ''; };
// 받침에 따라 이/가, 은/는, 을/를을 고른다("지우이(가)" 같은 표기를 피한다).
const josa = (w, withBatchim, without) => (w === '나' && without === '가' ? '내가' : w + (hasBatchim(lastHangul(w)) ? withBatchim : without));
const monthLabel = (m) => m.year + '년 ' + m.month + '월';
// 이름은 자유 입력이라 줄바꿈·제어문자·마크다운 기호로 프롬프트 구조를 흉내 낼 수 있다. 글자만 남긴다.
const cleanName = (name) => String(name || '').replace(/[\u0000-\u001f\u007f#*<>\[\]\u0060]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);
const hasHour = (engine) => pillarsOf(engine).includes('hour');
const genderOf = (engine) => (engine.meta && engine.meta.input && engine.meta.input.gender) || null;

/* ---------- 12개월 (두 사람 평균) ---------- */
function firstMonth(now) {
  const { year, month, day } = seoulYearMonth(now);
  if (day <= 15) return { year, month };
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}
// 무료 사주 분석에서 받은 시작 달(startYm)은 지금 기준 시작 달과 그 직전 달만 받는다(연애 리포트와 같다).
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

function buildCoupleTiming(engineA, engineB, now = new Date(), opts = {}) {
  const { year, month } = resolveStart(now, opts.startYm);
  const rowsA = monthlyFlow(engineA, { fromYear: year, fromMonth: month, count: 12, topic: 'love', gender: genderOf(engineA) });
  const rowsB = monthlyFlow(engineB, { fromYear: year, fromMonth: month, count: 12, topic: 'love', gender: genderOf(engineB) });
  const months = rowsA.map((a, i) => {
    const b = rowsB[i];
    return {
      year: a.year, month: a.month, score: Math.round((a.score + b.score) / 2),
      a: { score: a.score, stemShipsin: a.stemShipsin, branchShipsin: a.branchShipsin },
      b: { score: b.score, stemShipsin: b.stemShipsin, branchShipsin: b.branchShipsin }
    };
  });
  const top3 = months.map((m, index) => ({ ...m, index })).sort((x, y) => y.score - x.score || x.index - y.index).slice(0, 3);
  const seasons = [0, 1, 2, 3].map((q) => {
    const part = months.slice(q * 3, q * 3 + 3);
    const avg = Math.round(part.reduce((s, m) => s + m.score, 0) / part.length);
    return { label: rangeLabel(part[0], part[part.length - 1]), level: levelOf(avg), avg };
  });
  const strongCount = months.filter((m) => m.score >= STRONG).length;
  const togetherCount = months.filter((m) => m.a.score >= STRONG && m.b.score >= STRONG).length;
  const years = buildCompatTiming(engineA, engineB, 'dating', now);
  return { months, top3, seasons, strongCount, togetherCount, years };
}

/* ---------- 두 사람 사이의 구조 ---------- */
function relationFacts(engineA, engineB) {
  const compat = analyzeCompatibility(engineA, engineB);
  const hA = hasHour(engineA), hB = hasHour(engineB);
  const valid = (e) => (hA || e.pillarA !== 'hour') && (hB || e.pillarB !== 'hour');
  const pull = compat.crossYukhap.filter(valid).map((e) => ({ ...e, kind: 'yukhap' }))
    .concat(compat.crossSamhap.filter(valid).map((e) => ({ ...e, kind: 'samhap' })));
  const clash = compat.crossChung.filter(valid).map((e) => ({ ...e, kind: 'chung' }));
  const oA = engineA.ilgan.ohaeng, oB = engineB.ilgan.ohaeng;
  let ilganRel = 'same';
  if (oA !== oB) ilganRel = SAENG[oA] === oB ? 'aFeedsB' : SAENG[oB] === oA ? 'bFeedsA' : GEUK[oA] === oB ? 'aChecksB' : 'bChecksA';
  const countsA = {}, countsB = {};
  readBalance(engineA).bars.forEach((b) => { countsA[b.el] = b.count; });
  readBalance(engineB).bars.forEach((b) => { countsB[b.el] = b.count; });
  const yongA = engineA.yongshin.final.main, yongB = engineB.yongshin.final.main;
  const lackA = Object.keys(countsA).filter((k) => countsA[k] === 0);
  const lackB = Object.keys(countsB).filter((k) => countsB[k] === 0);
  return {
    compat, pull, clash, dayRelation: compat.dayRelation, ilganRel,
    starBtoA: compat.shipsinAtoBKo, starAtoB: compat.shipsinBtoAKo,
    complement: {
      countsA, countsB, yongA, yongB,
      aGetsFromB: (countsB[yongA] || 0) >= 2, bGetsFromA: (countsA[yongB] || 0) >= 2,
      lackA, lackB, filledForA: lackA.filter((k) => countsB[k] > 0), filledForB: lackB.filter((k) => countsA[k] > 0)
    }
  };
}

const DAY_REL_PLAIN = {
  yukhap: '두 사람의 배우자 자리가 서로 끌어당기는 관계(합)',
  samhap: '두 사람의 배우자 자리가 같은 방향으로 힘을 모으는 관계(삼합)',
  chung: '두 사람의 배우자 자리가 서로 부딪치는 관계(충) — 자극과 긴장이 함께 있음',
  none: '두 사람의 배우자 자리 사이에 눈에 띄게 당기거나 부딪치는 관계 없음(담백한 사이)'
};
function ilganRelPlain(rel, nameA, nameB) {
  return {
    same: '두 사람의 바탕 성질이 같음(같은 기운끼리 닮은 사이)',
    aFeedsB: nameA + '의 바탕이 ' + nameB + '의 바탕을 살려 주는 관계(상생)',
    bFeedsA: nameB + '의 바탕이 ' + nameA + '의 바탕을 살려 주는 관계(상생)',
    aChecksB: nameA + '의 바탕이 ' + nameB + '의 바탕을 다잡는 관계(상극 — 긴장과 자극)',
    bChecksA: nameB + '의 바탕이 ' + nameA + '의 바탕을 다잡는 관계(상극 — 긴장과 자극)'
  }[rel];
}
function crossPlain(e, nameA, nameB) {
  const verb = e.kind === 'chung' ? '서로 부딪침' : e.kind === 'samhap' ? '같은 방향으로 힘을 모음' : '서로 끌어당김';
  return nameA + '의 ' + PILLAR_PLAIN[e.pillarA] + '와 ' + nameB + '의 ' + PILLAR_PLAIN[e.pillarB] + ': ' + verb;
}
function complementHeadline(c, nameA, nameB) {
  if (c.aGetsFromB && c.bGetsFromA) return '서로에게 필요한 기운을 나눠 주는 사이예요';
  if (c.aGetsFromB) return nameA + '에게 도움이 되는 기운을 ' + josa(nameB, '이', '가') + ' 넉넉히 가졌어요';
  if (c.bGetsFromA) return nameB + '에게 도움이 되는 기운을 ' + josa(nameA, '이', '가') + ' 넉넉히 가졌어요';
  if (c.filledForA.length || c.filledForB.length) return '한쪽에 비어 있는 기운을 다른 쪽이 조금씩 채워 주는 사이예요';
  return '서로 비슷한 기운을 나눠 가진 사이예요';
}
function complementLines(c, nameA, nameB) {
  const list = (arr) => arr.map((k) => OHAENG_PLAIN[k]).join('·');
  const lines = [];
  lines.push(nameA + '에게 도움이 되는 기운은 ' + OHAENG_PLAIN[c.yongA] + '이고, ' + josa(nameB, '은', '는') + ' 그 기운을 ' + (c.countsB[c.yongA] || 0) + '개 가졌어요.');
  lines.push(nameB + '에게 도움이 되는 기운은 ' + OHAENG_PLAIN[c.yongB] + '이고, ' + josa(nameA, '은', '는') + ' 그 기운을 ' + (c.countsA[c.yongB] || 0) + '개 가졌어요.');
  if (c.filledForA.length) lines.push(nameA + '에게 없는 ' + josa(list(c.filledForA), '을', '를') + ' ' + josa(nameB, '이', '가') + ' 갖고 있어요.');
  if (c.filledForB.length) lines.push(nameB + '에게 없는 ' + josa(list(c.filledForB), '을', '를') + ' ' + josa(nameA, '이', '가') + ' 갖고 있어요.');
  return lines;
}

/* ---------- 무료 사주 분석 ---------- */
function lockedTitles() {
  return ['두 사람의 흐름이 함께 좋은 세 달', '서로 끌리는 이유와 잘 맞는 결', '부딪히는 지점과 푸는 법', '연락·대화 방식', '관계를 지키는 행동', '앞으로 12개월, 달마다 흐름과 행동'];
}

/** 무료 사주 분석 — 엔진 숫자만, AI 호출 없음. 함께 좋은 세 달 중 3위 한 달만 공개하고, 1·2위 달과
    월별 점수는 유료의 핵심이라 응답에 넣지 않는다.
    birthA·birthB: { year, month, day, hour, minute, gender, isLunar, isLeap }. names: { a, b } */
function buildCouplePreview(birthA, birthB, relationKey, names = {}, now = new Date()) {
  const relation = relationOf(relationKey);
  for (const b of [birthA, birthB]) {
    if (b.gender !== '여' && b.gender !== '남') throw new Error('두 사람의 성별을 골라 주세요. 궁합 흐름 계산에 쓰여요.');
    validateBirth(b);
  }
  const engineA = computeSaju(birthA), engineB = computeSaju(birthB);
  const nameA = cleanName(names.a) || '나', nameB = cleanName(names.b) || '그 사람';
  const f = relationFacts(engineA, engineB);
  const timing = buildCoupleTiming(engineA, engineB, now);
  const person = (engine, name) => {
    const bal = readBalance(engine);
    return {
      name, pillars: readCharm(engine).pillars, hourUnknown: !hasHour(engine),
      ilgan: { char: engine.ilgan.char, ohaeng: engine.ilgan.ohaeng, plain: OHAENG_PLAIN[engine.ilgan.ohaeng] },
      bars: bal.bars.map((x) => ({ el: x.el, ko: x.ko, word: x.word, color: x.color, count: x.count, pct: x.pct })),
      helper: OHAENG_PLAIN[engine.yongshin.final.main]
    };
  };
  const dayKey = f.dayRelation ? f.dayRelation.type : 'none';
  const pullPoints = [];
  if (dayKey === 'yukhap' || dayKey === 'samhap') pullPoints.push({ title: '배우자 자리끼리', text: DAY_REL_PLAIN[dayKey] });
  pullPoints.push({ title: josa(nameB, '이', '가') + ' ' + nameA + '에게', text: starPlain(f.starBtoA) });
  pullPoints.push({ title: josa(nameA, '이', '가') + ' ' + nameB + '에게', text: starPlain(f.starAtoB) });
  if (f.ilganRel === 'aFeedsB' || f.ilganRel === 'bFeedsA' || f.ilganRel === 'same') pullPoints.push({ title: '바탕 성질', text: ilganRelPlain(f.ilganRel, nameA, nameB) });
  const clashPoints = [];
  if (dayKey === 'chung') clashPoints.push({ title: '배우자 자리끼리', text: DAY_REL_PLAIN.chung });
  if (f.ilganRel === 'aChecksB' || f.ilganRel === 'bChecksA') clashPoints.push({ title: '바탕 성질', text: ilganRelPlain(f.ilganRel, nameA, nameB) });
  f.clash.filter((e) => !(e.pillarA === 'day' && e.pillarB === 'day')).slice(0, 2).forEach((e) => clashPoints.push({ title: '부딪히는 자리', text: crossPlain(e, nameA, nameB) }));
  const pullCount = f.pull.length, clashCount = f.clash.length;
  const bestSeason = timing.seasons.reduce((a, s) => (s.avg > a.avg ? s : a), timing.seasons[0]);
  return {
    relation: { key: relationKey, label: relation.label },
    people: [person(engineA, nameA), person(engineB, nameB)],
    pull: {
      headline: '두 사람 사이에 서로 끌어당기는 자리가 ' + pullCount + '곳, 부딪히는 자리가 ' + clashCount + '곳 있어요.',
      lead: pullCount >= clashCount ? '끌어당기는 자리가 더 많아 처음 가까워지는 힘이 있는 편이에요. 부딪히는 자리는 피할 일보다 다루는 법을 알아 둘 자리예요.' : '부딪히는 자리가 더 많아 서로 자극이 되는 사이예요. 자극은 성장의 힘도 되지만, 다투는 방식을 미리 알면 훨씬 편해져요.',
      points: pullPoints
    },
    clash: { points: clashPoints.length ? clashPoints : [{ title: '부딪히는 자리', text: '눈에 띄게 부딪치는 자리는 적어요. 대신 성향 차이에서 오는 작은 엇갈림을 전체 풀이에서 살펴봐요.' }] },
    complement: { headline: complementHeadline(f.complement, nameA, nameB), lines: complementLines(f.complement, nameA, nameB) },
    // 계절 평균 1위와 함께 좋은 달 1위는 자주 다르다. 어느 경우든 같은 문장을 써서 1위 달의 위치를 흘리지 않는다.
    seasonLead: '두 사람의 흐름을 계절로 묶으면 ' + bestSeason.label + '이 가장 고르게 좋아요. 함께 가장 좋은 한 달은 이 계절 밖에 있을 수도 있어서, 1·2위 두 달은 전체 풀이에서 알려 드려요.',
    third: describeThirdPair(timing.top3[2], genderOf(engineA), genderOf(engineB), { them: nameB }),
    seasons: timing.seasons,
    startYm: timing.months[0].year + '-' + timing.months[0].month,
    note: [birthA, birthB].some((b) => b.hour == null) ? '태어난 시각을 모르는 사람은 세 기둥으로 계산했어요. 자녀·말년 자리는 근거로 쓰지 않아요.' : '',
    locked: lockedTitles(),
    price: config.priceKrw
  };
}

/* ---------- 유료 본문 ---------- */
const COUPLE_SYSTEM_PROMPT = [
  "당신은 '사주보는 수달'에서 두 사람의 궁합 리포트를 쓰는 풀이자입니다. 읽는 사람은 사주를 모르는 20~30대이고, 지금 마음에 둔 사람과의 관계를 분명하게 이해하고 싶어 돈을 냈습니다.",
  '',
  BASE_RULES,
  '',
  '## 이 상품만의 원칙',
  '7. **확정값이 유일한 근거입니다.** 전달된 "확정값"과 "두 사람의 구조"에 없는 사실·날짜·숫자를 새로 만들지 않습니다.',
  '8. **답부터 말합니다.** 각 장의 첫 문장이 그 장의 답입니다. 배경 설명은 그 뒤에 짧게 붙입니다.',
  '9. **단정하지 않습니다.** "반드시", "100%", "천생연분", "헤어진다", "이번에 놓치면 끝"처럼 단정하거나 겁주는 말을 쓰지 않습니다. 궁합은 좋고 나쁨의 판정이 아니라 두 사람이 서로를 다루는 법이라는 관점으로 씁니다.',
  '10. **상대의 속마음을 단정하지 않습니다.** 두 사람 모두 사주가 있지만, 사주는 성향과 흐름을 볼 뿐 그 사람이 지금 무엇을 느끼는지 알려 주지 않습니다. "그 사람은 당신을 좋아해요" 같은 말을 쓰지 않습니다. 상대의 외모·직업·나이·과거 사건을 지어내지 않습니다.',
  '11. **말투**: 두 사람의 관계를 차분히 읽어 주는 안내자처럼 다정하고 분명한 존댓말("~해요", "~예요"). 귀여운 말투, 과한 감탄, 명리학 논문체, 같은 말의 반복, "노력하세요" 같은 빈 조언을 쓰지 않습니다. 행동 조언은 장면이 그려질 만큼 구체적으로 씁니다.',
  '12. **읽는 호흡**: 한 문단은 2~3문장으로, 문단 사이에는 빈 줄을 넣습니다. 본문은 **근거**, **장면**, **해볼 일**처럼 짧은 굵은 표지로 구분하고 각 표지 뒤에는 다른 정보를 줍니다. 예시 대화는 예시임을 밝힙니다. 분량을 채우려고 같은 결론이나 격려를 되풀이하지 마세요.',
  '13. 소제목은 지정된 것만 "### "로 씁니다. 그 밖에 제목 기호(#)는 쓰지 않고, 강조는 굵게(**...**), 목록은 불릿(-)만 씁니다.',
  '14. 관계를 이어 갈지는 두 사람이 정할 일입니다. 집착·감시·반복 연락·상대의 거절을 무시하는 행동을 부추기지 않습니다.'
].join('\n');

function sectionDefs() {
  return [
    { key: 'answer', title: '한 줄 답' },
    { key: 'attract', title: '서로 끌리는 이유' },
    { key: 'fit', title: '잘 맞는 결' },
    { key: 'clash', title: '부딪히는 지점과 푸는 법' },
    { key: 'talk', title: '연락·대화 방식' },
    { key: 'flow', title: '두 사람의 12개월 흐름' },
    { key: 'keep', title: '관계를 지키는 행동' }
  ];
}
const MONTHS_TITLE = '12개월 상세 흐름';
// 생성 목표보다 낮은 하한: 제목만 갖춘 얇은 결과를 완료 처리하지 않는다.
const MIN_SECTION_CHARS = Object.freeze({ answer: 80, attract: 800, fit: 700, clash: 950, talk: 700, flow: 1200, keep: 800 });
const plainLength = (t) => String(t || '').replace(/[*#]/g, '').replace(/\s+/g, ' ').trim().length;
// 모델은 요청한 글자 수의 약 65%를 쓴다(연애 리포트 실측). 요청 숫자만 키우고 검수 기준은 그대로 둔다.
const ASK_RATIO = 1.5;
const ask = (n) => Math.round(n * ASK_RATIO / 50) * 50;
const range = (lo, hi) => ask(lo) + '~' + ask(hi) + '자';
const GENERATION_PARTS = Object.freeze([
  { name: '끌림과 결', sectionKeys: ['answer', 'attract', 'fit'], includeMonths: false },
  { name: '부딪힘과 대화', sectionKeys: ['clash', 'talk'], includeMonths: false },
  { name: '흐름과 행동', sectionKeys: ['flow', 'keep'], includeMonths: false },
  { name: '12개월 상세 흐름', sectionKeys: [], includeMonths: true }
]);

function personStructure(engine, name) {
  const g = genderOf(engine);
  const day = engine.manse.day;
  const groups = (engine.counts && engine.counts.shipsinGroup) || {};
  const loveStar = g === '남' ? '재성' : '관성';
  const lines = [
    '- 바탕 글자(일간): ' + engine.ilgan.char + ', ' + (OHAENG_PLAIN[engine.ilgan.ohaeng] || engine.ilgan.ohaeng) + '의 성질',
    '- 배우자 자리(일지 ' + day.branch + ')에 든 기운: ' + shipsinPlain(day.branchShipsinKo, g),
    '- 연인을 뜻하는 별 ' + (groups[loveStar] ?? 0) + '개 / 표현하고 드러내는 기운 ' + (groups['식상'] ?? 0) + '개 / 나와 같은 편의 기운 ' + (groups['비겁'] ?? 0) + '개 / 배움과 보살핌의 기운 ' + (groups['인성'] ?? 0) + '개',
    '- 타고난 기운의 세기: ' + (STRENGTH_PLAIN[engine.strength.verdict] || '보통') + ' / 도움이 되는 기운: ' + (OHAENG_PLAIN[engine.yongshin.final.main] || engine.yongshin.final.main)
  ];
  if (!hasHour(engine)) lines.push('- 태어난 시각 모름: 자녀·말년 자리는 근거로 쓰지 마세요. 별 개수는 대략으로만 보세요.');
  return '[' + name + '] 성별 ' + (g || '미상') + '\n' + lines.join('\n');
}

function buildCouplePrompt(engineA, engineB, people, relationKey, timing, options = {}) {
  const relation = relationOf(relationKey);
  const rawA = cleanName(people.a && people.a.name), rawB = cleanName(people.b && people.b.name);
  const nameA = rawA || '나', nameB = rawB || '그 사람';
  const gA = genderOf(engineA), gB = genderOf(engineB);
  const f = relationFacts(engineA, engineB);
  const comes = (x, g) => shipsinPlain(x.stemShipsin, g) + ', ' + shipsinPlain(x.branchShipsin, g);
  const top = timing.top3.map((m, i) => (i + 1) + ') ' + monthLabel(m) + ' — 두 사람 평균 ' + levelOf(m.score) + ' · ' + nameA + ' ' + levelOf(m.a.score) + '(들어오는 기운: ' + comes(m.a, gA) + ') · ' + nameB + ' ' + levelOf(m.b.score) + '(들어오는 기운: ' + comes(m.b, gB) + ')').join('\n');
  const months = timing.months.map((m) => '- ' + monthLabel(m) + ': 두 사람 평균 ' + levelOf(m.score) + ' · ' + nameA + ' ' + levelOf(m.a.score) + ' · ' + nameB + ' ' + levelOf(m.b.score)).join('\n');
  const monthNums = timing.months.map(monthLabel).join(', ');
  let yearsBlock = '자료 없음';
  if (timing.years && timing.years.periods) {
    const best = timing.years.periods[timing.years.bestIndex];
    yearsBlock = timing.years.periods.map((p) => '- ' + p.label + ': 두 사람 평균 ' + levelOf(p.combined) + ' (' + nameA + ' ' + levelOf(p.a.score) + ', ' + nameB + ' ' + levelOf(p.b.score) + ')').join('\n') + '\n함께 가장 좋은 해: ' + best.label;
  }
  const dayKey = f.dayRelation ? f.dayRelation.type : 'none';
  const notDayDay = (e) => !(e.pillarA === 'day' && e.pillarB === 'day');
  const pulls = f.pull.filter(notDayDay).map((e) => '  - ' + crossPlain(e, nameA, nameB));
  const clashes = f.clash.filter(notDayDay).map((e) => '  - ' + crossPlain(e, nameA, nameB));
  const structure = [
    '- ' + josa(nameB, '이', '가') + ' ' + nameA + '에게 다가오는 모습: ' + starPlain(f.starBtoA),
    '- ' + josa(nameA, '이', '가') + ' ' + nameB + '에게 다가오는 모습: ' + starPlain(f.starAtoB),
    '- 바탕 성질의 관계: ' + ilganRelPlain(f.ilganRel, nameA, nameB),
    '- 배우자 자리끼리: ' + DAY_REL_PLAIN[dayKey],
    '- 그 밖에 서로 끌어당기는 자리:\n' + (pulls.length ? pulls.join('\n') : '  - 없음'),
    '- 그 밖에 서로 부딪치는 자리:\n' + (clashes.length ? clashes.join('\n') : '  - 없음'),
    '- 기운의 보완: ' + complementHeadline(f.complement, nameA, nameB) + '. ' + complementLines(f.complement, nameA, nameB).join(' ')
  ].join('\n');
  const first = monthLabel(timing.top3[0]);
  const instructions = [
    ['answer', '### 한 줄 답\n' + range(150, 220) + ', 2~3문장. 첫 문장에 "12개월 중 두 사람의 흐름이 함께 가장 좋은 달은 ' + first + '"이라는 사실을 분명히 쓰고, 두 사람 관계의 핵심(끌림 하나와 다룰 점 하나)과 할 일 하나를 덧붙이세요.'],
    ['attract', '### 서로 끌리는 이유\n' + range(1100, 1300) + '. 두 방향의 "다가오는 모습"과 끌어당기는 자리를 근거로, ' + josa(nameA, '이', '가') + ' 끌리는 지점과 ' + josa(nameB, '이', '가') + ' 끌릴 수 있는 지점을 따로 설명하세요. 두 방향이 다르면 그 차이가 관계에서 어떻게 보일지 장면 두 가지로 보여 주세요. **근거**, **장면**, **해볼 일**을 사용하고 상대의 속마음을 단정하지 마세요.'],
    ['fit', '### 잘 맞는 결\n' + range(1000, 1200) + '. 바탕 성질의 관계와 기운의 보완을 근거로, 두 사람이 함께 있을 때 편해지는 부분과 서로를 채워 주는 방식을 일상 장면(함께 쉬는 법, 계획 세우는 법, 힘들 때 기대는 법)으로 설명하세요. **근거**, **장면**, **해볼 일**을 사용하세요.'],
    ['clash', '### 부딪히는 지점과 푸는 법\n' + range(1300, 1500) + '. 부딪치는 자리(없으면 기운의 세기·바탕 성질 차이)를 근거로 다툼이 생기기 쉬운 장면 두 가지를 **장면 1**, **장면 2**로 나누세요. 각각 시작 신호 → 두 사람의 가능한 반응 → 푸는 대화 예시 → 다음에 바꿔 볼 약속을 다룹니다. 누구 잘못인지 가리지 말고, 없는 충을 만들지 마세요.'],
    ['talk', '### 연락·대화 방식\n' + range(1000, 1200) + '. 두 사람의 표현하는 기운·기운의 세기 차이를 근거로, 연락 빈도와 속도, 서운함을 말하는 방식, 중요한 이야기를 꺼내기 좋은 방식을 설명하세요. 예시 대화 두 개(예시임을 밝힘)와 피할 말투 하나를 담고 **근거**, **장면**, **해볼 일**을 사용하세요.'],
    ['flow', '### 두 사람의 12개월 흐름\n세 달 각각 ' + range(450, 600) + ', 앞으로 3년 흐름 ' + range(200, 300) + '. 확정값의 "함께 가장 좋은 세 달"을 강한 순서대로 "**YYYY년 M월**"로 시작해 쓰고, 달마다 두 사람 각자의 흐름이 어떻게 겹치는지, 그달에 함께 해 볼 일 하나와 살필 점 하나를 담으세요. 마지막에 **앞으로 3년** 표지로 연도별 흐름을 짧게 정리하세요. 확정값에 없는 달·연도·숫자를 만들지 마세요.'],
    ['keep', '### 관계를 지키는 행동\n' + range(1100, 1300) + '. 지금 관계(' + relation.label + ')에 맞게 **이번 주**, **다음 만남**, **한 달 뒤 점검** 세 단계로 쓰세요. 단계마다 구체적인 행동, 예시 대화, 상대 반응에 따라 이어갈 일과 멈출 기준을 담습니다. 다른 장의 문장을 반복하지 마세요.'],
    ['months', '### ' + MONTHS_TITLE + '\n확정값의 12개월 순서(' + monthNums + ') 그대로 정확히 12줄. 각 줄은 "- YYYY년 N월: 내용" 형식입니다. 달마다 ' + range(200, 260) + ', 4~5개의 짧은 문장. **흐름**: 그 달 두 사람의 흐름이 어떻게 겹치는지. **해볼 일**: 함께 해 볼 행동 하나. **점검**: 살필 반응이나 주의점 하나. 좋은 달과 잔잔한 달의 행동 강도가 달라야 하고, 12줄에 같은 조언을 돌려 쓰지 마세요. 월별 단락 안에는 줄바꿈을 넣지 않습니다.']
  ];
  const requested = options.sectionKeys || sectionDefs().map((d) => d.key);
  const format = instructions.filter(([key]) => (key === 'months' ? options.includeMonths !== false : requested.includes(key))).map(([, t]) => t).join('\n\n');

  return '# 두 사람의 궁합\n\n## 두 사람의 관계\n' + relation.label + '. ' + relation.guide
    + '\n\n## 확정값 (바꾸거나 새로 만들지 마세요)\n두 사람의 흐름이 함께 가장 좋은 세 달 (강한 순서):\n' + top
    + '\n\n앞으로 12개월 흐름 (강함·보통·잔잔함):\n' + months
    + '\n\n앞으로 3년 흐름:\n' + yearsBlock
    + '\n\n## 두 사람의 구조\n' + personStructure(engineA, nameA) + '\n\n' + personStructure(engineB, nameB) + '\n\n[두 사람 사이]\n' + structure
    + '\n\n## 부르는 이름\n읽는 사람: ' + (rawA ? nameA + '님' : '"당신"') + ' / 상대: ' + (rawB ? nameB + '님' : '"그 사람"')
    + (options.previous ? '\n\n## 이미 쓴 장의 요약 (새 장에서는 같은 설명을 반복하지 마세요)\n' + options.previous : '')
    + '\n\n## 쓰는 형식\n이번 요청에 지정한 소제목만 정확히 이 표기와 순서로 쓰세요. **근거**, **장면**, **해볼 일** 같은 표지는 문장 안에 넣지 말고 한 줄에 표지만 단독으로 쓴 뒤, 다음 줄부터 2~3문장 문단을 쓰세요(12개월 상세 흐름은 한 줄 형식 유지). 문단 사이에는 빈 줄을 넣으세요. 각 장과 각 달마다 독자가 꼭 기억할 핵심 구절 1~3곳을 **짧은 구절**(20자 안팎, 한 문장 안에서 열고 닫기)로 굵게 표시하세요. 강조가 하나도 없는 장이 있으면 안 됩니다. 글자 수는 제목·표지 기호를 뺀, 띄어쓰기를 포함한 본문 기준입니다. 전체 리포트는 약 9,000~14,000자 목표이며, 이번에는 아래 장만 씁니다.\n' + EVIDENCE_RULE + '\n\n'
    + format;
}

/* ---------- 본문 파싱·검사 ---------- */
const HEADING_RE = /^\s*#{1,6}\s*(.+?)\s*#*\s*$/;
const MONTH_RE = /^\s*(?:[-•*]\s*)?(?:\*\*)?\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(?:\*\*)?\s*[:：]\s*(.+?)\s*$/;
function normalizeHeading(s) {
  return String(s).replace(/\*\*/g, '').replace(/\(.*?\)|（.*?）|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}\s,·]/gu, ' ').replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim();
}
const sameTitle = (norm, title) => { const t = normalizeHeading(title); return norm === t || norm.startsWith(t + ' '); };

function parseCoupleText(text) {
  const defs = sectionDefs();
  const raw = String(text || '');
  const found = new Map();
  let cur = null, monthLines = null, sawHeading = false;
  for (const line of raw.split('\n')) {
    const h = HEADING_RE.exec(line);
    if (h) {
      sawHeading = true;
      const norm = normalizeHeading(h[1]);
      if (sameTitle(norm, MONTHS_TITLE) || sameTitle(norm, '앞으로 12개월') || sameTitle(norm, '월별 상세 흐름')) { monthLines = monthLines || []; cur = { months: true }; continue; }
      const def = defs.find((d) => sameTitle(norm, d.title));
      if (def) {
        if (!found.has(def.key)) found.set(def.key, { lines: [] });
        cur = found.get(def.key);
        continue;
      }
      // 모르는 하위 제목은 버리지 않고 지금 장의 본문에 굵게 붙인다.
      const label = h[1].replace(/\*\*/g, '').trim();
      if (cur && !cur.months && label) cur.lines.push('', '**' + label + '**');
      continue;
    }
    if (!cur) continue;
    if (cur.months) monthLines.push(line); else cur.lines.push(line);
  }
  const sections = defs.filter((d) => found.has(d.key)).map((d) => ({ key: d.key, title: d.title, text: found.get(d.key).lines.join('\n').trim() })).filter((s) => s.text);
  if (!sawHeading) return { sections: [], monthNotes: [] };
  const monthNotes = [], seen = new Set();
  for (const line of monthLines || []) {
    const m = MONTH_RE.exec(line);
    if (!m) continue;
    const month = Number(m[2]);
    if (month < 1 || month > 12 || seen.has(month)) continue;
    seen.add(month);
    monthNotes.push({ month, ...(m[1] ? { year: Number(m[1]) } : {}), note: m[3].trim() });
  }
  return { sections, monthNotes };
}

const ymRe = (m) => new RegExp(m.year + '\\s*년\\s*' + m.month + '\\s*월');
/* 구조·분량·날짜를 검사한다. 개인화의 설득력은 실제 결과 검토가 따로 필요하다. */
function validateCoupleReading(parsed, timing, options = {}) {
  const required = sectionDefs().filter((d) => !options.sectionKeys || options.sectionKeys.includes(d.key));
  const have = new Set(parsed.sections.map((s) => s.key));
  const missing = required.filter((d) => !have.has(d.key)).map((d) => d.title);
  if (missing.length) throw new Error('본문에 빠진 장: ' + missing.join(', '));
  const answer = parsed.sections.find((s) => s.key === 'answer');
  if (answer && required.some((d) => d.key === 'answer') && !ymRe(timing.top3[0]).test(answer.text)) {
    throw new Error('한 줄 답에 함께 가장 좋은 달(' + monthLabel(timing.top3[0]) + ')이 없습니다.');
  }
  for (const def of required) {
    const section = parsed.sections.find((s) => s.key === def.key);
    if (plainLength(section.text) < MIN_SECTION_CHARS[def.key]) throw new Error(def.title + ': 상세 풀이 분량 부족 (' + plainLength(section.text) + '자, 최소 ' + MIN_SECTION_CHARS[def.key] + '자)');
    if (section.text.split(/\n\s*\n/).some((p) => plainLength(p) > 600)) throw new Error(def.title + ': 긴 문단을 2~3문장씩 나누세요.');
  }
  const flow = parsed.sections.find((s) => s.key === 'flow');
  if (flow && required.some((d) => d.key === 'flow')) {
    let previous = -1;
    for (const m of timing.top3) {
      const match = ymRe(m).exec(flow.text);
      if (!match || match.index <= previous) throw new Error('함께 좋은 세 달의 날짜 또는 순서가 확정값과 다릅니다.');
      previous = match.index;
    }
  }
  if (options.includeMonths !== false) {
    if (parsed.monthNotes.length !== 12) throw new Error('월별 상세 풀이가 ' + parsed.monthNotes.length + '개입니다 (12개 필요).');
    parsed.monthNotes.forEach((n, i) => {
      const expected = timing.months[i];
      if (n.month !== expected.month || (n.year != null && n.year !== expected.year)) throw new Error('월별 풀이의 날짜 또는 순서가 확정값과 다릅니다.');
      if (plainLength(n.note) < 140) throw new Error(monthLabel(expected) + ' 월별 상세 풀이 분량 부족 (' + plainLength(n.note) + '자, 최소 140자)');
    });
  }
  const seen = new Set();
  const paragraphs = parsed.sections.flatMap((s) => s.text.split(/\n\s*\n/)).concat(options.includeMonths === false ? [] : parsed.monthNotes.map((n) => n.note));
  for (const p of paragraphs) {
    const normalized = p.replace(/[\s*#]/g, '');
    if (normalized.length < 80) continue;
    if (seen.has(normalized)) throw new Error('같은 해설 문단이 반복되었습니다. 중복 없이 다시 작성하세요.');
    seen.add(normalized);
  }
}

// 결과 화면(LoveReadingModel.buildPaid)과 마이페이지가 읽는 본문. 월별 장 제목 "앞으로 12개월"은 읽기 화면이 12개월 장으로 알아본다.
function toPlainText(reading) {
  const parts = reading.sections.map((s) => '## ' + s.title + '\n\n' + s.text.replace(/^\s*#+\s*/gm, ''));
  if (reading.monthNotes && reading.monthNotes.length) {
    parts.push('## 앞으로 12개월\n\n' + reading.monthNotes.map((n) => '- ' + (n.year ? n.year + '년 ' : '') + n.month + '월: ' + n.note).join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * @param {object} people { a: { name }, b: { name } }
 * @param {object} opts { startYm?, generate?: 테스트용 생성 함수 }
 * @returns {{ title, relationKey, timing, sections, monthNotes, usage }}
 */
async function generateCoupleReading(engineA, engineB, people, relationKey, now = new Date(), opts = {}) {
  relationOf(relationKey);
  const generate = opts.generate || generateText;
  const timing = buildCoupleTiming(engineA, engineB, now, { startYm: opts.startYm });
  const usages = [];
  // 장별 근거·사실 대조 기록(검토용). 화면·PDF 본문에는 들어가지 않는다.
  const review = startReview({ engines: [engineA, engineB], months: timing.months, ranked: timing.top3, rankSections: ['answer', 'flow'] }, sectionDefs());
  async function runPart(part, base) {
    const previous = base.map((s) => s.title + ': ' + s.text.replace(/\s+/g, ' ').slice(0, 240)).join('\n');
    const prompt = buildCouplePrompt(engineA, engineB, people, relationKey, timing, { ...part, previous });
    let lastError = null, accepted = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const correction = lastError ? '\n\n## 이전 시도 수정 사항\n' + lastError.message + ' 이번 묶음의 지정 장만 다시 작성하세요.' : '';
      let text, usage;
      try {
        ({ text, usage } = await generate(COUPLE_SYSTEM_PROMPT, prompt + correction, { maxTokens: 16000 }));
      } catch (e) {
        // 길이 제한으로 잘린 응답만 이 묶음을 다시 만든다. 그 밖의 오류(인증·장애)는 그대로 실패시킨다.
        if (!/max_tokens/.test(e.message)) throw e;
        lastError = new Error('응답이 길이 제한에 걸려 잘렸습니다. 지정 분량 안에서 마무리하세요.');
        continue;
      }
      usages.push(usage);
      const ev = splitEvidence(text);
      const parsed = parseCoupleText(ev.text);
      // 요청 밖의 장이 섞여도 이미 완료한 장을 덮어쓰지 않는다.
      const selected = { sections: parsed.sections.filter((s) => part.sectionKeys.includes(s.key)), monthNotes: part.includeMonths ? parsed.monthNotes : [] };
      try {
        validateCoupleReading({ sections: [...base, ...selected.sections], monthNotes: selected.monthNotes }, timing, part);
        review.check(selected, ev.notes, attempt < 1);
        accepted = selected;
        break;
      } catch (e) {
        lastError = e;
        console.warn('[궁합 리포트] 다시 생성:', part.name, '-', e.message);
      }
    }
    if (!accepted) throw lastError;
    return accepted;
  }
  // 첫 묶음을 먼저 만들고, 나머지 묶음은 그 요약만 참고하므로 동시에 만든다.
  const [first, ...rest] = GENERATION_PARTS;
  const sections = [], monthNotes = [];
  sections.push(...(await runPart(first, [])).sections);
  const others = await Promise.all(rest.map((part) => runPart(part, sections.slice())));
  for (const part of others) { sections.push(...part.sections); monthNotes.push(...part.monthNotes); }
  const ordered = sectionDefs().map((def) => sections.find((s) => s.key === def.key)).map((sec) => (sec.key === 'answer' ? sec : { ...sec, text: ensureHighlight(sec.text) }));
  const parsed = { sections: ordered, monthNotes: monthNotes.map((n, i) => ({ ...n, year: timing.months[i].year })) };
  validateCoupleReading(parsed, timing);
  return { title: '두 사람의 궁합', relationKey, timing, ...parsed, ...review.result(), usage: sumUsage(usages) };
}

module.exports = {
  COUPLE_SYSTEM_PROMPT, RELATIONS, relationOf, buildCoupleTiming, buildCouplePreview, relationFacts,
  buildCouplePrompt, parseCoupleText, validateCoupleReading, toPlainText, generateCoupleReading, sectionDefs, cleanName, MIN_SECTION_CHARS
};
