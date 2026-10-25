'use strict';
/* 연애 시기 리포트 본문 — LLM 한 번 호출(불완전하면 한 번 더). 숫자(12개월 점수, 상위 세 달)는
   엔진(loveTiming.js)이 정하고 AI는 해석만 한다. 이 상품은 "그래서 언제, 어떤 사람, 뭘 하면 되는지"에
   답하는 것이 핵심이라, 평생사주 계열(systemPrompt.js)의 논문체 대신 수달이 말해 주는 분명한 말투를
   쓴다. 공통 안전 규칙(BASE_RULES)은 그대로 따른다.

   근거 자료는 처음부터 쉬운 말로 넘긴다 — 십신 이름(겁재·편관…), 12운성, 간지월 이름을 그대로 주면
   모델이 그 용어를 본문에 옮겨 적어 공통 원칙 3(전문용어 금지)을 어기기 쉽다. */
const { BASE_RULES } = require('./baseSystemPrompt');
const { generateText, sumUsage } = require('./client');
const { buildTimingData, tier } = require('./deepReading');
const { SITUATIONS, buildLoveTiming, situationOf, levelOf } = require('../engine/loveTiming');
const { pillarsOf } = require('../engine/freeReadings');

const LOVE_SYSTEM_PROMPT = `당신은 '사주보는 수달'에서 연애 시기 리포트를 쓰는 풀이자입니다. 읽는 사람은 사주를 모르는 20~30대이고, 연애 고민 하나에 분명한 답을 듣고 싶어 돈을 냈습니다.

${BASE_RULES}

## 이 상품만의 원칙
7. **확정값이 유일한 근거입니다.** 전달된 "확정값"과 "연애 구조"에 없는 사실·날짜를 새로 만들지 않습니다.
8. **답부터 말합니다.** 각 장의 첫 문장이 그 장의 답입니다. 배경 설명은 그 뒤에 짧게 붙입니다.
9. **달은 분명하게, 단정은 하지 않습니다.** 확정값의 달을 바꾸지 말고 "12개월 중 인연 신호가 가장 강한 달은 ○월이에요"처럼 비교로 분명히 말합니다. "반드시", "100%", "확실히 생긴다", "이번에 놓치면 끝"처럼 단정하거나 겁주는 말은 쓰지 않습니다.
10. **상대에 대해 지어내지 않습니다.** 상대의 키·외모·나이·직업명·이름, 특정 날짜와 장소를 지어내지 않습니다. 끌리는 사람과 어울리는 사람은 성향·태도·분위기로만 그립니다. 상대의 속마음을 단정하지 않습니다(이 리포트에는 상대의 사주가 없습니다).
11. **말투**: 관계를 차분히 읽어 주는 안내자처럼 다정하고 분명한 존댓말("~해요", "~예요"). 귀여운 말투, 과한 감탄, 명리학 논문체, 같은 말의 반복, "노력하세요" 같은 빈 조언을 쓰지 않습니다. 각 장은 핵심 해석, 사주에서 읽은 근거, 일상에서 해 볼 행동 순서로 쓰고, 행동 조언은 장면이 그려질 만큼 구체적으로 씁니다.
12. 소제목은 지정된 것만 "### "로 씁니다. 그 밖에 제목 기호(#)는 쓰지 않고, 강조는 굵게(**...**), 목록은 불릿(-)만 씁니다.`;

const SHIPSIN_GROUP_OF = {
  비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성', 정재: '재성',
  편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성'
};
// 십신 묶음의 쉬운 말. 연인을 뜻하는 별은 성별에 따라 다르다(여성 관성, 남성 재성).
function groupPlain(group, gender) {
  if (group === '관성') return gender === '여' ? '연인을 뜻하는 별(규칙과 책임의 기운이기도 함)' : '규칙과 책임의 기운';
  if (group === '재성') return gender === '남' ? '연인을 뜻하는 별(재물의 기운이기도 함)' : '재물과 현실 감각의 기운';
  return {
    비겁: '나와 같은 편의 기운(친구·동료·경쟁)',
    식상: '표현하고 드러내는 기운(말·재능·애정 표현)',
    인성: '배움과 보살핌의 기운'
  }[group] || '중립적인 기운';
}
const shipsinPlain = (shipsin, gender) => groupPlain(SHIPSIN_GROUP_OF[shipsin], gender);

const PILLAR_PLAIN = { year: '어린 시절·집안 자리', month: '부모·사회 자리', day: '배우자 자리', hour: '자녀·말년 자리' };
const CHARM_PLAIN = {
  도화살: '눈길을 끄는 매력(도화)', 홍염살: '은근한 끌림의 매력(홍염)', 화개살: '깊이와 감성의 매력(화개)',
  역마살: '움직이고 새로운 곳을 찾는 기운(역마)', 장성살: '앞에서 이끄는 기운(장성)', 반안살: '품격 있는 안정감(반안)'
};
const STRENGTH_PLAIN = { 신강: '스스로의 기운이 센 편', 신약: '스스로의 기운이 여린 편', 중화: '기운이 고르게 맞춰진 편' };
const OHAENG_PLAIN = { 木: '나무(木)', 火: '불(火)', 土: '흙(土)', 金: '쇠(金)', 水: '물(水)' };

const SITUATION_GUIDE = {
  single: '지금 혼자입니다. "인연 신호가 강한 달"은 새 인연이 시작되기 좋은 달로 풀어 주세요.',
  some: '지금 썸을 타고 있습니다. "인연 신호가 강한 달"은 썸이 연애로 넘어가기 좋은 달로 풀어 주세요. 상대가 나를 어떻게 생각하는지는 단정하지 마세요.',
  dating: '지금 연애 중입니다. "인연 신호가 강한 달"은 지금 관계가 깊어지기 좋은 달로 풀어 주세요. 새 인연을 찾으라는 말은 하지 마세요.',
  breakup: '지금 이별을 겪은 뒤입니다. "인연 신호가 강한 달"은 마음이 정리되고 연애 흐름이 다시 살아나는 달로 풀어 주세요. 재회를 권하거나 말리지 않고, 다시 연락할지는 본인이 정할 일이라고 분명히 해 주세요. 이 리포트는 상대의 사주 없이 본인의 흐름만 본다는 점을 한 번만 짧게 밝혀 주세요.'
};

function sectionDefs(situationKey) {
  const s = Object.prototype.hasOwnProperty.call(SITUATIONS, situationKey) ? SITUATIONS[situationKey] : SITUATIONS.single;
  return [
    { key: 'answer', title: '한 줄 답' },
    { key: 'top', title: '인연 신호가 강한 세 달' },
    { key: 'drawn', title: '나에게 끌리는 사람' },
    { key: 'draws', title: '내가 끌리는 사람' },
    { key: 'where', title: '만남이 생기기 쉬운 자리' },
    { key: 'pattern', title: '반복되기 쉬운 연애 패턴' },
    { key: 'caution', title: '조심할 인연의 신호' },
    { key: 'action', title: s.actionTitle }
  ];
}
const MONTHS_TITLE = '월별 한 줄';

const monthLabel = (m) => `${m.year}년 ${m.month}월`;
// 이름은 자유 입력이라 줄바꿈·제어문자·마크다운 기호로 프롬프트 구조를 흉내 낼 수 있다. 글자만 남긴다.
const cleanName = (name) => String(name || '').replace(/[\u0000-\u001f\u007f#*<>\[\]`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);

function loveStructure(engine, gender) {
  const pillars = pillarsOf(engine);
  const day = engine.manse.day;
  const lines = [];
  lines.push(`- 나를 뜻하는 글자(일간): ${engine.ilgan.char}, ${OHAENG_PLAIN[engine.ilgan.ohaeng] || engine.ilgan.ohaeng}의 성질`);
  lines.push(`- 배우자 자리(일지 ${day.branch})에 든 기운: ${shipsinPlain(day.branchShipsinKo, gender)}`);

  const rel = [];
  const hc = engine.hapchung || {};
  const otherOf = (r) => r.pillars.find((p) => p !== 'day');
  const touchesDay = (r) => Array.isArray(r.pillars) && r.pillars.includes('day') && r.pillars.every((p) => pillars.includes(p));
  for (const r of hc.yukhap || []) if (touchesDay(r)) rel.push(`${PILLAR_PLAIN[otherOf(r)]}와 서로 끌어당기는 관계`);
  for (const r of hc.chung || []) if (touchesDay(r)) rel.push(`${PILLAR_PLAIN[otherOf(r)]}와 서로 부딪치는 관계`);
  lines.push(`- 배우자 자리가 맺은 관계: ${rel.join(', ') || '눈에 띄게 끌어당기거나 부딪치는 관계 없음'}`);

  const groups = (engine.counts && engine.counts.shipsinGroup) || {};
  const loveStar = gender === '남' ? '재성' : '관성';
  lines.push(`- 연인을 뜻하는 별의 개수: ${groups[loveStar] ?? 0}개`);
  lines.push(`- 표현하고 드러내는 기운 ${groups['식상'] ?? 0}개 / 나와 같은 편의 기운 ${groups['비겁'] ?? 0}개 / 배움과 보살핌의 기운 ${groups['인성'] ?? 0}개`);

  const charm = new Set();
  for (const key of pillars) for (const s of engine.manse[key].shinsals || []) {
    const n = s.replace(/\(.*?\)/g, '');
    if (CHARM_PLAIN[n]) charm.add(CHARM_PLAIN[n]);
  }
  lines.push(`- 매력의 표지: ${[...charm].join(', ') || '눈에 띄는 표지 없음'}`);
  lines.push(`- 타고난 기운의 세기: ${STRENGTH_PLAIN[engine.strength.verdict] || '보통'} / 도움이 되는 기운: ${OHAENG_PLAIN[engine.yongshin.final.main] || engine.yongshin.final.main}`);
  if (!pillars.includes('hour')) lines.push('- 태어난 시각 모름: 자녀·말년 자리는 근거로 쓰지 마세요. 별 개수에는 정오로 가정한 값이 섞여 있어 대략으로만 보세요.');
  return lines.join('\n');
}

function buildLovePrompt(engine, person, situationKey, timing, now = new Date()) {
  const situation = situationOf(situationKey);
  const defs = sectionDefs(situationKey);
  const gender = person.gender || engine.meta.input.gender;
  const name = cleanName(person.name);
  let flowLine = '- 지금 10년 단위 큰 흐름: 자료 없음';
  try {
    const t = buildTimingData(engine, now, { topicKey: 'intro', gender });
    if (t.current) flowLine = `- 지금 10년 단위 큰 흐름: ${tier(t.current.score)}`;
  } catch (e) { /* 큰 흐름이 없어도 나머지로 쓴다 */ }

  const comes = (m) => `${shipsinPlain(m.stemShipsin, gender)}, ${shipsinPlain(m.branchShipsin, gender)}`;
  const top = timing.top3.map((m, i) => `${i + 1}) ${monthLabel(m)} — 들어오는 기운: ${comes(m)}`).join('\n');
  const months = timing.months.map((m) => `- ${monthLabel(m)}: ${levelOf(m.score)} · 들어오는 기운: ${comes(m)}`).join('\n');
  const monthNums = timing.months.map((m) => m.month + '월').join(', ');

  return `# 연애 시기 리포트

## 지금 상황
${situation.label}. ${SITUATION_GUIDE[situationKey]}

## 확정값 (바꾸거나 새로 만들지 마세요)
인연 신호가 가장 강한 세 달 (강한 순서):
${top}

앞으로 12개월 흐름 (강함·보통·잔잔함):
${months}
${flowLine}

## 이 사람의 연애 구조
${loveStructure(engine, gender)}

## 이 사람 정보
이름: ${name || '(이름 없음, "고객님"으로 부르기)'} / 성별: ${gender || '(미상)'}

## 쓰는 형식
아래 소제목을 정확히 이 표기와 순서로 쓰고, 그 밖의 제목이나 머리말은 쓰지 마세요.

### ${defs[0].title}
2~3문장. 첫 문장에 "12개월 중 인연 신호가 가장 강한 달은 ${monthLabel(timing.top3[0])}"이라는 사실을 분명히 쓰고, 그때 할 일 하나를 덧붙이세요.

### ${defs[1].title}
세 문단. 각 문단은 "**YYYY년 M월**"로 시작하고 확정값의 강한 순서를 따르세요(소제목으로 쓰지 말고 문단 첫머리에 굵게). 문단마다 350~450자: 그 달에 들어오는 기운이 연애에 어떻게 작용하는지, 그 달에 해 볼 일 두 가지.

### ${defs[2].title}
400~500자. 나를 뜻하는 글자의 성질과 매력의 표지를 근거로, 어떤 사람이 이 사람에게 끌리고 이 사람의 어떤 모습에 끌리는지.

### ${defs[3].title}
400~500자. 배우자 자리에 든 기운과 연인을 뜻하는 별을 근거로, 이 사람이 끌리는 사람과 실제로 편안하게 오래 가는 사람의 성향. 둘이 다르면 그 차이를 짚으세요.

### ${defs[4].title}
300~400자. 매력의 표지, 배우자 자리가 맺은 관계, 강한 세 달에 들어오는 기운을 근거로 만남이 생기기 쉬운 자리를 일상 범주(지인 소개, 일터, 모임·취미, 새로운 장소 등)로만 쓰세요.

### ${defs[5].title}
400~500자. 타고난 기운의 세기와 별의 많고 적음, 배우자 자리가 부딪치는 관계를 근거로 연애에서 되풀이되기 쉬운 장면과 그 장면에서 바꿔 볼 행동.

### ${defs[6].title}
불릿 3개. 각 불릿은 "어떤 신호인지 — 왜 이 사람에게 조심할 신호인지"를 한 줄로.

### ${defs[7].title}
400~500자. 지금 상황에 맞춘 구체적인 행동 3가지를 순서대로.

### ${MONTHS_TITLE}
확정값의 12개월 순서 그대로 정확히 12줄. 각 줄은 "- N월: 한 줄" 형식(N은 ${monthNums} 순서의 월 숫자). 40자 안팎으로, 강한 달과 잔잔한 달의 말투 차이가 드러나게 쓰세요.`;
}

/* ---------- 본문 파싱 ---------- */
const HEADING_RE = /^\s*#{1,6}\s*(.+?)\s*#*\s*$/;
const MONTH_RE = /^\s*(?:[-•*]\s*)?(?:\*\*)?\s*(?:\d{4}\s*년\s*)?(\d{1,2})\s*월\s*(?:\*\*)?\s*[:：]\s*(.+?)\s*$/;

// "1. 한 줄 답", "💌 인연 신호가 강한 세 달 (강한 순서)", "나에게 끌리는 사람:" → 비교용 제목
function normalizeHeading(s) {
  return String(s)
    .replace(/\*\*/g, '')
    .replace(/\(.*?\)|（.*?）|\[.*?\]/g, ' ')
    .replace(/[^\p{L}\p{N}\s,·]/gu, ' ')
    .replace(/^\s*\d+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
const sameTitle = (norm, title) => {
  const t = normalizeHeading(title);
  return norm === t || norm.startsWith(t + ' ');
};

function parseLoveText(text, situationKey) {
  const defs = sectionDefs(situationKey);
  const raw = String(text || '');
  const found = new Map();
  let cur = null;
  let monthLines = null;
  let sawHeading = false;
  for (const line of raw.split('\n')) {
    const h = HEADING_RE.exec(line);
    if (h) {
      sawHeading = true;
      const norm = normalizeHeading(h[1]);
      if (sameTitle(norm, MONTHS_TITLE)) { monthLines = monthLines || []; cur = { months: true }; continue; }
      const def = defs.find((d) => sameTitle(norm, d.title));
      if (def) {
        if (!found.has(def.key)) found.set(def.key, { key: def.key, title: def.title, lines: [] });
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

  const sections = defs.filter((d) => found.has(d.key))
    .map((d) => ({ key: d.key, title: d.title, text: found.get(d.key).lines.join('\n').trim() }))
    .filter((s) => s.text);
  if (!sawHeading || (!sections.length && !monthLines)) {
    const whole = raw.trim();
    return { sections: whole ? [{ key: 'body', title: '풀이', text: whole.replace(/^\s*#+\s*/gm, '') }] : [], monthNotes: [] };
  }

  const monthNotes = [];
  const seen = new Set();
  for (const line of monthLines || []) {
    const m = MONTH_RE.exec(line);
    if (!m) continue;
    const month = Number(m[1]);
    if (month < 1 || month > 12 || seen.has(month)) continue;
    seen.add(month);
    monthNotes.push({ month, note: m[2].replace(/^\*\*\s*|\s*\*\*$/g, '') });
  }
  return { sections, monthNotes };
}

/* 판매 가능한 본문인지 — 장이 빠지거나, 월별 한 줄이 12개가 아니거나, 한 줄 답에 1위 달이 없으면
   손님이 산 것(가장 강한 세 달과 장별 풀이)을 받지 못한 것이다. 이때는 완료 처리하지 않는다. */
function validateLoveReading(parsed, timing, situationKey) {
  const have = new Set(parsed.sections.map((s) => s.key));
  const missing = sectionDefs(situationKey).filter((d) => !have.has(d.key)).map((d) => d.title);
  if (missing.length) throw new Error('본문에 빠진 장: ' + missing.join(', '));
  if (parsed.monthNotes.length < 12) throw new Error(`월별 한 줄이 ${parsed.monthNotes.length}줄뿐입니다.`);
  const top = timing.top3[0];
  const answer = parsed.sections.find((s) => s.key === 'answer');
  if (!new RegExp(top.year + '\\s*년\\s*' + top.month + '\\s*월').test(answer.text)) {
    throw new Error(`한 줄 답에 가장 강한 달(${monthLabel(top)})이 없습니다.`);
  }
}

function toPlainText(reading) {
  const parts = reading.sections.map((s) => `## ${s.title}\n\n${s.text.replace(/^\s*#+\s*/gm, '')}`);
  if (reading.monthNotes && reading.monthNotes.length) {
    parts.push(`## 앞으로 12개월\n\n${reading.monthNotes.map((n) => `- ${n.month}월: ${n.note}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * @param {object} opts { startYm?: '2026-11' 무료 첫 장에서 받은 시작 달, generate?: 테스트용 생성 함수 }
 * @returns {{ title, situationKey, timing, sections, monthNotes, usage }}
 */
async function generateLoveReading(engine, person, situationKey, now = new Date(), opts = {}) {
  situationOf(situationKey);
  const generate = opts.generate || generateText;
  const gender = person.gender || engine.meta.input.gender;
  const timing = buildLoveTiming(engine, gender, now, { startYm: opts.startYm });
  const prompt = buildLovePrompt(engine, person, situationKey, timing, now);
  const usages = [];
  let lastError = null;
  // 불완전한 본문은 한 번만 다시 만든다. 두 번째도 불완전하면 실패 → 주문 오류·환불(호출한 쪽).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usage } = await generate(LOVE_SYSTEM_PROMPT, prompt, { maxTokens: 12000 });
    usages.push(usage);
    const parsed = parseLoveText(text, situationKey);
    try {
      validateLoveReading(parsed, timing, situationKey);
      return { title: '연애 시기 리포트', situationKey, timing, ...parsed, usage: sumUsage(usages) };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

module.exports = { LOVE_SYSTEM_PROMPT, buildLovePrompt, parseLoveText, validateLoveReading, toPlainText, generateLoveReading, sectionDefs };

