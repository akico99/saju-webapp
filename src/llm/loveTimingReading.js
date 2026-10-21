'use strict';
/* 연애 시기 리포트 본문 — LLM 한 번 호출. 숫자(12개월 점수, 상위 세 달)는 엔진(loveTiming.js)이
   정하고 AI는 해석만 한다. 이 상품은 "그래서 언제, 어떤 사람, 뭘 하면 되는지"에 답하는 것이
   핵심이라, 평생사주 계열(systemPrompt.js)의 논문체 대신 수달이 말해 주는 분명한 말투를 쓴다.
   공통 안전 규칙(BASE_RULES)은 그대로 따른다. */
const { BASE_RULES } = require('./baseSystemPrompt');
const { generateText, sumUsage } = require('./client');
const { buildTimingData, tier } = require('./deepReading');
const { SITUATIONS, buildLoveTiming, situationOf, levelOf } = require('../engine/loveTiming');
const { pillarsOf } = require('../engine/freeReadings');

const LOVE_SYSTEM_PROMPT = `당신은 '사주보는 수달'에서 연애 시기 리포트를 쓰는 풀이자입니다. 읽는 사람은 사주를 모르는 20~30대이고, 연애 고민 하나에 분명한 답을 듣고 싶어 돈을 냈습니다.

${BASE_RULES}

## 이 상품만의 원칙
7. **확정값이 유일한 근거입니다.** 전달된 "확정값"과 "연애 구조"에 없는 간지·십신·신살·날짜를 새로 만들지 않습니다.
8. **답부터 말합니다.** 각 장의 첫 문장이 그 장의 답입니다. 배경 설명은 그 뒤에 짧게 붙입니다.
9. **달은 분명하게, 단정은 하지 않습니다.** 확정값의 달을 바꾸지 말고 "12개월 중 인연 신호가 가장 강한 달은 ○월이에요"처럼 비교로 분명히 말합니다. "반드시", "100%", "확실히 생긴다", "이번에 놓치면 끝"처럼 단정하거나 겁주는 말은 쓰지 않습니다.
10. **상대에 대해 지어내지 않습니다.** 상대의 키·외모·나이·직업명·이름, 특정 날짜와 장소를 지어내지 않습니다. 끌리는 사람과 어울리는 사람은 성향·태도·분위기로만 그립니다. 상대의 속마음을 단정하지 않습니다(이 리포트에는 상대의 사주가 없습니다).
11. **말투**: 수달이 고객에게 말하듯 다정하고 분명한 존댓말("~해요", "~예요"). 명리학 논문체, 같은 말의 반복, "노력하세요" 같은 빈 조언을 쓰지 않습니다. 행동 조언은 장면이 그려질 만큼 구체적으로 씁니다.
12. 마크다운은 소제목(###), 굵게(**...**), 불릿(-)만 씁니다.`;

// 십신 묶음을 처음 보는 사람에게 설명할 때 쓸 쉬운 말.
const GROUP_PLAIN = {
  비겁: '나와 같은 편의 기운: 친구·동료·경쟁',
  식상: '표현하고 드러내는 기운: 말·재능·애정 표현',
  재성: '재물의 기운, 남성에게는 연인을 뜻하는 별',
  관성: '규칙과 책임의 기운, 여성에게는 연인을 뜻하는 별',
  인성: '배움과 보살핌의 기운: 기대고 보살피는 마음'
};
const SHIPSIN_GROUP_OF = {
  비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성', 정재: '재성',
  편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성'
};
const PILLAR_KO = { year: '연주', month: '월주', day: '일주(배우자 자리)', hour: '시주' };

const SITUATION_GUIDE = {
  single: '지금 혼자입니다. "인연 신호가 강한 달"은 새 인연이 시작되기 좋은 달로 풀어 주세요.',
  some: '지금 썸을 타고 있습니다. "인연 신호가 강한 달"은 썸이 연애로 넘어가기 좋은 달로 풀어 주세요. 상대가 나를 어떻게 생각하는지는 단정하지 마세요.',
  dating: '지금 연애 중입니다. "인연 신호가 강한 달"은 지금 관계가 깊어지기 좋은 달로 풀어 주세요. 새 인연을 찾으라는 말은 하지 마세요.',
  breakup: '지금 이별을 겪은 뒤입니다. "인연 신호가 강한 달"은 마음이 정리되고 연애 흐름이 다시 살아나는 달로 풀어 주세요. 재회를 권하거나 말리지 않고, 다시 연락할지는 본인이 정할 일이라고 분명히 해 주세요. 이 리포트는 상대의 사주 없이 본인의 흐름만 본다는 점을 한 번만 짧게 밝혀 주세요.'
};

function sectionDefs(situationKey) {
  const s = SITUATIONS[situationKey] || SITUATIONS.single;
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

const monthLabel = (m) => `${m.year}년 ${m.month}월`;
const groupText = (shipsin) => {
  const g = SHIPSIN_GROUP_OF[shipsin];
  return shipsin ? `${shipsin}(${g ? GROUP_PLAIN[g] : '중립'})` : '-';
};

function loveStructure(engine, gender) {
  const pillars = pillarsOf(engine);
  const hourKnown = pillars.includes('hour');
  const day = engine.manse.day;
  const lines = [];
  lines.push(`- 일간(나를 뜻하는 글자): ${engine.ilgan.char}(${engine.ilgan.ko}, ${engine.ilgan.ohaeng})`);
  lines.push(`- 배우자 자리(일지): ${day.branch}(${day.branchKo}) · 십신 ${groupText(day.branchShipsinKo)} · 12운성 ${day.unseong || '-'} · 신살 ${(day.shinsals || []).map((s) => s.replace(/\(.*?\)/g, '')).join('·') || '없음'}`);

  const rel = [];
  const hc = engine.hapchung || {};
  const touchesDay = (r) => Array.isArray(r.pillars) && r.pillars.includes('day') && r.pillars.every((p) => pillars.includes(p));
  for (const r of hc.yukhap || []) if (touchesDay(r)) rel.push(`${r.pillars.map((p) => PILLAR_KO[p]).join('-')} 육합(서로 끌어당기는 관계) ${r.branches.join('')}`);
  for (const r of hc.chung || []) if (touchesDay(r)) rel.push(`${r.pillars.map((p) => PILLAR_KO[p]).join('-')} 충(서로 부딪치는 관계) ${r.branches.join('')}`);
  lines.push(`- 배우자 자리와 맺은 관계: ${rel.join(', ') || '눈에 띄는 합·충 없음'}`);

  const groups = (engine.counts && engine.counts.shipsinGroup) || {};
  const loveStar = gender === '남' ? '재성' : '관성';
  lines.push(`- 연인의 별(${gender === '남' ? '남성은 재성' : '여성은 관성'}) 개수: ${groups[loveStar] ?? 0}개`);
  lines.push(`- 표현의 별(식상) 개수: ${groups['식상'] ?? 0}개 / 나와 같은 편(비겁) ${groups['비겁'] ?? 0}개 / 보살핌(인성) ${groups['인성'] ?? 0}개`);

  const charmNames = new Set();
  for (const key of pillars) for (const s of engine.manse[key].shinsals || []) {
    const n = s.replace(/\(.*?\)/g, '');
    if (['도화살', '홍염살', '화개살', '역마살', '장성살', '반안살'].includes(n)) charmNames.add(n);
  }
  lines.push(`- 매력 신살: ${[...charmNames].join('·') || '없음'}`);
  lines.push(`- 기운의 세기: ${engine.strength.verdict} / 도움이 되는 오행(용신): ${engine.yongshin.final.main}`);
  if (!hourKnown) lines.push('- 태어난 시각 모름: 시주는 근거로 쓰지 마세요. 별 개수에는 정오로 가정한 시주가 섞여 있어 대략으로만 보세요.');
  return lines.join('\n');
}

function buildLovePrompt(engine, person, situationKey, timing, now = new Date()) {
  const situation = situationOf(situationKey);
  const defs = sectionDefs(situationKey);
  const gender = person.gender || engine.meta.input.gender;
  let daewoonLine = '- 지금 대운(10년 단위 큰 흐름): 자료 없음';
  try {
    const t = buildTimingData(engine, now, { topicKey: 'intro', gender });
    if (t.current) daewoonLine = `- 지금 대운(10년 단위 큰 흐름): ${t.current.ganZhiKo} 대운, ${tier(t.current.score)}`;
  } catch (e) { /* 대운이 없어도 나머지로 쓴다 */ }

  const top = timing.top3.map((m, i) => `${i + 1}) ${monthLabel(m)} ${m.ganZhiKo}월 — 천간 ${groupText(m.stemShipsin)}, 지지 ${groupText(m.branchShipsin)}`).join('\n');
  const months = timing.months.map((m) => `- ${monthLabel(m)}: ${levelOf(m.score)} · 천간 ${m.stemShipsin || '-'} · 지지 ${m.branchShipsin || '-'}`).join('\n');
  const monthNums = timing.months.map((m) => m.month + '월').join(', ');

  return `# 연애 시기 리포트

## 지금 상황
${situation.label}. ${SITUATION_GUIDE[situationKey]}

## 확정값 (바꾸거나 새로 만들지 마세요)
인연 신호가 가장 강한 세 달 (강한 순서):
${top}

앞으로 12개월 흐름 (강함·보통·잔잔함):
${months}
${daewoonLine}

## 이 사람의 연애 구조
${loveStructure(engine, gender)}

## 이 사람 정보
이름: ${person.name || '(이름 없음, "고객님"으로 부르기)'} / 성별: ${gender || '(미상)'}

## 쓰는 형식
아래 소제목을 정확히 이 표기와 순서로 쓰고, 그 밖의 제목이나 머리말은 쓰지 마세요.

### ${defs[0].title}
2~3문장. 첫 문장에 "12개월 중 인연 신호가 가장 강한 달은 ${monthLabel(timing.top3[0])}"이라는 사실을 분명히 쓰고, 그때 할 일 하나를 덧붙이세요.

### ${defs[1].title}
세 문단. 각 문단은 "**YYYY년 M월**"로 시작하고 확정값의 강한 순서를 따르세요. 문단마다 350~450자: 그 달의 기운이 연애에 어떻게 작용하는지(쉬운 말로), 그 달에 해 볼 일 두 가지.

### ${defs[2].title}
400~500자. 일간의 성정과 매력 신살을 근거로, 어떤 사람이 이 사람에게 끌리고 이 사람의 어떤 모습에 끌리는지.

### ${defs[3].title}
400~500자. 배우자 자리와 연인의 별을 근거로, 이 사람이 끌리는 사람과 실제로 편안하게 오래 가는 사람의 성향. 둘이 다르면 그 차이를 짚으세요.

### ${defs[4].title}
300~400자. 매력 신살, 배우자 자리의 관계, 강한 세 달의 기운을 근거로 만남이 생기기 쉬운 자리를 일상 범주(지인 소개, 일터, 모임·취미, 새로운 장소 등)로만 쓰세요.

### ${defs[5].title}
400~500자. 기운의 세기와 별의 많고 적음, 배우자 자리의 충을 근거로 연애에서 되풀이되기 쉬운 장면과 그 장면에서 바꿔 볼 행동.

### ${defs[6].title}
불릿 3개. 각 불릿은 "어떤 신호인지 — 왜 이 사람에게 조심할 신호인지"를 한 줄로.

### ${defs[7].title}
400~500자. 지금 상황에 맞춘 구체적인 행동 3가지를 순서대로.

### 월별 한 줄
확정값의 12개월 순서 그대로 정확히 12줄. 각 줄은 "- N월: 한 줄" 형식(N은 ${monthNums} 순서의 월 숫자). 40자 안팎으로, 강한 달과 잔잔한 달의 말투 차이가 드러나게 쓰세요.`;
}

function normalizeHeading(s) {
  return s.replace(/[*:：]/g, '').replace(/\s+/g, ' ').trim();
}

function parseLoveText(text, situationKey) {
  const defs = sectionDefs(situationKey);
  const byTitle = new Map(defs.map((d) => [normalizeHeading(d.title), d]));
  const found = new Map();
  let monthsRaw = '';
  const parts = String(text || '').split(/^###[ \t]*/m);
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const heading = normalizeHeading(nl === -1 ? part : part.slice(0, nl));
    const body = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    if (heading === '월별 한 줄') { monthsRaw = body; continue; }
    const def = byTitle.get(heading);
    if (def && body && !found.has(def.key)) found.set(def.key, { key: def.key, title: def.title, text: body });
  }
  const sections = defs.filter((d) => found.has(d.key)).map((d) => found.get(d.key));
  if (!sections.length && !monthsRaw) {
    const whole = String(text || '').trim();
    return { sections: whole ? [{ key: 'body', title: '풀이', text: whole }] : [], monthNotes: [] };
  }
  const monthNotes = [];
  const seen = new Set();
  for (const line of monthsRaw.split('\n')) {
    const m = /^\s*(?:[-•*]\s*)?(\d{1,2})\s*월\s*[:：]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const month = Number(m[1]);
    if (month < 1 || month > 12 || seen.has(month)) continue;
    seen.add(month);
    monthNotes.push({ month, note: m[2] });
  }
  return { sections, monthNotes };
}

function toPlainText(reading) {
  const parts = reading.sections.map((s) => `## ${s.title}\n\n${s.text}`);
  if (reading.monthNotes && reading.monthNotes.length) {
    parts.push(`## 앞으로 12개월\n\n${reading.monthNotes.map((n) => `- ${n.month}월: ${n.note}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/** @returns {{ title, situationKey, timing, sections, monthNotes, usage }} */
async function generateLoveReading(engine, person, situationKey, now = new Date()) {
  situationOf(situationKey);
  const gender = person.gender || engine.meta.input.gender;
  const timing = buildLoveTiming(engine, gender, now);
  const prompt = buildLovePrompt(engine, person, situationKey, timing, now);
  const { text, usage } = await generateText(LOVE_SYSTEM_PROMPT, prompt, { maxTokens: 9000 });
  const parsed = parseLoveText(text, situationKey);
  if (!parsed.sections.length) throw new Error('연애 시기 리포트 본문이 비어 있습니다.');
  return { title: '연애 시기 리포트', situationKey, timing, ...parsed, usage: sumUsage([usage]) };
}

module.exports = { LOVE_SYSTEM_PROMPT, buildLovePrompt, parseLoveText, toPlainText, generateLoveReading, sectionDefs };
