'use strict';
/* 2027 신년운세 — 한 해를 한 줄 답·총운·좋은 세 달·네 주제·분기·12개월로 읽는 유료 상품(연애 상품과 같은 구조).

   숫자는 모두 엔진이 정한다(engine/monthlyFlow): 총운 점수, 1~12월 점수, 재물·일·애정·건강
   네 주제의 연간·월별 점수, 가장 좋은 세 달과 조심할 달. AI는 그 확정값을 쉬운 말로 해석만 한다.
   본문은 다섯 묶음으로 만든다 — 첫 묶음(한 줄 답·총운)을 먼저 만들고 나머지 네 묶음은 그 요약만
   참고해 동시에 만든다(연애 상품 2026-10-28 실측: 순서대로 만들면 4~7분). 실패한 묶음만 한 번 다시 만든다.

   해가 바뀌면 config/newYear.js의 year와 상품 키를 함께 올린다. */
const { BASE_RULES } = require('./baseSystemPrompt');
const { generateText, sumUsage } = require('./client');
const { monthlyFlow, yearlyFlow } = require('../engine/monthlyFlow');
const { buildTimingData, tier } = require('./deepReading');
const { computeSaju } = require('../engine/index');
const { readBalance, pillarsOf } = require('../engine/freeReadings');
const { validateBirth } = require('../engine/loveTiming');
const newYearConfig = require('../config/newYear');

const YEAR = newYearConfig.year || 2027;

/* 네 주제. key는 monthlyFlow의 topic 값. */
const NEWYEAR_TOPICS = [
  { key: 'wealth', label: '재물운', focus: '수입·지출·저축과 돈이 드는 결정' },
  { key: 'career', label: '일·직업운', focus: '일의 방향, 평가·이직·독립 같은 일의 결정' },
  { key: 'love', label: '애정운', focus: '인연이 시작되고 깊어지는 흐름, 지금 관계를 돌보는 방식' },
  { key: 'health', label: '건강·생활 리듬', focus: '수면·식사·운동·휴식의 리듬과 무리하기 쉬운 때' }
];
const QUARTERS = [
  { q: 1, label: '1분기', range: '1~3월', months: [1, 2, 3] },
  { q: 2, label: '2분기', range: '4~6월', months: [4, 5, 6] },
  { q: 3, label: '3분기', range: '7~9월', months: [7, 8, 9] },
  { q: 4, label: '4분기', range: '10~12월', months: [10, 11, 12] }
];
// 이 점수 이상인 달을 "흐름이 좋은 달"로 센다(deepReading.tier의 '순조로운 시기' 경계와 같다).
const STRONG = 65;
const levelOf = (s) => (s >= STRONG ? '강함' : s >= 45 ? '보통' : '잔잔함');
const quarterLevel = (s) => (s >= STRONG ? '힘이 실려요' : s >= 45 ? '고르게 흘러요' : '쉬어 가요');

function bestOf(rows) { return rows.reduce((a, b) => (b.score > a.score ? b : a)); }
/* 가장 낮은 달 — 점수가 같으면 더 나중 달. 가장 좋은 달과 같은 달이면(전부 같은 점수) null. */
function cautionOf(rows, best) {
  const c = rows.reduce((a, b) => (b.score <= a.score ? b : a));
  return c.month === best.month ? null : c;
}
const pick = (m) => ({ month: m.month, score: m.score });

/** 엔진 숫자만으로 신년운세의 모든 점수를 확정한다. 실패하면 던진다(호출한 쪽이 주문을 환불). */
function buildNewYearData(engine, person = {}, opts = {}) {
  const year = opts.year || YEAR;
  const gender = person.gender || engine.meta.input.gender || null;
  const [yr] = yearlyFlow(engine, [year], { topic: 'intro', gender });
  const months = monthlyFlow(engine, { fromYear: year, fromMonth: 1, count: 12, topic: 'intro', gender });
  const best = bestOf(months);
  const caution = cautionOf(months, best);
  // 가장 좋은 세 달(점수 순, 같으면 이른 달)과, 그 세 달을 뺀 가장 낮은 달(같으면 나중 달)을 "조심할 달"로 둔다.
  const top3 = months.map((m, index) => ({ ...m, index })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 3).map(pick);
  const topSet = new Set(top3.map((m) => m.month));
  const rest = months.filter((m) => !topSet.has(m.month));
  const watch = rest.length ? pick(rest.reduce((a, b) => (b.score <= a.score ? b : a))) : null;

  const topics = NEWYEAR_TOPICS.map((t) => {
    const [ty] = yearlyFlow(engine, [year], { topic: t.key, gender });
    const tm = monthlyFlow(engine, { fromYear: year, fromMonth: 1, count: 12, topic: t.key, gender });
    const tb = bestOf(tm);
    const tc = cautionOf(tm, tb);
    return { key: t.key, label: t.label, score: ty.score, months: tm, best: pick(tb), caution: tc ? pick(tc) : null };
  });

  const quarters = QUARTERS.map((qq) => {
    const rows = months.filter((m) => qq.months.includes(m.month));
    const avg = Math.round(rows.reduce((s, m) => s + m.score, 0) / rows.length);
    return { ...qq, avg, level: quarterLevel(avg) };
  });

  // 대운·그 해의 12운성 같은 배경 — 실패해도 나머지는 그대로 간다.
  let context = null;
  try {
    const td = buildTimingData(engine, new Date(year, 5, 15), { topicKey: 'intro', gender });
    context = { age: td.currentAge, current: td.current, yearRow: (td.years || []).find((y) => y.year === year) || null };
  } catch (e) { context = null; }
  const age = context ? context.age : year - engine.meta.input.year + 1;

  return {
    year, gender, age, yongshinMain: engine.yongshin.final.main, context,
    overall: { score: yr.score, ganZhi: yr.ganZhi, ganZhiKo: yr.ganZhiKo, stemShipsin: yr.stemShipsin, branchShipsin: yr.branchShipsin },
    months, best: pick(best), caution: caution ? pick(caution) : null, top3, watch, topics, quarters,
    strongCount: months.filter((m) => m.score >= STRONG).length
  };
}

/* ---------- 쉬운 말 근거 ---------- */
const SHIPSIN_GROUP_OF = {
  비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성', 정재: '재성',
  편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성'
};
const GROUP_PLAIN = {
  비겁: '나와 같은 편의 기운(동료·경쟁·독립심)',
  식상: '표현하고 만들어 내는 기운(말·재능·성과물)',
  재성: '재물과 현실 감각의 기운(돈·거래·결과)',
  관성: '규칙과 책임의 기운(직장·평가·자리)',
  인성: '배움과 도움의 기운(문서·자격·윗사람)'
};
const plain = (shipsin) => GROUP_PLAIN[SHIPSIN_GROUP_OF[shipsin]] || '고른 기운';
const OHAENG_PLAIN = { 木: '나무(木)', 火: '불(火)', 土: '흙(土)', 金: '쇠(金)', 水: '물(水)' };
const STRENGTH_PLAIN = { 신강: '스스로의 기운이 센 편', 신약: '스스로의 기운이 여린 편', 중화: '기운이 고르게 맞춰진 편' };
const YEAR_TIER = { '크게 도와주는 시기': '크게 밀어 주는 해', '순조로운 시기': '순조로운 해', '무난한 시기': '고르게 흐르는 해', '조심스러운 시기': '다지며 가는 해', '신중해야 할 시기': '속도를 늦추는 해' };
const yearTier = (s) => YEAR_TIER[tier(s)] || '고르게 흐르는 해';
const ILGAN_NATURE = {
  甲: '곧게 자라는 큰 나무처럼 방향을 정하면 밀고 나가는 사람이에요.',
  乙: '바람에 휘어도 꺾이지 않는 풀처럼 부드럽게 버티며 길을 찾는 사람이에요.',
  丙: '한낮의 해처럼 드러내고 움직일 때 힘이 나는 사람이에요.',
  丁: '촛불처럼 가까운 곳을 오래 밝히는, 섬세하고 집중력 있는 사람이에요.',
  戊: '큰 산처럼 무게를 잡고 버티는 힘이 있는 사람이에요.',
  己: '밭처럼 품이 넓어 사람과 일을 길러 내는 사람이에요.',
  庚: '단단한 원석처럼 원칙이 분명하고 결단이 빠른 사람이에요.',
  辛: '다듬어진 보석처럼 감각이 섬세하고 기준이 높은 사람이에요.',
  壬: '큰 강처럼 넓게 보고 흐름을 읽는 사람이에요.',
  癸: '이슬비처럼 조용히 스며들어 상황을 바꾸는 사람이에요.'
};
const BAND_LINE = [
  [80, '한 해 전체가 나를 밀어 주는 쪽으로 기울어 있어요. 미뤄 둔 일을 꺼내 시작하기 좋은 해예요.'],
  [65, '큰 무리 없이 흐름을 타기 좋은 해예요. 준비한 만큼 결과가 따라오는 쪽입니다.'],
  [40, '좋고 나쁨이 한쪽으로 쏠리지 않은 해예요. 달마다 힘을 쓸 때와 쉴 때를 고르는 것이 중요해요.'],
  [25, '서두르기보다 다지는 쪽이 맞는 해예요. 넓히기보다 지금 가진 것을 정리할 때 힘이 나요.'],
  [-1, '속도를 늦추고 기본을 지키는 쪽이 맞는 해예요. 큰 결정은 흐름이 좋은 달에 맞춰 두는 편이 나아요.']
];
const bandLine = (s) => BAND_LINE.find(([min]) => s >= min)[1];
// 이름은 자유 입력이라 줄바꿈·제어문자·마크다운 기호로 프롬프트 구조를 흉내 낼 수 있다. 글자만 남긴다.
const cleanName = (name) => String(name || '').replace(/[\u0000-\u001f\u007f#*<>\[\]\u0060]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);

function pillarStrip(engine) {
  const KO = { year: '연주', month: '월주', day: '일주', hour: '시주' };
  return pillarsOf(engine).map((key) => {
    const p = engine.manse[key];
    return { key, ko: KO[key], hanja: p.stem + p.branch, ganzi: (p.stemKo || '') + (p.branchKo || '') };
  });
}

function lockedTitles() {
  return ['가장 좋은 세 달과 조심할 달', '재물운 · 일·직업운', '애정운 · 건강·생활 리듬', '분기별 할 것·피할 것', '12개월 상세 흐름'];
}

/** 무료 첫 장 — 엔진 숫자만. 달별 점수·가장 좋은 달은 유료의 핵심이라 응답에 넣지 않는다(개발자 도구로 보인다). */
function buildNewYearPreview(birth) {
  if (birth.gender !== '여' && birth.gender !== '남') throw new Error('성별을 골라 주세요. 신년운세 계산에 쓰여요.');
  validateBirth(birth);
  const engine = computeSaju(birth);
  const data = buildNewYearData(engine, { gender: birth.gender });
  const balance = readBalance(engine);
  const o = data.overall;
  const best = data.quarters.reduce((a, q) => (q.avg > a.avg ? q : a), data.quarters[0]);
  return {
    year: data.year,
    pillars: pillarStrip(engine),
    note: pillarsOf(engine).length === 3 ? '태어난 시각이 없어 시주는 빼고 세 기둥으로 읽었어요.' : null,
    yearLine: {
      ganzi: o.ganZhiKo + '(' + o.ganZhi + ')',
      tier: yearTier(o.score),
      headline: data.year + '년 ' + o.ganZhiKo + '년은 ' + yearTier(o.score) + '예요',
      text: bandLine(o.score),
      comes: '올해 들어오는 기운은 ' + plain(o.stemShipsin) + ', 그리고 ' + plain(o.branchShipsin) + '이에요.'
    },
    ilgan: { char: engine.ilgan.char, ko: engine.ilgan.ko, ohaeng: engine.ilgan.ohaeng, ohaengKo: OHAENG_PLAIN[engine.ilgan.ohaeng] || engine.ilgan.ohaeng, text: ILGAN_NATURE[engine.ilgan.char] || '' },
    balance: { headline: balance.headline, lead: balance.lead, bars: balance.bars },
    quarters: data.quarters.map((q) => ({ label: q.label, range: q.range, level: q.level, avg: q.avg })),
    // 분기 평균 1위와 월별 1위 달은 자주 다르다. 어느 경우든 같은 문장을 써 1위 달의 위치를 흘리지 않는다.
    quarterLead: '분기로 묶어 보면 ' + best.label + '(' + best.range + ')의 흐름이 가장 고르게 좋아요. 가장 좋은 한 달은 이 분기 밖에 있을 수도 있어서, 정확한 세 달은 전체 풀이에서 알려 드려요.',
    strongCount: data.strongCount,
    locked: lockedTitles(),
    price: newYearConfig.priceKrw
  };
}

/* ---------- 본문 정의 ---------- */
const SECTION_DEFS = [
  { key: 'answer', title: '한 줄 답' },
  { key: 'overall', title: YEAR + ' 총운', aliases: [YEAR + '년 총운', '총운', '올해 총운'] },
  { key: 'months3', title: '가장 좋은 세 달과 조심할 달', aliases: ['가장 좋은 세 달'] },
  { key: 'wealth', title: '재물운' },
  { key: 'career', title: '일·직업운', aliases: ['일 직업운', '직업운', '일과 직업운'] },
  { key: 'love', title: '애정운', aliases: ['연애운'] },
  { key: 'health', title: '건강·생활 리듬', aliases: ['건강 생활 리듬', '건강운', '생활 리듬'] },
  { key: 'quarters', title: '분기별 할 것·피할 것', aliases: ['분기별 할 것 피할 것', '분기별 할 것'] }
];
const MONTHS_TITLE = '월별 상세 흐름';
const sectionDefs = () => SECTION_DEFS;
// 생성 목표보다 낮은 하한: 제목만 갖춘 얇은 결과를 완료 처리하지 않는다.
const MIN_SECTION_CHARS = Object.freeze({ answer: 80, overall: 900, months3: 1000, wealth: 650, career: 650, love: 650, health: 550, quarters: 750 });
const plainLength = (text) => String(text || '').replace(/[*#]/g, '').replace(/\s+/g, ' ').trim().length;
/* 분량 보정 — 모델은 요청한 글자 수의 약 65%를 쓴다(연애 상품 2026-10-28 실측). 요청 숫자만 키우고 검수 기준은 그대로 둔다. */
const ASK_RATIO = 1.5;
const ask = (n) => Math.round(n * ASK_RATIO / 50) * 50;
const range = (lo, hi) => ask(lo) + '~' + ask(hi) + '자';
const GENERATION_PARTS = Object.freeze([
  { name: '한 해의 큰 흐름', sectionKeys: ['answer', 'overall'], includeMonths: false },
  { name: '좋은 달과 분기', sectionKeys: ['months3', 'quarters'], includeMonths: false },
  { name: '재물과 일', sectionKeys: ['wealth', 'career'], includeMonths: false },
  { name: '애정과 생활 리듬', sectionKeys: ['love', 'health'], includeMonths: false },
  { name: '12개월 상세 흐름', sectionKeys: [], includeMonths: true }
]);

const NEWYEAR_SYSTEM_PROMPT = "당신은 '사주보는 수달'에서 2027 신년운세 리포트를 쓰는 풀이자입니다. 읽는 사람은 사주를 모르는 20~40대이고, \"내년은 어떤 해이고, 언제 무엇을 하면 되는지\" 분명한 답을 듣고 싶어 돈을 냈습니다.\n\n" + BASE_RULES + "\n\n## 이 상품만의 원칙\n" +
  "7. **확정값이 유일한 근거입니다.** 전달된 \"확정값\"과 \"이 사람의 구조\"에 없는 사실·날짜·숫자를 새로 만들지 않습니다. 점수 숫자는 본문에 쓰지 않고 강함·보통·잔잔함 같은 말로만 씁니다.\n" +
  "8. **답부터 말합니다.** 각 장의 첫 문장이 그 장의 답입니다. 배경 설명은 그 뒤에 짧게 붙입니다.\n" +
  "9. **달은 분명하게, 단정은 하지 않습니다.** 확정값의 달을 바꾸지 말고 \"12개월 중 흐름이 가장 좋은 달은 ○월이에요\"처럼 비교로 말합니다. \"반드시\", \"100%\", \"큰일 난다\", \"이때 놓치면 끝\"처럼 단정하거나 겁주는 말은 쓰지 않습니다. 다른 사람의 속마음이나 행동을 단정하지 않습니다.\n" +
  "10. **돈·건강은 생활의 말로.** 특정 투자 상품·종목·수익률을 말하지 않습니다. 건강은 수면·식사·운동·휴식의 리듬으로만 쓰고 병명·진단·치료·약·검사 이야기는 하지 않습니다.\n" +
  "11. **말투**: 한 해를 차분히 읽어 주는 안내자처럼 다정하고 분명한 존댓말(\"~해요\", \"~예요\"). 귀여운 말투, 과한 감탄, 명리학 논문체, 같은 말의 반복, \"노력하세요\" 같은 빈 조언을 쓰지 않습니다. 각 장은 핵심 해석, 사주에서 읽은 근거, 일상에서 해 볼 행동 순서로 쓰고, 행동은 장면이 그려질 만큼 구체적으로 씁니다.\n" +
  "12. **읽는 호흡**: 한 문단은 2~3문장, 문단 사이에는 빈 줄. 400자 넘는 벽 같은 문단을 만들지 않습니다. 본문은 **근거**, **장면**, **해볼 일**처럼 짧은 굵은 표지로 구분하고 표지마다 다른 정보를 줍니다. 분량을 채우려고 같은 결론이나 격려를 되풀이하지 마세요.\n" +
  "13. 소제목은 지정된 것만 \"### \"로 씁니다. 그 밖에 제목 기호(#)는 쓰지 않고, 강조는 굵게(**...**), 목록은 불릿(-)만 씁니다.";

function structureLines(engine, data, gender) {
  const day = engine.manse.day;
  const lines = [];
  lines.push('- 나를 뜻하는 글자(일간): ' + engine.ilgan.char + ', ' + (OHAENG_PLAIN[engine.ilgan.ohaeng] || engine.ilgan.ohaeng) + '의 성질 — ' + (ILGAN_NATURE[engine.ilgan.char] || ''));
  lines.push('- 타고난 기운의 세기: ' + (STRENGTH_PLAIN[engine.strength.verdict] || '보통') + ' / 도움이 되는 기운: ' + (OHAENG_PLAIN[data.yongshinMain] || data.yongshinMain));
  lines.push('- 가까운 사람의 자리(일지 ' + day.branch + ')에 든 기운: ' + plain(day.branchShipsinKo));
  const groups = (engine.counts && engine.counts.shipsinGroup) || {};
  lines.push('- 사주 안의 기운 개수: 나와 같은 편 ' + (groups['비겁'] ?? 0) + ' / 표현·재능 ' + (groups['식상'] ?? 0) + ' / 재물·현실 ' + (groups['재성'] ?? 0) + ' / 규칙·책임 ' + (groups['관성'] ?? 0) + ' / 배움·도움 ' + (groups['인성'] ?? 0));
  lines.push('- 연인을 뜻하는 기운: ' + (gender === '남' ? '재물·현실의 기운' : gender === '여' ? '규칙·책임의 기운' : '성별 미상이라 따로 보지 않음'));
  if (!pillarsOf(engine).includes('hour')) lines.push('- 태어난 시각 모름: 자녀·말년 자리는 근거로 쓰지 마세요. 기운 개수에는 정오로 가정한 값이 섞여 있어 대략으로만 보세요.');
  return lines.join('\n');
}

function buildNewYearPrompt(data, engine, person = {}, options = {}) {
  const y = data.year, o = data.overall;
  const gender = person.gender || data.gender;
  const name = cleanName(person.name);
  const ctx = data.context;
  const dae = ctx && ctx.current ? '- 지금 10년 단위 큰 흐름: ' + tier(ctx.current.score) : '- 지금 10년 단위 큰 흐름: 자료 없음';
  const comes = (m) => plain(m.stemShipsin) + ', ' + plain(m.branchShipsin);
  const topicOf = (key) => data.topics.find((t) => t.key === key);
  const short = { wealth: '재물', career: '일', love: '애정', health: '건강' };
  const monthLines = data.months.map((m) => {
    const tl = data.topics.map((t) => short[t.key] + ' ' + levelOf(t.months[m.month - 1].score)).join(' / ');
    return '- ' + y + '년 ' + m.month + '월: 전체 ' + levelOf(m.score) + ' · 들어오는 기운: ' + comes(m) + ' · ' + tl;
  }).join('\n');
  const top = data.top3.map((t, i) => { const m = data.months[t.month - 1]; return (i + 1) + ') ' + y + '년 ' + t.month + '월 — 들어오는 기운: ' + comes(m); }).join('\n');
  const watchM = data.watch ? data.months[data.watch.month - 1] : null;
  const topicLines = data.topics.map((t) => '- ' + t.label + ': 한 해 ' + levelOf(t.score) + ' · 가장 좋은 달 ' + y + '년 ' + t.best.month + '월' + (t.caution ? ' · 조심할 달 ' + y + '년 ' + t.caution.month + '월' : '')).join('\n');
  const quarterLine = data.quarters.map((q) => q.label + '(' + q.range + ') ' + levelOf(q.avg)).join(' · ');
  const topicRule = (t, extra) => '### ' + t.label + '\n' + range(900, 1100) + '. ' + t.focus + '을 중심으로 쓰세요. 이 주제의 한 해 흐름(' + levelOf(t.score) + '), 가장 좋은 달(' + y + '년 ' + t.best.month + '월)' + (t.caution ? '과 조심할 달(' + y + '년 ' + t.caution.month + '월)' : '') + '을 근거로, 그 달에 무엇을 준비하고 무엇을 미룰지 실제 장면으로 설명하세요. **근거**, **장면**, **해볼 일** 표지를 사용하세요. ' + (extra || '');
  const health = topicOf('health');
  const instructions = [
    ['answer', '### 한 줄 답\n' + range(150, 220) + ', 2~3문장. 첫 문장은 ' + y + '년이 이 사람에게 어떤 해인지 한 줄 결론(한 해 흐름: ' + yearTier(o.score) + '). 둘째 문장에 "12개월 중 흐름이 가장 좋은 달은 ' + y + '년 ' + data.top3[0].month + '월"이라는 사실을 분명히 쓰고, 한 해 동안 붙들 할 일 하나를 덧붙이세요.'],
    ['overall', '### ' + y + ' 총운\n' + range(1300, 1500) + '. 올해 들어오는 기운이 이 사람의 타고난 구조와 어떻게 맞물리는지, 상반기와 하반기 중 어디에 힘이 실리는지(분기 흐름 참고), 올해 가장 큰 기회 하나와 과제 하나를 구체적으로 설명하세요. **근거**, **장면**, **해볼 일** 표지와 짧은 문단을 쓰세요. 월은 절기 기준이라 1월은 아직 지난해의 기운이 남아 있고 새해 기운은 2월 초(입춘)부터 바뀐다는 점을 한 번만 부드럽게 짚으세요.'],
    ['months3', '### 가장 좋은 세 달과 조심할 달\n좋은 세 달 각각 ' + range(330, 400) + ', 조심할 달 ' + range(300, 400) + '. 좋은 세 달은 확정값의 순서대로 각각 "**' + y + '년 N월**" 한 줄로 시작하고, **근거**(그 달에 들어오는 기운과 이 사람의 구조)와 **해볼 일**(그 달에 시작하거나 밀어붙일 일 두 가지)을 쓰세요. 마지막에 "**조심할 달 · ' + y + '년 ' + (data.watch ? data.watch.month : data.top3[2].month) + '월**" 한 줄로 시작해 **근거**와 **점검**(무리하기 쉬운 것 하나와 대신할 선택)을 쓰세요. 조심할 달을 나쁜 달로 겁주지 말고 속도를 조절할 달로 풀어 주세요. 아래 월별 설명과 같은 문장을 복사하지 마세요.'],
    ['wealth', topicRule(topicOf('wealth'), '특정 투자 상품·종목·수익률은 말하지 마세요.')],
    ['career', topicRule(topicOf('career'), '직장인·프리랜서·사업자 어느 쪽이든 읽을 수 있게 장면을 두 가지로 나눠 주세요.')],
    ['love', topicRule(topicOf('love'), '혼자인 사람과 관계 중인 사람 모두 읽을 수 있게 쓰고, 상대의 외모·나이·직업·속마음을 지어내지 마세요.')],
    ['health', '### 건강·생활 리듬\n' + range(800, 1000) + '. 수면·식사·운동·휴식의 리듬과 무리하기 쉬운 시기를 다루세요. 이 주제의 가장 좋은 달(' + y + '년 ' + health.best.month + '월)' + (health.caution ? '과 쉬어 갈 달(' + y + '년 ' + health.caution.month + '월)' : '') + '을 근거로 현실적인 컨디션 관리 방법을 제안하세요. **근거**, **장면**, **해볼 일** 표지를 쓰세요. 병명·진단·치료·약·검사 같은 의학 이야기는 절대 쓰지 말고, 몸이 오래 불편하면 전문가와 상의하라는 말만 한 번 짧게 넣으세요.'],
    ['quarters', '### 분기별 할 것·피할 것\n분기마다 ' + range(250, 300) + ', 합계 ' + range(1000, 1200) + '. 1분기부터 4분기까지 순서대로 각 분기를 "**N분기 · 범위**" 한 줄(예: **1분기 · 1~3월**)로 시작하고, 그 아래 **할 것**(분기 흐름을 근거로 시작할 행동 하나와 시점)과 **피할 것**(무리하기 쉬운 것 하나와 대신할 선택)을 각각 2문장으로 쓰세요.'],
    ['months', '### ' + MONTHS_TITLE + '\n확정값의 12개월 순서(' + y + '년 1월~12월) 그대로 정확히 12줄. 각 줄은 "- ' + y + '년 N월: 내용" 형식입니다. 달마다 ' + range(220, 300) + ', 4~5개의 짧은 문장. **흐름**: 그 달의 기운과 전체·주제 흐름을 연결한 해석. **해볼 일**: 그 달에 맞는 행동 하나. **점검**: 살펴볼 신호나 주의점 하나. 좋은 달과 잔잔한 달의 행동 강도가 달라야 하고, 12줄에 같은 조언을 돌려 쓰지 마세요. 월별 단락 안에는 줄바꿈을 넣지 않습니다.']
  ];
  const requested = options.sectionKeys || SECTION_DEFS.map((d) => d.key);
  const format = instructions.filter(([key]) => (key === 'months' ? options.includeMonths !== false : requested.includes(key))).map(([, text]) => text).join('\n\n');

  return '# ' + y + ' 신년운세 리포트\n\n' +
    '## 확정값 (바꾸거나 새로 만들지 마세요)\n' +
    '- ' + y + '년의 기운: ' + o.ganZhiKo + '(' + o.ganZhi + ')년 · 들어오는 기운: ' + comes(o) + '\n' +
    '- ' + y + '년 한 해 흐름: ' + yearTier(o.score) + ' (전체 ' + levelOf(o.score) + ')\n' +
    dae + '\n' +
    '- 분기 흐름: ' + quarterLine + '\n\n' +
    '12개월 중 흐름이 가장 좋은 세 달 (좋은 순서):\n' + top + '\n' +
    (watchM ? '조심할 달(속도를 조절할 달): ' + y + '년 ' + watchM.month + '월 — 들어오는 기운: ' + comes(watchM) + '\n' : '') + '\n' +
    '주제별 한 해 흐름:\n' + topicLines + '\n\n' +
    '1~12월 흐름 (강함·보통·잔잔함, 월은 절기 기준이라 각 달의 기운은 양력 초순~중순에 바뀝니다):\n' + monthLines + '\n\n' +
    '## 이 사람의 구조\n' + structureLines(engine, data, gender) + '\n\n' +
    '## 이 사람 정보\n이름: ' + (name || '(이름 없음, "고객님"으로 부르기)') + ' / 성별: ' + (gender || '(미상)') + ' / ' + y + '년 기준 ' + data.age + '세\n\n' +
    (options.previous ? '## 이미 쓴 장의 요약 (새 장에서는 같은 설명을 반복하지 마세요)\n' + options.previous + '\n\n' : '') +
    '## 쓰는 형식\n이번 요청에 지정한 소제목만 정확히 이 표기와 순서로 쓰세요. **근거**, **장면**, **해볼 일**, **할 것**, **피할 것**, **점검** 같은 표지는 문장 안에 넣지 말고 한 줄에 표지만 단독으로 쓴 뒤, 다음 줄부터 2~3문장 문단을 쓰세요(월별 상세 흐름은 한 줄 형식 유지). 문단 사이에는 빈 줄을 넣으세요. 각 장과 각 달마다 독자가 꼭 기억할 핵심 구절 1~3곳을 **짧은 구절**(20자 안팎, 한 문장 안에서 열고 닫기)로 굵게 표시하세요. 강조가 하나도 없는 장이 있으면 안 됩니다. 표지 말고는 굵게를 남발하지 마세요. 글자 수는 제목·표지 기호를 뺀, 띄어쓰기를 포함한 본문 기준입니다. 전체 리포트는 약 9,000~14,000자 목표이며, 이번에는 아래 장만 씁니다.\n\n' +
    format;
}

/* ---------- 본문 파싱 ---------- */
const HEADING_RE = /^\s*#{1,6}\s*(.+?)\s*#*\s*$/;
const MONTH_RE = /^\s*(?:[-•*]\s*)?(?:\*\*)?\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(?:\*\*)?\s*[:：]\s*(.+?)\s*$/;
function normalizeHeading(s) {
  return String(s).replace(/\*\*/g, '').replace(/\(.*?\)|（.*?）|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}\s,·]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const sameTitle = (norm, title) => { const t = normalizeHeading(title); return norm === t || norm.startsWith(t + ' '); };
const matchDef = (norm) => SECTION_DEFS.find((d) => [d.title, ...(d.aliases || [])].some((t) => sameTitle(norm, t)));

/** AI 응답 → { sections:[{key,title,text}], monthNotes:[{month, year?, note}] }. 어떤 입력에도 던지지 않는다. */
function parseNewYearText(text) {
  const raw = String(text || '');
  const found = new Map();
  let cur = null, monthLines = null, sawHeading = false;
  for (const line of raw.split('\n')) {
    const h = HEADING_RE.exec(line);
    if (h) {
      sawHeading = true;
      const norm = normalizeHeading(h[1]);
      if (sameTitle(norm, MONTHS_TITLE) || sameTitle(norm, '월별 풀이') || sameTitle(norm, '12개월 상세')) { monthLines = monthLines || []; cur = { months: true }; continue; }
      const def = matchDef(norm);
      if (def) {
        if (!found.has(def.key)) found.set(def.key, { lines: [] });
        cur = found.get(def.key);
        continue;
      }
      // 모르는 하위 제목(예: "#### 2027년 3월")은 버리지 않고 지금 장의 본문에 굵게 붙인다.
      const label = h[1].replace(/\*\*/g, '').trim();
      if (cur && !cur.months && label) cur.lines.push('', '**' + label + '**');
      continue;
    }
    if (!cur) continue;
    if (cur.months) monthLines.push(line); else cur.lines.push(line);
  }
  if (!sawHeading) return { sections: [], monthNotes: [] };
  const sections = SECTION_DEFS.filter((d) => found.has(d.key))
    .map((d) => ({ key: d.key, title: d.title, text: found.get(d.key).lines.join('\n').trim() }))
    .filter((s) => s.text);
  const monthNotes = [];
  const seen = new Set();
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

const ymRe = (y, m) => new RegExp(y + '\\s*년\\s*' + m + '\\s*월(?!\\d)');
const MEDICAL = /(진단|처방|복용|질환|질병|투약)/;

/* 구조·분량·날짜를 검사한다. 개인화의 설득력은 실제 결과 검토가 따로 필요하다. */
function validateNewYearReading(parsed, data, options = {}) {
  const required = SECTION_DEFS.filter((d) => !options.sectionKeys || options.sectionKeys.includes(d.key));
  const have = new Set(parsed.sections.map((s) => s.key));
  const missing = required.filter((d) => !have.has(d.key)).map((d) => d.title);
  if (missing.length) throw new Error('본문에 빠진 장: ' + missing.join(', '));
  const y = data.year;
  const get = (key) => parsed.sections.find((s) => s.key === key);
  const answer = get('answer');
  if (answer && !ymRe(y, data.top3[0].month).test(answer.text)) throw new Error('한 줄 답에 가장 좋은 달(' + y + '년 ' + data.top3[0].month + '월)이 없습니다.');
  for (const def of required) {
    const section = get(def.key);
    if (plainLength(section.text) < MIN_SECTION_CHARS[def.key]) throw new Error(def.title + ': 상세 풀이 분량 부족 (' + plainLength(section.text) + '자, 최소 ' + MIN_SECTION_CHARS[def.key] + '자)');
    if (section.text.split(/\n\s*\n/).some((p) => plainLength(p) > 600)) throw new Error(def.title + ': 긴 문단을 2~3문장씩 나누세요.');
  }
  const m3 = get('months3');
  if (m3) {
    let previous = -1;
    for (const t of data.top3) {
      const match = ymRe(y, t.month).exec(m3.text);
      if (!match || match.index <= previous) throw new Error('가장 좋은 세 달의 날짜 또는 순서가 확정값과 다릅니다.');
      previous = match.index;
    }
    if (data.watch && !ymRe(y, data.watch.month).test(m3.text)) throw new Error('조심할 달(' + y + '년 ' + data.watch.month + '월)이 없습니다.');
  }
  const qs = get('quarters');
  if (qs) {
    let previous = -1;
    for (const q of [1, 2, 3, 4]) {
      const at = qs.text.indexOf(q + '분기');
      if (at < 0 || at <= previous) throw new Error('분기별 할 것·피할 것에 1~4분기가 순서대로 있어야 합니다.');
      previous = at;
    }
  }
  const health = get('health');
  if (health && MEDICAL.test(health.text)) throw new Error('건강·생활 리듬에 의학 표현(진단·처방·질환 등)이 있습니다. 생활 리듬으로만 쓰세요.');
  if (options.includeMonths !== false) {
    if (parsed.monthNotes.length !== 12) throw new Error('월별 상세 풀이가 ' + parsed.monthNotes.length + '개입니다 (12개 필요).');
    parsed.monthNotes.forEach((n, i) => {
      if (n.month !== i + 1 || (n.year != null && n.year !== y)) throw new Error('월별 풀이의 날짜 또는 순서가 확정값과 다릅니다.');
      if (plainLength(n.note) < 160) throw new Error(y + '년 ' + n.month + '월 월별 상세 풀이 분량 부족 (' + plainLength(n.note) + '자, 최소 160자)');
    });
  }
  const seen = new Set();
  const paragraphs = parsed.sections.flatMap((s) => s.text.split(/\n\s*\n/)).concat(options.includeMonths === false ? [] : parsed.monthNotes.map((n) => n.note));
  for (const paragraph of paragraphs) {
    const normalized = paragraph.replace(/[\s*#]/g, '');
    if (normalized.length < 80) continue;
    if (seen.has(normalized)) throw new Error('같은 해설 문단이 반복되었습니다. 중복 없이 다시 작성하세요.');
    seen.add(normalized);
  }
}

/* 강조 보정 — 모델이 장 하나를 통째로 강조 없이 쓰는 일이 있다(연애 상품 2026-10-28 실측). 그런 장은
   '해볼 일'·'할 것' 첫 문장(없으면 첫 본문 문장)을 굵게 해 독자가 가져갈 문장을 표시한다. */
const LABEL_ONLY = /^\*\*(근거|장면|해볼 일|흐름|점검|할 것|피할 것|조심할 달[^*]*|\d분기[^*]*|\d{4}\s*년\s*\d{1,2}\s*월)\*\*\s*[:：]?$/;
function hasHighlight(text) {
  return (String(text).match(/\*\*[^*\n]+?\*\*/g) || []).some((m) => !LABEL_ONLY.test(m));
}
function ensureHighlight(text) {
  if (hasHighlight(text)) return text;
  const paras = String(text).split(/\n\s*\n/);
  const isLabel = (p) => LABEL_ONLY.test(p.trim());
  let at = paras.findIndex((p, i) => i > 0 && /^\*\*(해볼 일|할 것)\*\*\s*[:：]?$/.test(paras[i - 1].trim()) && !isLabel(p));
  if (at < 0) at = paras.findIndex((p) => p.trim() && !isLabel(p));
  if (at < 0) return text;
  const m = /^(\s*(?:[-•]\s+)?)(.+?[.!?])(?=\s|$)/.exec(paras[at]);
  if (!m || m[2].length > 90 || m[2].includes('**')) return text;
  paras[at] = m[1] + '**' + m[2] + '**' + paras[at].slice(m[0].length);
  return paras.join('\n\n');
}

/* 웹 화면·주문 보관용 — "## 장 제목" 덩어리. 화면은 public/love-reading-model.js의 buildPaid가 읽는다
   ("한 줄 답"은 결론 상자, "월별 상세 흐름"은 12개월 고르기로 바뀐다). */
function toPlainText(reading) {
  const parts = (reading.sections || []).map((s) => '## ' + s.title + '\n\n' + s.text.replace(/^\s*#+\s*/gm, ''));
  if (reading.monthNotes && reading.monthNotes.length) {
    parts.push('## ' + MONTHS_TITLE + '\n\n' + reading.monthNotes.map((n) => '- ' + (n.year ? n.year + '년 ' : '') + n.month + '월: ' + n.note).join('\n'));
  }
  return parts.join('\n\n');
}

/**
 * @param {object} opts { generate?: 테스트용 생성 함수 }
 * @returns {{ year, title, data, sections, monthNotes, usage }}
 */
async function generateNewYearReading(engine, person = {}, opts = {}) {
  const generate = opts.generate || generateText;
  const data = buildNewYearData(engine, person);
  const usages = [];
  async function runPart(part, base) {
    const previous = base.map((s) => s.title + ': ' + s.text.replace(/\s+/g, ' ').slice(0, 240)).join('\n');
    const prompt = buildNewYearPrompt(data, engine, person, { ...part, previous });
    let lastError = null, accepted = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const correction = lastError ? '\n\n## 이전 시도 수정 사항\n' + lastError.message + ' 이번 묶음의 지정 장만 다시 작성하세요.' : '';
      let text, usage;
      try {
        ({ text, usage } = await generate(NEWYEAR_SYSTEM_PROMPT, prompt + correction, { maxTokens: 16000 }));
      } catch (e) {
        // 길이 제한으로 잘린 응답만 이 묶음을 다시 만든다. 그 밖의 오류(인증·장애)는 그대로 실패시킨다.
        if (!/max_tokens/.test(e.message)) throw e;
        lastError = new Error('응답이 길이 제한에 걸려 잘렸습니다. 지정 분량 안에서 마무리하세요.');
        continue;
      }
      usages.push(usage);
      const parsed = parseNewYearText(text);
      const selected = { sections: parsed.sections.filter((s) => part.sectionKeys.includes(s.key)), monthNotes: part.includeMonths ? parsed.monthNotes : [] };
      try {
        validateNewYearReading({ sections: [...base, ...selected.sections], monthNotes: selected.monthNotes }, data, part);
        accepted = selected;
        break;
      } catch (e) {
        lastError = e;
        // 다시 만드는 이유만 남긴다(본문·개인정보는 남기지 않는다).
        console.warn('[신년운세] 다시 생성:', part.name, '-', e.message);
      }
    }
    if (!accepted) throw lastError;
    return accepted;
  }
  const [first, ...rest] = GENERATION_PARTS;
  const sections = [], monthNotes = [];
  const firstPart = await runPart(first, []);
  sections.push(...firstPart.sections);
  const others = await Promise.all(rest.map((part) => runPart(part, sections.slice())));
  for (const part of others) { sections.push(...part.sections); monthNotes.push(...part.monthNotes); }
  const ordered = SECTION_DEFS.map((def) => sections.find((s) => s.key === def.key)).map((sec) => (sec.key === 'answer' ? sec : { ...sec, text: ensureHighlight(sec.text) }));
  const parsed = { sections: ordered, monthNotes: monthNotes.map((n) => ({ ...n, year: data.year })) };
  validateNewYearReading(parsed, data);
  return { year: data.year, title: data.year + ' 신년운세', data, ...parsed, usage: sumUsage(usages) };
}

module.exports = {
  YEAR, NEWYEAR_TOPICS, QUARTERS, STRONG, NEWYEAR_SYSTEM_PROMPT, GENERATION_PARTS, MONTHS_TITLE,
  buildNewYearData, buildNewYearPreview, buildNewYearPrompt, parseNewYearText, validateNewYearReading,
  ensureHighlight, toPlainText, generateNewYearReading, sectionDefs, levelOf
};
