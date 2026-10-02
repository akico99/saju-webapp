'use strict';
/* 궁합 리포트용 프롬프트 — 18챕터 promptBuilder와 같은 원칙(엔진 JSON만이 사실 소스,
   영문 필드명 노출 금지)을 따르되, 단일 호출로 궁합 서술 전체를 받는다. */

const { safeName } = require('../pdf/personName');
const { RELATIONS, TARGET_WORDS, getCompatOutline, normalizeRelation } = require('./compatOutlines');
const { buildCompatTiming, timingPromptBlock } = require('./compatTiming');

/* 분량 보정 — promptBuilder.js와 같은 계수. 모델은 요청 글자 수의 65% 안팎을 쓴다. */
const ASK_RATIO = 1.5;
const ask = (n) => Math.round(n * ASK_RATIO / 50) * 50;

/* timing: compatTiming.buildCompatTiming 결과. 라우트가 계산해 PDF와 같은 값을 넘기고, 안 넘기면 여기서 계산한다. */
function buildCompatPrompt(engineA, engineB, personA, personB, compat, relation, timing) {
  const rel = normalizeRelation(relation);
  const outline = getCompatOutline(rel);
  const nameA = safeName(personA.name, '본인'), nameB = safeName(personB.name, '상대방');
  const summaryA = {
    이름: nameA, 일간: `${engineA.ilgan.char}(${engineA.ilgan.ko})`,
    격국: engineA.kyukguk.name, 신강신약: engineA.strength.verdict, 용신: engineA.yongshin.final.main,
    사주: `${engineA.palja.yearPillar.stem}${engineA.palja.yearPillar.branch} ${engineA.palja.monthPillar.stem}${engineA.palja.monthPillar.branch} ${engineA.palja.dayPillar.stem}${engineA.palja.dayPillar.branch} ${engineA.palja.hourPillar.stem}${engineA.palja.hourPillar.branch}`
  };
  const summaryB = {
    이름: nameB, 일간: `${engineB.ilgan.char}(${engineB.ilgan.ko})`,
    격국: engineB.kyukguk.name, 신강신약: engineB.strength.verdict, 용신: engineB.yongshin.final.main,
    사주: `${engineB.palja.yearPillar.stem}${engineB.palja.yearPillar.branch} ${engineB.palja.monthPillar.stem}${engineB.palja.monthPillar.branch} ${engineB.palja.dayPillar.stem}${engineB.palja.dayPillar.branch} ${engineB.palja.hourPillar.stem}${engineB.palja.hourPillar.branch}`
  };

  const timingData = timing === undefined ? buildCompatTiming(engineA, engineB, rel) : timing;
  const isMonth = timingData && timingData.mode === 'month';
  const timingBlock = timingPromptBlock(timingData, nameA, nameB);
  const timingSection = timingBlock
    ? `## 시기 점수 (엔진 확정값 — 앞으로 ${isMonth ? '6개월, 월별' : '3년, 연도별'}. 이 숫자만 인용하고 다른 수치·연도·달은 만들지 않습니다)
${timingBlock}

`
    : '## 시기 점수\n계산하지 못했습니다. 시기 소주제에서는 점수나 연도·달을 인용하지 말고, 이번 리포트에서 시기 수치를 제공하지 못한다는 점만 한두 문장으로 밝히세요.\n\n';
  const outlineBlock = outline.map((o, i) => `${i + 1}. ### ${o.heading} — 약 ${ask(o.words)}자\n   ${o.hint}`).join('\n');

  return `아래 두 사람의 궁합 데이터를 바탕으로 궁합 리포트 본문을 작성하세요.

## 두 사람의 관계
${RELATIONS[rel].label} — 이 관계에 맞는 장면과 언어로 씁니다. 다른 단계(예: 연애 중인데 결혼 생활, 부부인데 첫 만남)를 가정하지 않습니다.

## ${nameA}님의 명식
${JSON.stringify(summaryA, null, 2)}

## ${nameB}님의 명식
${JSON.stringify(summaryB, null, 2)}

## 궁합 계산 결과 (compatibility 엔진 JSON — 이것이 유일한 사실 소스입니다)
${JSON.stringify(compat, null, 2)}

${timingSection}## 이 리포트의 구성 (이 순서대로, 각 소주제를 "### 소제목" 한 줄로 시작)
${outlineBlock}

소주제를 하나도 빠뜨리지 말고, 각 소주제의 분량을 지키세요. 소주제끼리 같은 근거·같은 문장을 반복하지 말고, 앞에서 이미 쓴 사실은 "앞서 본 것처럼" 정도로만 짧게 받으세요. "### 소제목" 줄은 정확히 위 표기(### 뒤 한 칸)로 쓰고, 소제목 줄 바로 다음 줄부터 본문을 이어가세요.

## 맨 끝의 두 구역 (위 소주제가 모두 끝난 뒤에 이어서)
### 지금 할 것
- (불릿 5개)
### 피할 것
- (불릿 5개)
두 소제목을 정확히 이 표기로 쓰고, 불릿은 "- "로 시작해 한 줄에 하나씩, 항목당 한두 문장(40~80자)으로 씁니다. 항목마다 위 데이터에서 실제로 나온 근거(특정 충·합이 있는 궁, 십신 방향, 용신 상보, 시기 점수의 특정 해·달)에 대응하는 구체적인 행동이어야 하며, "서로 배려하세요" "대화를 많이 하세요" 같은 어느 커플에게나 맞는 말은 쓰지 않습니다. 이 두 구역은 본문 소주제와 같은 내용을 되풀이하지 말고, 건강·재산에 관한 단정이나 부적·굿 권유, 불안을 키우는 표현은 쓰지 않습니다.

## 작성 지침
- 분량은 한글 기준 ${ask(TARGET_WORDS)}자에 최대한 가깝게. 위 소주제별 분량을 합치면 이 목표가 되며, 맨 끝 두 구역(지금 할 것·피할 것)은 이 분량에 포함하지 않는 추가분입니다.
- 두 사람을 부를 때는 ${nameA}님·${nameB}님으로 부릅니다.
- score 필드의 숫자를 "점"이라고 직접 인용해도 되지만, 소수점은 애초에 없으니 그대로 정수로.
- crossYukhap/crossChung 등 영문 필드명이나 pillarA/pillarB 같은 원문 키 이름은 절대 그대로
  옮기지 말고, "연지-일지"처럼 자연스러운 한국어(궁 이름)로 바꿔 씁니다.
- 리포트 제목이나 인사말 없이 첫 소제목부터 바로 시작합니다.`;
}

module.exports = { buildCompatPrompt };
