'use strict';
/* 연애 시기 리포트 본문 — 관계·시기/행동·월별 세 묶음으로 생성(실패한 묶음만 한 번 재시도). 숫자(12개월 점수, 상위 세 달)는
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
12. **읽는 호흡**: 한 문단은 2~3문장으로, 문단 사이에는 빈 줄을 넣습니다. 설명 하나를 400자 이상의 벽처럼 붙이지 마세요. 본문은 **근거**, **장면**, **해볼 일**처럼 짧은 굵은 표지로 구분하고 각 표지 뒤에는 다른 정보를 줍니다. 예시 대화는 예시임을 밝히고, 독자가 실제로 했던 말처럼 꾸미지 않습니다. 분량을 채우려고 같은 결론이나 격려를 되풀이하지 마세요.
13. 소제목은 지정된 것만 "### "로 씁니다. 그 밖에 제목 기호(#)는 쓰지 않고, 강조는 굵게(**...**), 목록은 불릿(-)만 씁니다.`;

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
const MONTHS_TITLE = '월별 상세 흐름';
const FOCUS_GUIDE = Object.freeze({
  person: '서로 끌리는 지점과 오래 편안한 관계의 차이를 우선 설명하세요. 실제로 확인할 태도와 질문을 제시하세요.',
  timing: '월별 준비·시도·점검의 차이를 우선 설명하세요. 달의 순위나 계산을 바꾸지 마세요.',
  pattern: '반복되는 장면의 시작 신호, 본인의 반응, 다른 선택을 우선 설명하세요. 과거 경험을 사실로 단정하지 마세요.',
  action: '현재 상황에서 이번 주 해볼 일, 대화 예시, 상대 반응에 따라 멈추거나 이어갈 기준을 우선 설명하세요.'
});
const normalizeReadingFocus = value => typeof value === 'string' && Object.prototype.hasOwnProperty.call(FOCUS_GUIDE, value) ? value : '';
// 생성 목표보다 낮은 하한: 제목만 갖춘 얇은 결과를 완료 처리하지 않는다.
const MIN_SECTION_CHARS = Object.freeze({ answer: 80, top: 1400, drawn: 750, draws: 850, where: 600, pattern: 850, caution: 600, action: 850 });
// 본문 글자 수는 띄어쓰기를 포함해 센다(사람이 읽는 분량 기준). 표지 기호만 뺀다.
const plainLength = text => String(text || '').replace(/[*#]/g, '').replace(/\s+/g, ' ').trim().length;
/* 분량 보정 — 모델은 요청한 글자 수의 약 65%를 쓴다(promptBuilder.js의 2026-09 실측과 같은 경향,
   2026-10-28 연애 리포트 실제 생성에서도 같은 장이 반복해서 짧았다). 요청 숫자만 키우고 검수 기준은 그대로 둔다. */
const ASK_RATIO = 1.5;
const ask = n => Math.round(n * ASK_RATIO / 50) * 50;
const range = (lo, hi) => ask(lo) + '~' + ask(hi) + '자';
const GENERATION_PARTS = Object.freeze([
  { name: '관계의 구조', sectionKeys: ['answer', 'drawn', 'draws', 'where'], includeMonths: false },
  // 한 요청에 네 장을 몰면 마지막 장(지금 할 일)이 짧아져 묶음 전체를 다시 만들었다(2026-10-28 실측). 두 요청으로 나눠 동시에 만든다.
  { name: '시기와 패턴', sectionKeys: ['top', 'pattern'], includeMonths: false },
  { name: '신호와 행동', sectionKeys: ['caution', 'action'], includeMonths: false },
  { name: '12개월 상세 흐름', sectionKeys: [], includeMonths: true }
]);

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

function buildLovePrompt(engine, person, situationKey, timing, now = new Date(), options = {}) {
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
  const monthNums = timing.months.map(monthLabel).join(', ');
  const focus = normalizeReadingFocus(options.readingFocus);
  const instructions = [
    ['answer', `### ${defs[0].title}
${range(150, 220)}, 2~3문장. 첫 문장에 "12개월 중 인연 신호가 가장 강한 달은 ${monthLabel(timing.top3[0])}"이라는 사실을 분명히 쓰고, 지금 상황의 핵심 선택과 할 일 하나를 덧붙이세요.`],
    ['top', `### ${defs[1].title}
세 달 각각 ${range(650, 800)}, 합계 ${range(1950, 2400)}. 각 달은 "**YYYY년 M월**"로 시작하고 확정값의 강한 순서를 따르세요. 달마다 **근거**, **장면**, **해볼 일** 표지와 짧은 문단을 사용하세요. 서로 다른 두 기운의 작용, 현재 관계 상황에서의 기회와 주의점, 시도할 일 두 가지와 반응을 확인할 기준을 다룹니다. 아래 월별 설명과 같은 문장을 복사하지 마세요.`],
    ['drawn', `### ${defs[2].title}
${range(1000, 1200)}. 일간의 성질과 매력의 표지에서 읽는 매력, 그것이 잘 드러나는 장면 두 가지, 호감과 신뢰를 구분할 실제 관찰 기준, 매력을 드러내는 방법을 설명하세요. **근거**, **장면**, **해볼 일**을 짧은 문단으로 나눕니다. 누가 반드시 끌린다고 단정하지 마세요.`],
    ['draws', `### ${defs[3].title}
${range(1100, 1300)}. 배우자 자리와 연인의 별을 근거로 첫 끌림과 오래 편안한 관계를 구분하세요. 생활 속 연락·약속·갈등에서 확인할 태도, 서로 다른 성향을 조율하는 대화 예시와 선택 기준을 담습니다. **근거**, **장면**, **해볼 일**을 사용하고 상대의 외모·나이·직업·속마음을 만들지 마세요.`],
    ['where', `### ${defs[4].title}
${range(800, 1000)}. 매력의 표지·배우자 자리의 관계·시기 자료를 근거로, 편안하게 교류할 환경 두 가지와 그 이유, 그 환경에서 먼저 할 일, 부담스러울 때 조정할 방법을 설명하세요. **근거**, **장면**, **해볼 일**을 사용하세요. 일상 범주(지인 소개, 모임·취미 등)는 예시이며 운명적 장소로 단정하지 마세요. 연애 중이면 새 사람을 찾으라고 하지 말고 지금 상대와 교류할 환경으로 풉니다.`],
    ['pattern', `### ${defs[5].title}
${range(1100, 1300)}. 기운의 세기·별의 많고 적음·배우자 자리 관계에서 읽는 반복 가능성을 두 가지 장면으로 설명하세요. 각각 시작 신호 → 본인의 가능한 반응 → 관계에 미치는 영향 → 바꿔볼 선택을 다룹니다. **근거**, **장면**, **해볼 일**로 나누세요. 겪었다고 단정하지 말고 본인 경험에 맞는지 점검할 질문을 넣습니다.`],
    ['caution', `### ${defs[6].title}
${range(800, 1000)}. 주의할 신호 세 가지를 **신호 1**, **신호 2**, **신호 3**으로 구분하세요. 각 신호에 왜 본인에게 중요할 수 있는지 근거, 단순한 성향 차이와 경계 침해를 구분하는 관찰 기준, 확인할 질문과 거리를 둘 기준을 담습니다. 공포를 자극하거나 특정 유형을 나쁜 사람으로 낙인찍지 마세요.`],
    ['action', `### ${defs[7].title}
${range(1100, 1300)}. 현재 상황에 맞는 **이번 주**, **다음 만남**, **한 달 뒤 점검** 세 단계로 쓰세요. 단계마다 구체적인 행동, 예시 대화, 반응에 따라 이어갈 일과 멈출 기준을 담습니다. **해볼 일** 표지를 사용하세요. 솔로는 만남 준비와 교류, 썸은 상호 의사 확인, 연애 중은 갈등 조율과 공동 계획, 이별 후는 회복과 경계 회복에 맞춥니다. 다른 장의 문장을 반복하지 마세요.`],
    ['months', `### ${MONTHS_TITLE}
확정값의 12개월 순서(${monthNums}) 그대로 정확히 12줄. 각 줄은 "- YYYY년 N월: 내용" 형식입니다. 달마다 ${range(220, 300)}, 4~5개의 짧은 문장으로 써주세요. **흐름**: 그 달의 기운과 현재 상황을 연결한 해석. **해볼 일**: 그 달에 맞는 행동 하나. **점검**: 관찰할 반응이나 주의점 하나. 강한 달과 잔잔한 달의 행동 강도가 달라야 하고, 12줄에 같은 조언을 돌려 쓰지 마세요. 월별 단락 안에는 줄바꿈을 넣지 않습니다.`]
  ];
  const requested = options.sectionKeys || defs.map(d => d.key);
  const format = instructions.filter(([key]) => key === 'months' ? options.includeMonths !== false : requested.includes(key)).map(([, text]) => text).join('\n\n');

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

## 먼저 궁금한 이야기
${focus ? FOCUS_GUIDE[focus] : '전체 흐름을 균형 있게 다루세요.'}
관심사는 해설의 강조점일 뿐, 명식 계산·달 순위·상대에 대한 사실을 바꾸는 근거가 아닙니다.

${options.previous ? '## 이미 쓴 장의 요약 (새 장에서는 같은 설명을 반복하지 마세요)\n' + options.previous : ''}

## 쓰는 형식
이번 요청에 지정한 소제목만 정확히 이 표기와 순서로 쓰세요. **근거**, **장면**, **해볼 일** 같은 표지는 문장 안에 넣지 말고 한 줄에 표지만 단독으로 쓴 뒤, 다음 줄부터 2~3문장 문단을 쓰세요(월별 상세 흐름은 한 줄 형식 유지). 문단 사이에는 빈 줄을 넣으세요. 각 장과 각 달마다 독자가 꼭 기억할 핵심 구절 1~3곳을 **짧은 구절**(20자 안팎, 한 문장 안에서 열고 닫기)로 굵게 표시하세요. 강조가 하나도 없는 장이 있으면 안 됩니다. 표지 말고는 굵게를 남발하지 마세요. 글자 수는 제목·표지 기호를 뺀, 띄어쓰기를 포함한 본문 기준입니다. 전체 리포트는 약 9,000~14,000자 목표이며, 이번에는 아래 장만 씁니다.

${format}`;
}

/* ---------- 본문 파싱 ---------- */
const HEADING_RE = /^\s*#{1,6}\s*(.+?)\s*#*\s*$/;
const MONTH_RE = /^\s*(?:[-•*]\s*)?(?:\*\*)?\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(?:\*\*)?\s*[:：]\s*(.+?)\s*$/;

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
      if (sameTitle(norm, MONTHS_TITLE) || sameTitle(norm, '월별 한 줄') || sameTitle(norm, '앞으로 12개월')) { monthLines = monthLines || []; cur = { months: true }; continue; }
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
    const month = Number(m[2]);
    if (month < 1 || month > 12 || seen.has(month)) continue;
    seen.add(month);
    monthNotes.push({ month, ...(m[1] ? { year: Number(m[1]) } : {}), note: m[3].trim() });
  }
  return { sections, monthNotes };
}

/* 구조·분량·날짜를 검사한다. 개인화의 설득력은 별도 실제 결과 검토가 필요하다. */
function validateLoveReading(parsed, timing, situationKey, options = {}) {
  const required = sectionDefs(situationKey).filter(d => !options.sectionKeys || options.sectionKeys.includes(d.key));
  const have = new Set(parsed.sections.map(s => s.key));
  const missing = required.filter(d => !have.has(d.key)).map(d => d.title);
  if (missing.length) throw new Error('본문에 빠진 장: ' + missing.join(', '));
  const top = timing.top3[0];
  const answer = parsed.sections.find(s => s.key === 'answer');
  if (answer && !new RegExp(top.year + '\\s*년\\s*' + top.month + '\\s*월').test(answer.text)) {
    throw new Error(`한 줄 답에 가장 강한 달(${monthLabel(top)})이 없습니다.`);
  }
  for (const def of required) {
    const section = parsed.sections.find(s => s.key === def.key);
    if (plainLength(section.text) < MIN_SECTION_CHARS[def.key]) throw new Error(`${def.title}: 상세 풀이 분량 부족 (${plainLength(section.text)}자, 최소 ${MIN_SECTION_CHARS[def.key]}자)`);
    if (section.text.split(/\n\s*\n/).some(p => plainLength(p) > 600)) throw new Error(`${def.title}: 긴 문단을 2~3문장씩 나누세요.`);
  }
  const topSection = parsed.sections.find(s => s.key === 'top');
  if (topSection) {
    let previous = -1;
    for (const m of timing.top3) {
      const match = new RegExp(m.year + '\\s*년\\s*' + m.month + '\\s*월').exec(topSection.text);
      if (!match || match.index <= previous) throw new Error('강한 세 달의 날짜 또는 순서가 확정값과 다릅니다.');
      previous = match.index;
    }
  }
  if (options.includeMonths !== false) {
    if (parsed.monthNotes.length !== 12) throw new Error(`월별 상세 풀이가 ${parsed.monthNotes.length}개입니다 (12개 필요).`);
    parsed.monthNotes.forEach((n, i) => {
      const expected = timing.months[i];
      if (n.month !== expected.month || (n.year != null && n.year !== expected.year)) throw new Error('월별 풀이의 날짜 또는 순서가 확정값과 다릅니다.');
      if (plainLength(n.note) < 160) throw new Error(`${monthLabel(expected)} 월별 상세 풀이 분량 부족 (${plainLength(n.note)}자, 최소 160자)`);
    });
  }
  const seen = new Set();
  const paragraphs = parsed.sections.flatMap(s => s.text.split(/\n\s*\n/)).concat(options.includeMonths === false ? [] : parsed.monthNotes.map(n => n.note));
  for (const paragraph of paragraphs) {
    const normalized = paragraph.replace(/[\s*#]/g, '');
    if (normalized.length < 80) continue;
    if (seen.has(normalized)) throw new Error('같은 해설 문단이 반복되었습니다. 중복 없이 다시 작성하세요.');
    seen.add(normalized);
  }
}

/* 강조 보정 — 지침을 줘도 모델이 장 하나를 통째로 강조 없이 쓰는 일이 있었다(2026-10-28 실측, 세 사례 중
   한 사례에서 세 장). 그런 장은 '해볼 일' 첫 문장(없으면 첫 본문 문장)을 강조해 독자가 가져갈 문장을 표시한다. */
const LABEL_ONLY = /^\*\*(근거|장면|해볼 일|흐름|점검|신호 ?\d[^*]*|이번 주[^*]*|다음 만남[^*]*|한 달 뒤 점검[^*]*|\d{4}\s*년\s*\d{1,2}\s*월)\*\*\s*[:：]?$/;
function hasHighlight(text) {
  return (String(text).match(/\*\*[^*\n]+?\*\*/g) || []).some(m => !LABEL_ONLY.test(m));
}
function ensureHighlight(text) {
  if (hasHighlight(text)) return text;
  const paras = String(text).split(/\n\s*\n/);
  const isLabel = p => LABEL_ONLY.test(p.trim());
  let at = paras.findIndex((p, i) => i > 0 && /^\*\*해볼 일\*\*\s*[:：]?$/.test(paras[i - 1].trim()) && !isLabel(p));
  if (at < 0) at = paras.findIndex(p => p.trim() && !isLabel(p));
  if (at < 0) return text;
  const m = /^(\s*(?:[-•]\s+)?)(.+?[.!?])(?=\s|$)/.exec(paras[at]);
  if (!m || m[2].length > 90 || m[2].includes('**')) return text;
  paras[at] = m[1] + '**' + m[2] + '**' + paras[at].slice(m[0].length);
  return paras.join('\n\n');
}

function toPlainText(reading) {
  const parts = reading.sections.map((s) => `## ${s.title}\n\n${s.text.replace(/^\s*#+\s*/gm, '')}`);
  if (reading.monthNotes && reading.monthNotes.length) {
    parts.push(`## 앞으로 12개월\n\n${reading.monthNotes.map((n) => `- ${n.year ? n.year + '년 ' : ''}${n.month}월: ${n.note}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * @param {object} opts { startYm?: '2026-11' 무료 첫 장의 시작 달, readingFocus?: 'person'|'timing'|'pattern'|'action', generate?: 테스트용 생성 함수 }
 * @returns {{ title, situationKey, timing, sections, monthNotes, usage }}
 */
async function generateLoveReading(engine, person, situationKey, now = new Date(), opts = {}) {
  situationOf(situationKey);
  const generate = opts.generate || generateText;
  const gender = person.gender || engine.meta.input.gender;
  const timing = buildLoveTiming(engine, gender, now, { startYm: opts.startYm });
  const usages = [];
  const sections = [], monthNotes = [];
  const readingFocus = normalizeReadingFocus(opts.readingFocus);
  async function runPart(part, base) {
    const previous = base.map(s => `${s.title}: ${s.text.replace(/\s+/g, ' ').slice(0, 240)}`).join('\n');
    const prompt = buildLovePrompt(engine, person, situationKey, timing, now, { ...part, readingFocus, previous });
    let lastError = null, accepted = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const correction = lastError ? `\n\n## 이전 시도 수정 사항\n${lastError.message} 이번 묶음의 지정 장만 다시 작성하세요.` : '';
      let text, usage;
      try {
        ({ text, usage } = await generate(LOVE_SYSTEM_PROMPT, prompt + correction, { maxTokens: 16000 }));
      } catch (e) {
        // 길이 제한으로 잘린 응답만 이 묶음을 다시 만든다. 그 밖의 오류(인증·장애)는 그대로 실패시킨다.
        if (!/max_tokens/.test(e.message)) throw e;
        lastError = new Error('응답이 길이 제한에 걸려 잘렸습니다. 지정 분량 안에서 마무리하세요.');
        continue;
      }
      usages.push(usage);
      const parsed = parseLoveText(text, situationKey);
      // 요청 밖의 장이 섞여도 기존에 완료한 장을 덮어쓰거나 중복 저장하지 않는다.
      const selected = { sections: parsed.sections.filter(s => part.sectionKeys.includes(s.key)), monthNotes: part.includeMonths ? parsed.monthNotes : [] };
      try {
        validateLoveReading({ sections: [...base, ...selected.sections], monthNotes: selected.monthNotes }, timing, situationKey, part);
        accepted = selected;
        break;
      } catch (e) {
        lastError = e;
        // 다시 만드는 이유를 남긴다. 생성 시간이 길어지는 원인을 운영에서 추적할 수 있게 한다(본문·개인정보는 남기지 않는다).
        console.warn('[연애 리포트] 다시 생성:', part.name, '-', e.message);
      }
    }
    if (!accepted) throw lastError;
    return accepted;
  }
  /* 첫 묶음(관계의 구조)을 먼저 만들고, 나머지 묶음은 그 요약만 참고하므로 동시에 만든다.
     2026-10-28 실측: 순서대로 만들면 한 건에 4~7분이 걸렸다. 묶음 사이 중복은 마지막 검사가 다시 본다. */
  const [first, ...rest] = GENERATION_PARTS;
  const firstPart = await runPart(first, []);
  sections.push(...firstPart.sections);
  const others = await Promise.all(rest.map(part => runPart(part, sections.slice())));
  for (const part of others) {
    sections.push(...part.sections);
    monthNotes.push(...part.monthNotes);
  }
  const ordered = sectionDefs(situationKey).map(def => sections.find(s => s.key === def.key)).map(sec => sec.key === 'answer' ? sec : { ...sec, text: ensureHighlight(sec.text) });
  const parsed = { sections: ordered, monthNotes: monthNotes.map((n, i) => ({ ...n, year: timing.months[i].year })) };
  validateLoveReading(parsed, timing, situationKey);
  return { title: '연애 시기 리포트', situationKey, readingFocus, timing, ...parsed, usage: sumUsage(usages) };
}

module.exports = { LOVE_SYSTEM_PROMPT, buildLovePrompt, parseLoveText, validateLoveReading, toPlainText, generateLoveReading, sectionDefs, normalizeReadingFocus, ensureHighlight };

