'use strict';
/* 「다시, 우리」(재회) 본문 — 연애 시기 리포트(loveTimingReading.js)와 같은 방식으로 묶음을 나눠 생성한다.
   숫자(두 사람의 12개월 관계 신호, 상위 세 달)는 엔진(engine/reunion.js)이 정하고 AI는 해석만 한다.

   이 상품의 안전 규칙(2026-10-28 계획 문서):
   - 재회를 약속·보장하지 않는다.
   - 차단됐거나 상대가 거리를 원했으면(경계 존중 모드) 연락을 권하지 않고, 경계 존중과 회복 중심으로 쓴다.
   - 집착·감시(SNS 확인 등)·반복 연락을 부추기지 않는다. 결정은 본인 몫임을 분명히 한다.
   프롬프트로 지시하고, 생성 뒤 문장 단위 검사(checkSafety)로 한 번 더 걸러 어긋나면 그 묶음을 다시 만든다. */
const { BASE_RULES } = require('./baseSystemPrompt');
const { generateText, sumUsage } = require('./client');
const { EVIDENCE_RULE, splitEvidence, startReview } = require('./readingReview');
const { SINCE, INITIATOR, CONTACT, validateStory, boundaryMode, buildReunionTiming, describeBond, levelOf, hourKnown, OHAENG_PLAIN } = require('../engine/reunion');

const REUNION_SYSTEM_PROMPT = `당신은 '사주보는 수달'에서 「다시, 우리」 재회 리포트를 쓰는 풀이자입니다. 읽는 사람은 이별을 겪은 20~30대이고, 사주를 모릅니다. 마음이 흔들리는 시기라는 점을 늘 기억하세요.

${BASE_RULES}

## 이 상품만의 원칙
7. **확정값이 유일한 근거입니다.** 전달된 "확정값"과 "두 사람의 구조"에 없는 사실·날짜를 만들지 않습니다.
8. **재회를 약속하지 않습니다.** "다시 만나게 됩니다", "돌아올 거예요", "반드시", "100%", "이번이 마지막 기회"처럼 재회를 보장하거나 겁주는 말을 쓰지 않습니다. 관계 신호가 강한 달은 "관계의 기운이 움직이기 쉬운 달"일 뿐 재회 날짜가 아닙니다.
9. **상대의 속마음을 단정하지 않습니다.** 사주로 읽을 수 있는 것은 기질과 반응 방식의 경향뿐입니다. 상대가 지금 나를 그리워한다, 후회한다, 새 사람이 있다 같은 말을 하지 않습니다.
10. **상대의 경계를 존중합니다.** 상대가 차단했거나 거리를 원했다면 연락·선물·편지·지인을 통한 전달·다른 계정·찾아가기를 권하지 않습니다. 그 경계 안에서 내 마음을 돌보는 일을 제안합니다.
11. **집착을 부추기지 않습니다.** 상대의 소셜 미디어·프로필 확인, 답이 올 때까지 연락하기, 주변에 상대 소식 묻기, 기다리라는 말을 권하지 않습니다. 오히려 그런 행동이 반복될 때 멈추는 방법을 알려 줍니다.
12. **결정은 본인의 몫입니다.** 다가갈지 멈출지는 읽는 사람이 정한다는 점을 분명히 하고, 어느 쪽이든 나를 지키는 기준을 함께 줍니다. 마음이 너무 힘들면 믿을 만한 사람이나 전문 상담의 도움을 받아도 된다고 한 번은 말해 줍니다.
13. **말투**: 차분하고 다정한 존댓말("~해요", "~예요"). 귀여운 말투, 과한 감탄, 논문체, 빈 위로("힘내세요"만 반복)를 쓰지 않습니다. 각 장은 핵심 해석 → 사주에서 읽은 근거 → 일상에서 해 볼 행동 순서로 씁니다.
14. **읽는 호흡**: 한 문단은 2~3문장, 문단 사이 빈 줄. **근거**, **장면**, **해볼 일** 같은 짧은 굵은 표지를 한 줄에 단독으로 씁니다. 예시 대화는 예시임을 밝힙니다. 같은 결론을 되풀이하지 않습니다.
15. 소제목은 지정된 것만 "### "로 씁니다. 그 밖의 제목 기호(#)는 쓰지 않고, 강조는 굵게(**...**), 목록은 불릿(-)만 씁니다.`;

const MONTHS_TITLE = '월별 상세 흐름';
function sectionDefs(boundary) {
  return [
    { key: 'answer', title: '한 줄 답' },
    { key: 'drawn', title: '우리가 끌렸던 이유' },
    { key: 'crossed', title: '엇갈린 지점' },
    { key: 'them', title: '그 사람의 성향' },
    { key: 'flow', title: boundary ? '마음의 흐름이 바뀌는 때' : '다시 이어질 흐름' },
    { key: 'stop', title: boundary ? '지금은 멈춰야 할 이유와 신호' : '다가간다면, 멈춰야 할 신호' },
    { key: 'heal', title: '나를 위한 회복' }
  ];
}
const MIN_SECTION_CHARS = Object.freeze({ answer: 80, drawn: 750, crossed: 850, them: 650, flow: 1400, stop: 850, heal: 750 });
const plainLength = text => String(text || '').replace(/[*#]/g, '').replace(/\s+/g, ' ').trim().length;
// 모델은 요청 글자 수의 약 65%를 쓴다(loveTimingReading.js와 같은 보정). 검수 기준은 그대로 둔다.
const ASK_RATIO = 1.5;
const ask = n => Math.round(n * ASK_RATIO / 50) * 50;
const range = (lo, hi) => ask(lo) + '~' + ask(hi) + '자';
const GENERATION_PARTS = Object.freeze([
  { name: '두 사람의 구조', sectionKeys: ['answer', 'drawn', 'crossed'], includeMonths: false },
  { name: '성향과 흐름', sectionKeys: ['them', 'flow'], includeMonths: false },
  { name: '신호와 회복', sectionKeys: ['stop', 'heal'], includeMonths: false },
  { name: '12개월 상세 흐름', sectionKeys: [], includeMonths: true }
]);

const monthLabel = (m) => m.year + '년 ' + m.month + '월';
const cleanName = (name) => String(name || '').replace(/[\u0000-\u001f\u007f#*<>\[\]`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);

const GROUP_OF = { 비견: '비겁', 겁재: '비겁', 식신: '식상', 상관: '식상', 편재: '재성', 정재: '재성', 편관: '관성', 정관: '관성', 편인: '인성', 정인: '인성' };
function groupPlain(group, gender) {
  if (group === '관성') return gender === '여' ? '연인을 뜻하는 별(규칙과 책임의 기운이기도 함)' : '규칙과 책임의 기운';
  if (group === '재성') return gender === '남' ? '연인을 뜻하는 별(현실 감각의 기운이기도 함)' : '현실 감각의 기운';
  return { 비겁: '나와 같은 편의 기운(자존심·독립)', 식상: '표현하고 드러내는 기운(말·애정 표현)', 인성: '생각하고 품는 기운' }[group] || '중립적인 기운';
}
const SHIPSIN_HANJA_KO = { 比肩: '비견', 劫財: '겁재', 食神: '식신', 傷官: '상관', 偏財: '편재', 正財: '정재', 偏官: '편관', 正官: '정관', 偏印: '편인', 正印: '정인' };
const shipsinPlain = (s, gender) => groupPlain(GROUP_OF[SHIPSIN_HANJA_KO[s] || s], gender);
const STRENGTH_PLAIN = { 신강: '스스로의 기운이 센 편(주관이 뚜렷함)', 신약: '스스로의 기운이 여린 편(주변 영향을 많이 받음)', 중화: '기운이 고르게 맞춰진 편' };

function personStructure(engine, label) {
  const gender = engine.meta.input.gender;
  const g = (engine.counts && engine.counts.shipsinGroup) || {};
  const loveStar = gender === '남' ? '재성' : '관성';
  const lines = [
    '- ' + label + (label === '나' ? '를' : '을') + ' 뜻하는 글자(일간): ' + engine.ilgan.char + ', ' + (OHAENG_PLAIN[engine.ilgan.ohaeng] || engine.ilgan.ohaeng) + '의 성질',
    '- ' + label + '의 배우자 자리(일지 ' + engine.manse.day.branch + ')에 든 기운: ' + shipsinPlain(engine.manse.day.branchShipsinKo, gender),
    '- 연인을 뜻하는 별 ' + (g[loveStar] ?? 0) + '개 / 표현하는 기운 ' + (g['식상'] ?? 0) + '개 / 같은 편의 기운 ' + (g['비겁'] ?? 0) + '개 / 생각하고 품는 기운 ' + (g['인성'] ?? 0) + '개',
    '- 타고난 기운의 세기: ' + (STRENGTH_PLAIN[engine.strength.verdict] || '보통')
  ];
  if (!hourKnown(engine)) lines.push('- ' + label + '의 태어난 시각 모름: 시주는 근거로 쓰지 마세요. 별 개수는 대략으로만 보세요.');
  return lines.join('\n');
}

const SITUATION_GUIDE = {
  since: { m1: '헤어진 지 한 달이 안 됐습니다. 감정이 가장 날 선 때라 큰 결정을 미루고 일상을 지키는 쪽을 먼저 권하세요.', m6: '헤어진 지 1~6개월입니다. 감정이 오르내리는 때라 충동적인 연락과 차분한 정리를 구분하도록 도와 주세요.', y1: '헤어진 지 6개월~1년입니다. 관계를 한 걸음 떨어져 돌아볼 수 있는 때로 풀어 주세요.', y1plus: '헤어진 지 1년이 넘었습니다. 두 사람 모두 달라졌을 수 있다는 점을 전제로 풀어 주세요.' },
  initiator: { me: '내가 먼저 이별을 말했습니다.', them: '그 사람이 먼저 이별을 말했습니다. 상대가 거리를 원했다는 뜻이므로 그 결정을 존중하는 쪽으로 쓰세요.', mutual: '서로 이별에 동의했습니다.' },
  contact: { sometimes: '지금도 가끔 연락합니다. 연락이 있다는 사실을 재회의 신호로 단정하지 마세요.', cut: '지금 연락이 끊겼습니다.', blocked: '상대가 나를 차단했습니다. 이것은 분명한 거리 요청입니다.' }
};
const BOUNDARY_GUIDE = '## 경계 존중 모드 (반드시 지킬 것)\n이 사람은 상대가 거리를 원한 상황입니다. 어느 장에서도 연락·메시지·편지·선물·지인을 통한 전달·다른 계정·찾아가기를 권하지 마세요. "언젠가 연락해 보세요"도 쓰지 마세요. 관계 신호가 강한 달은 연락할 때가 아니라 내 마음이 정리되고 관계를 돌아보기 좋은 때로 풀고, 행동 제안은 모두 나를 돌보는 일로 채우세요. 연락하고 싶어질 때 대신 할 일을 구체적으로 알려 주세요.';
const OPEN_GUIDE = '## 다가가는 것에 대해\n다가갈지 말지는 본인이 정합니다. 다가간다면 한 번의 부담 없는 연락까지만 예시로 들고(예시임을 밝히기), 답이 없거나 거리를 원한다는 반응이면 그 자리에서 멈추라고 분명히 쓰세요. 반복 연락·소셜 미디어 확인·주변에 소식 묻기는 권하지 마세요.';

function buildReunionPrompt(engineA, engineB, people, story, timing, options = {}) {
  const boundary = boundaryMode(story);
  const defs = sectionDefs(boundary);
  const nameA = cleanName(people.me && people.me.name), nameB = cleanName(people.them && people.them.name);
  const gA = engineA.meta.input.gender, gB = engineB.meta.input.gender;
  const bond = describeBond(engineA, engineB);
  const comes = (x, g) => shipsinPlain(x.stemShipsin, g) + ', ' + shipsinPlain(x.branchShipsin, g);
  const top = timing.top3.map((m, i) => (i + 1) + ') ' + monthLabel(m) + ' — 나에게 들어오는 기운: ' + comes(m.a, gA) + ' / 그 사람에게 들어오는 기운: ' + comes(m.b, gB)).join('\n');
  const months = timing.months.map((m) => '- ' + monthLabel(m) + ': 두 사람 관계 신호 ' + levelOf(m.score) + ' (나 ' + levelOf(m.a.score) + ', 그 사람 ' + levelOf(m.b.score) + ') · 나에게 들어오는 기운: ' + comes(m.a, gA)).join('\n');
  const monthNums = timing.months.map(monthLabel).join(', ');
  const strongWord = boundary ? '두 사람의 관계 기운이 가장 크게 움직이는 달' : '두 사람의 관계 신호가 가장 강한 달';
  const T = Object.fromEntries(defs.map(d => [d.key, d.title]));
  const instructions = [
    ['answer', '### ' + T.answer + '\n' + range(150, 220) + ', 2~3문장. 첫 문장에 "12개월 중 ' + strongWord + '은 ' + monthLabel(timing.top3[0]) + '"이라는 사실을 쓰되 재회 날짜처럼 말하지 마세요. ' + (boundary ? '이어서 지금은 상대의 경계를 존중하며 내 마음을 돌볼 때라는 핵심과 할 일 하나를 씁니다.' : '이어서 다가갈지 멈출지는 본인이 정할 일이라는 점과, 먼저 해 볼 일 하나를 씁니다.')],
    ['drawn', '### ' + T.drawn + '\n' + range(1000, 1200) + '. "두 사람 사이의 끌림"과 "서로에게 다가오는 기운"을 근거로 처음 끌렸던 이유를 설명하세요. **근거**, **장면**, **돌아볼 점** 표지를 쓰고, 장면은 두 사람이 함께 있을 때 흔히 생기는 모습으로 그립니다(실제 있었던 일처럼 단정하지 않기). 미화하거나 "운명"이라 부르지 마세요.'],
    ['crossed', '### ' + T.crossed + '\n' + range(1100, 1300) + '. "두 사람 사이의 부딪힘"과 각자의 구조를 근거로 엇갈리기 쉬운 장면 두 가지를 쓰세요. 각 장면은 시작 신호 → 나의 반응 → 그 사람의 기질상 반응 경향 → 다르게 해 볼 수 있었던 선택 순서입니다. **근거**, **장면**, **해볼 일** 표지를 쓰고, 누구 탓으로 몰지 말고, 실제로 겪었는지 스스로 점검할 질문을 넣으세요.'],
    ['them', '### ' + T.them + '\n' + range(900, 1100) + '. "그 사람의 구조"만 근거로 그 사람의 기질(감정 표현, 갈등 때 반응, 거리를 두는 방식, 마음을 여는 속도)을 경향으로 설명하세요. **근거**, **장면**, **해볼 일** 표지를 쓰세요. 그 사람이 지금 무엇을 느끼는지, 나를 그리워하는지, 새 사람이 있는지는 절대 단정하지 말고 "사주로는 속마음을 알 수 없다"는 점을 한 번 밝히세요.'],
    ['flow', '### ' + T.flow + '\n세 달 각각 ' + range(650, 800) + ', 합계 ' + range(1950, 2400) + '. 각 달은 "**YYYY년 M월**"로 시작하고 확정값의 강한 순서를 따르세요. 달마다 **근거**, **장면**, **해볼 일** 표지를 씁니다. 두 사람에게 들어오는 기운이 어떻게 겹치는지 설명하고, ' + (boundary ? '그 달을 연락할 때가 아니라 내 마음을 정리하고 관계를 돌아보기 좋은 때로 풀어 주세요. 해볼 일은 모두 나를 돌보는 일입니다.' : '다가간다면 부담이 적은 방식 한 가지와, 반응이 없을 때 멈출 기준을 함께 씁니다. 그 달에 재회한다고 말하지 마세요.') + ' 아래 월별 설명과 같은 문장을 복사하지 마세요.'],
    ['stop', '### ' + T.stop + '\n' + range(1100, 1300) + '. ' + (boundary
      ? '**연락하지 않는 이유**, **연락하고 싶어질 때**, **멈춰야 할 신호** 세 표지로 쓰세요. 상대의 거리 요청을 존중하는 것이 왜 나를 지키는 일인지, 연락하고 싶은 충동이 올 때 대신 할 구체적인 행동 세 가지, 내 쪽에서 집착으로 번지는 신호(상대 소셜 미디어를 반복해 확인함, 주변에 소식을 물음, 다른 방법으로 닿으려 함)와 그때 멈추는 방법을 씁니다.'
      : '**다가가기 전에**, **다가간다면**, **멈춰야 할 신호** 세 표지로 쓰세요. 다가가기 전에 스스로 점검할 질문 세 가지, 다가간다면 한 번의 부담 없는 연락 예시(예시임을 밝히고 한 번까지만), 멈춰야 할 신호 세 가지(답이 없음, 거리를 원한다는 말, 같은 갈등의 반복 등)와 그때 존중하고 멈추는 방법을 씁니다. 반복 연락이나 소셜 미디어 확인을 권하지 마세요.') + ' 다가갈지 멈출지는 본인이 정한다는 문장을 넣으세요.'],
    ['heal', '### ' + T.heal + '\n' + range(1000, 1200) + '. 내 구조(일간의 성질, 기운의 세기, 많고 적은 기운)를 근거로 나에게 맞는 회복 방법을 **근거**, **이번 주**, **한 달 뒤** 표지로 쓰세요. 감정 정리, 일상 리듬, 나를 위한 작은 계획을 장면이 그려지게 쓰고, 마음이 너무 힘들 때는 믿을 만한 사람이나 전문 상담의 도움을 받아도 된다고 한 번 말해 주세요. 의학적 진단은 하지 않습니다.'],
    ['months', '### ' + MONTHS_TITLE + '\n확정값의 12개월 순서(' + monthNums + ') 그대로 정확히 12줄. 각 줄은 "- YYYY년 N월: 내용" 형식입니다. 달마다 ' + range(220, 300) + ', 4~5개의 짧은 문장. **흐름**: 그 달 두 사람의 기운과 내 마음의 흐름. **해볼 일**: 그 달에 맞는 행동 하나' + (boundary ? '(연락이 아닌 나를 돌보는 일)' : '') + '. **점검**: 살펴볼 내 마음이나 반응 하나. 강한 달과 잔잔한 달의 행동 강도가 달라야 하고 같은 조언을 돌려 쓰지 마세요. 월별 단락 안에는 줄바꿈을 넣지 않습니다.']
  ];
  const requested = options.sectionKeys || defs.map(d => d.key);
  const format = instructions.filter(([key]) => key === 'months' ? options.includeMonths !== false : requested.includes(key)).map(([, t]) => t).join('\n\n');

  return '# 「다시, 우리」 재회 리포트\n\n'
    + '## 지금 상황\n헤어진 지 ' + SINCE[story.since].label + ' · 이별을 먼저 말한 쪽: ' + INITIATOR[story.initiator].label + ' · 지금 연락: ' + CONTACT[story.contact].label + '\n'
    + [SITUATION_GUIDE.since[story.since], SITUATION_GUIDE.initiator[story.initiator], SITUATION_GUIDE.contact[story.contact]].join(' ') + '\n\n'
    + (boundary ? BOUNDARY_GUIDE : OPEN_GUIDE) + '\n\n'
    + '## 확정값 (바꾸거나 새로 만들지 마세요)\n' + strongWord.replace(/달$/, '세 달') + ' (강한 순서):\n' + top + '\n\n'
    + '앞으로 12개월 (강함·보통·잔잔함):\n' + months + '\n\n'
    + '## 두 사람의 구조\n'
    + '두 사람 사이의 끌림:\n' + bond.attraction.map(s => '- ' + s).join('\n') + '\n'
    + '두 사람 사이의 부딪힘:\n' + bond.friction.map(s => '- ' + s).join('\n') + '\n'
    + '서로에게 다가오는 기운: 그 사람은 나에게 ' + (bond.toMe || '자료 없음') + ' / 나는 그 사람에게 ' + (bond.toThem || '자료 없음') + '\n\n'
    + '나의 구조:\n' + personStructure(engineA, '나') + '\n\n'
    + '그 사람의 구조:\n' + personStructure(engineB, '그 사람') + '\n\n'
    + '## 두 사람 정보\n나: ' + (nameA || '(이름 없음, "고객님"으로 부르기)') + ' / ' + (gA || '미상') + '\n그 사람: ' + (nameB || '(이름 없음, "그 사람"으로 부르기)') + ' / ' + (gB || '미상') + '\n\n'
    + (options.previous ? '## 이미 쓴 장의 요약 (새 장에서는 같은 설명을 반복하지 마세요)\n' + options.previous + '\n\n' : '')
    + '## 쓰는 형식\n이번 요청에 지정한 소제목만 정확히 이 표기와 순서로 쓰세요. 굵은 표지는 문장 안에 넣지 말고 한 줄에 단독으로 쓴 뒤 다음 줄부터 2~3문장 문단을 쓰세요(월별 상세 흐름은 한 줄 형식 유지). 각 장과 각 달마다 독자가 꼭 기억할 핵심 구절 1~3곳을 **짧은 구절**(20자 안팎)로 굵게 표시하세요. 강조가 없는 장이 있으면 안 됩니다. 글자 수는 띄어쓰기를 포함한 본문 기준입니다. 전체 리포트는 약 9,000~14,000자 목표이며, 이번에는 아래 장만 씁니다.\n' + EVIDENCE_RULE + '\n\n'
    + format;
}

/* ---------- 본문 파싱 (loveTimingReading.js와 같은 규칙) ---------- */
const HEADING_RE = /^\s*#{1,6}\s*(.+?)\s*#*\s*$/;
const MONTH_RE = /^\s*(?:[-•*]\s*)?(?:\*\*)?\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(?:\*\*)?\s*[:：]\s*(.+?)\s*$/;
function normalizeHeading(s) {
  return String(s).replace(/\*\*/g, '').replace(/\(.*?\)|（.*?）|\[.*?\]/g, ' ').replace(/[^\p{L}\p{N}\s,·]/gu, ' ').replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim();
}
const sameTitle = (norm, title) => { const t = normalizeHeading(title); return norm === t || norm.startsWith(t + ' '); };

function parseReunionText(text, boundary) {
  const defs = sectionDefs(boundary);
  const raw = String(text || '');
  const found = new Map();
  let cur = null, monthLines = null, sawHeading = false;
  for (const line of raw.split('\n')) {
    const h = HEADING_RE.exec(line);
    if (h) {
      sawHeading = true;
      const norm = normalizeHeading(h[1]);
      if (sameTitle(norm, MONTHS_TITLE) || sameTitle(norm, '앞으로 12개월')) { monthLines = monthLines || []; cur = { months: true }; continue; }
      const def = defs.find((d) => sameTitle(norm, d.title));
      if (def) {
        if (!found.has(def.key)) found.set(def.key, { lines: [] });
        cur = found.get(def.key);
        continue;
      }
      const label = h[1].replace(/\*\*/g, '').trim();
      if (cur && !cur.months && label) cur.lines.push('', '**' + label + '**');
      continue;
    }
    if (!cur) continue;
    if (cur.months) monthLines.push(line); else cur.lines.push(line);
  }
  const sections = defs.filter((d) => found.has(d.key)).map((d) => ({ key: d.key, title: d.title, text: found.get(d.key).lines.join('\n').trim() })).filter((s) => s.text);
  if (!sawHeading || (!sections.length && !monthLines)) {
    const whole = raw.trim();
    return { sections: whole ? [{ key: 'body', title: '풀이', text: whole.replace(/^\s*#+\s*/gm, '') }] : [], monthNotes: [] };
  }
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

/* ---------- 안전 검사 ----------
   문장 단위로 본다. 부정·금지 문맥("연락하지 마세요", "보장하지 않아요")은 통과시킨다. */
const NEGATION = /(지\s*마|않|말고|말아|금지|멈추|멈춰|삼가|아니|없어요|없습니다|피하|조심|대신)/;
const ALWAYS_BANNED = [
  { re: /(반드시|꼭|틀림없이|100\s*%|확실히|분명히)\s*(다시\s*)?(재회|돌아|만나게|연락이\s*(올|와))/, why: '재회를 보장하는 표현' },
  { re: /재회\S{0,3}\s*(보장|약속)(해|합|됩|돼)/, why: '재회를 보장하는 표현' },
  { re: /(돌아올|연락이\s*올|다시\s*만나게\s*될|재회하게\s*될)\s*(거예요|겁니다|것입니다|거에요)/, why: '재회를 예언하는 표현' },
  { re: /(마지막\s*기회|놓치면\s*끝|영영\s*끝)/, why: '겁을 주는 표현' },
  { re: /(SNS|소셜\s*미디어|인스타|프로필|게시물|스토리|근황)[^.!?\n]{0,25}(확인해\s*보|살펴\s*보|지켜\s*보|들어가\s*보)(세요|시길|는\s*것도)/, why: '상대를 지켜보라는 권유' },
  { re: /(찾아가\s*보|집\s*앞|회사\s*앞)[^.!?\n]{0,10}(세요|보는\s*것도)/, why: '찾아가라는 권유' },
  { re: /(계속|여러\s*번|매일|답이\s*올\s*때까지)[^.!?\n]{0,12}(연락|메시지|문자)[^.!?\n]{0,10}(해\s*보세요|보내\s*보세요|하세요|보내세요)/, why: '반복 연락 권유' }
];
const BOUNDARY_BANNED = [
  { re: /(연락|메시지|문자|편지|DM|카톡|안부|선물|마음)[^.!?\n]{0,20}(보내|해|건네|남겨|전해|드려|띄워)\s*(보세요|보는\s*것|보면\s*좋|보길|보시|봐도)/, why: '거리를 원한 상대에게 연락 권유' },
  { re: /(다른\s*계정|새\s*번호|지인을\s*통해|친구를\s*통해)[^.!?\n]{0,20}(세요|보는\s*것도)/, why: '우회 연락 권유' }
];
function checkSafety(text, boundary) {
  const rules = boundary ? ALWAYS_BANNED.concat(BOUNDARY_BANNED) : ALWAYS_BANNED;
  const sentences = String(text || '').replace(/\*\*/g, '').split(/(?<=[.!?])\s+|\n+/);
  for (const s of sentences) {
    for (const rule of rules) {
      if (rule.re.test(s) && !NEGATION.test(s)) return rule.why + ': "' + s.trim().slice(0, 80) + '"';
    }
  }
  return null;
}

function validateReunionReading(parsed, timing, boundary, options = {}) {
  const required = sectionDefs(boundary).filter(d => !options.sectionKeys || options.sectionKeys.includes(d.key));
  const have = new Set(parsed.sections.map(s => s.key));
  const missing = required.filter(d => !have.has(d.key)).map(d => d.title);
  if (missing.length) throw new Error('본문에 빠진 장: ' + missing.join(', '));
  const top = timing.top3[0];
  const answer = parsed.sections.find(s => s.key === 'answer');
  if (answer && !new RegExp(top.year + '\\s*년\\s*' + top.month + '\\s*월').test(answer.text)) throw new Error('한 줄 답에 가장 강한 달(' + monthLabel(top) + ')이 없습니다.');
  for (const def of required) {
    const section = parsed.sections.find(s => s.key === def.key);
    if (plainLength(section.text) < MIN_SECTION_CHARS[def.key]) throw new Error(def.title + ': 상세 풀이 분량 부족 (' + plainLength(section.text) + '자, 최소 ' + MIN_SECTION_CHARS[def.key] + '자)');
    if (section.text.split(/\n\s*\n/).some(p => plainLength(p) > 600)) throw new Error(def.title + ': 긴 문단을 2~3문장씩 나누세요.');
  }
  const flow = parsed.sections.find(s => s.key === 'flow');
  if (flow && required.some(d => d.key === 'flow')) {
    let previous = -1;
    for (const m of timing.top3) {
      const match = new RegExp(m.year + '\\s*년\\s*' + m.month + '\\s*월').exec(flow.text);
      if (!match || match.index <= previous) throw new Error('강한 세 달의 날짜 또는 순서가 확정값과 다릅니다.');
      previous = match.index;
    }
  }
  if (options.includeMonths !== false) {
    if (parsed.monthNotes.length !== 12) throw new Error('월별 상세 풀이가 ' + parsed.monthNotes.length + '개입니다 (12개 필요).');
    parsed.monthNotes.forEach((n, i) => {
      const expected = timing.months[i];
      if (n.month !== expected.month || (n.year != null && n.year !== expected.year)) throw new Error('월별 풀이의 날짜 또는 순서가 확정값과 다릅니다.');
      if (plainLength(n.note) < 160) throw new Error(monthLabel(expected) + ' 월별 상세 풀이 분량 부족 (' + plainLength(n.note) + '자, 최소 160자)');
    });
  }
  const checked = parsed.sections.filter(s => required.some(d => d.key === s.key)).map(s => s.text).concat(options.includeMonths === false ? [] : parsed.monthNotes.map(n => n.note));
  for (const t of checked) {
    const bad = checkSafety(t, boundary);
    if (bad) throw new Error('안전 규칙 위반 — ' + bad + '. 이 문장을 빼고 상대의 경계를 존중하는 표현으로 다시 쓰세요.');
  }
  const seen = new Set();
  for (const paragraph of parsed.sections.flatMap(s => s.text.split(/\n\s*\n/)).concat(options.includeMonths === false ? [] : parsed.monthNotes.map(n => n.note))) {
    const normalized = paragraph.replace(/[\s*#]/g, '');
    if (normalized.length < 80) continue;
    if (seen.has(normalized)) throw new Error('같은 해설 문단이 반복되었습니다. 중복 없이 다시 작성하세요.');
    seen.add(normalized);
  }
}

/* 강조 보정 — 장 하나를 통째로 강조 없이 쓰면(표지만 굵게) 첫 본문 문장을 강조한다(loveTimingReading.ensureHighlight와 같은 방식). */
const LABEL_ONLY = /^\*\*[^*\n]{1,24}\*\*\s*[:：]?$/;
function ensureHighlight(text) {
  const paras = String(text).split(/\n\s*\n/);
  const inBody = paras.filter(p => !LABEL_ONLY.test(p.trim())).join('\n');
  if (/\*\*[^*\n]+?\*\*/.test(inBody)) return text;
  const at = paras.findIndex(p => p.trim() && !LABEL_ONLY.test(p.trim()));
  if (at < 0) return text;
  const m = /^(\s*(?:[-•]\s+)?)(.+?[.!?])(?=\s|$)/.exec(paras[at]);
  if (!m || m[2].length > 90 || m[2].includes('**')) return text;
  paras[at] = m[1] + '**' + m[2] + '**' + paras[at].slice(m[0].length);
  return paras.join('\n\n');
}

function toPlainText(reading) {
  const parts = reading.sections.map((s) => '## ' + s.title + '\n\n' + s.text.replace(/^\s*#+\s*/gm, ''));
  if (reading.monthNotes && reading.monthNotes.length) parts.push('## 앞으로 12개월\n\n' + reading.monthNotes.map((n) => '- ' + (n.year ? n.year + '년 ' : '') + n.month + '월: ' + n.note).join('\n'));
  return parts.join('\n\n');
}

/**
 * @param {object} people { me:{name}, them:{name} }
 * @param {object} story { since, initiator, contact }
 * @param {object} opts { startYm?, generate? (테스트용) }
 */
async function generateReunionReading(engineA, engineB, people, storyIn, now = new Date(), opts = {}) {
  const story = validateStory(storyIn);
  const boundary = boundaryMode(story);
  const generate = opts.generate || generateText;
  const timing = buildReunionTiming(engineA, engineB, now, { startYm: opts.startYm });
  const usages = [], sections = [], monthNotes = [];
  // 장별 근거·사실 대조 기록(검토용). 화면·PDF 본문에는 들어가지 않는다.
  const review = startReview({ engines: [engineA, engineB], months: timing.months, ranked: timing.top3, rankSections: ['answer', 'flow'] }, sectionDefs(boundary));
  async function runPart(part, base) {
    const previous = base.map(s => s.title + ': ' + s.text.replace(/\s+/g, ' ').slice(0, 240)).join('\n');
    const prompt = buildReunionPrompt(engineA, engineB, people, story, timing, { ...part, previous });
    let lastError = null, accepted = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const correction = lastError ? '\n\n## 이전 시도 수정 사항\n' + lastError.message + ' 이번 묶음의 지정 장만 다시 작성하세요.' : '';
      let text, usage;
      try {
        ({ text, usage } = await generate(REUNION_SYSTEM_PROMPT, prompt + correction, { maxTokens: 16000 }));
      } catch (e) {
        if (!/max_tokens/.test(e.message)) throw e;
        lastError = new Error('응답이 길이 제한에 걸려 잘렸습니다. 지정 분량 안에서 마무리하세요.');
        continue;
      }
      usages.push(usage);
      const ev = splitEvidence(text);
      const parsed = parseReunionText(ev.text, boundary);
      const selected = { sections: parsed.sections.filter(s => part.sectionKeys.includes(s.key)), monthNotes: part.includeMonths ? parsed.monthNotes : [] };
      try {
        validateReunionReading({ sections: [...base, ...selected.sections], monthNotes: selected.monthNotes }, timing, boundary, part);
        review.check(selected, ev.notes, attempt < 2);
        accepted = selected;
        break;
      } catch (e) {
        lastError = e;
        // 본문·개인정보는 남기지 않고 다시 만드는 이유만 남긴다.
        console.warn('[재회 리포트] 다시 생성:', part.name, '-', e.message.replace(/: ".*"/, '').slice(0, 120));
      }
    }
    if (!accepted) throw lastError;
    return accepted;
  }
  const [first, ...rest] = GENERATION_PARTS;
  const firstPart = await runPart(first, []);
  sections.push(...firstPart.sections);
  const others = await Promise.all(rest.map(part => runPart(part, sections.slice())));
  for (const part of others) { sections.push(...part.sections); monthNotes.push(...part.monthNotes); }
  const ordered = sectionDefs(boundary).map(def => sections.find(s => s.key === def.key)).map(sec => sec.key === 'answer' ? sec : { ...sec, text: ensureHighlight(sec.text) });
  const parsed = { sections: ordered, monthNotes: monthNotes.map((n, i) => ({ ...n, year: timing.months[i].year })) };
  validateReunionReading(parsed, timing, boundary);
  return { title: '다시, 우리', boundary, story, timing, ...parsed, ...review.result(), usage: sumUsage(usages) };
}

module.exports = { REUNION_SYSTEM_PROMPT, sectionDefs, buildReunionPrompt, parseReunionText, validateReunionReading, checkSafety, ensureHighlight, toPlainText, generateReunionReading, MIN_SECTION_CHARS, GENERATION_PARTS, MONTHS_TITLE };
