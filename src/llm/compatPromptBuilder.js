'use strict';
/* 궁합 리포트용 프롬프트 — 18챕터 promptBuilder와 같은 원칙(엔진 JSON만이 사실 소스,
   영문 필드명 노출 금지)을 따르되, 단일 호출로 궁합 서술 전체를 받는다. */

const { safeName } = require('../pdf/personName');
const { RELATIONS, TARGET_WORDS, getCompatOutline, normalizeRelation } = require('./compatOutlines');

/* 분량 보정 — promptBuilder.js와 같은 계수. 모델은 요청 글자 수의 65% 안팎을 쓴다. */
const ASK_RATIO = 1.5;
const ask = (n) => Math.round(n * ASK_RATIO / 50) * 50;

function buildCompatPrompt(engineA, engineB, personA, personB, compat, relation) {
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

## 이 리포트의 구성 (이 순서대로, 각 소주제를 "### 소제목" 한 줄로 시작)
${outlineBlock}

소주제를 하나도 빠뜨리지 말고, 각 소주제의 분량을 지키세요. 소주제끼리 같은 근거·같은 문장을 반복하지 말고, 앞에서 이미 쓴 사실은 "앞서 본 것처럼" 정도로만 짧게 받으세요. "### 소제목" 줄은 정확히 위 표기(### 뒤 한 칸)로 쓰고, 소제목 줄 바로 다음 줄부터 본문을 이어가세요.

## 작성 지침
- 분량은 한글 기준 ${ask(TARGET_WORDS)}자에 최대한 가깝게. 위 소주제별 분량을 합치면 이 목표가 됩니다.
- 두 사람을 부를 때는 ${nameA}님·${nameB}님으로 부릅니다.
- score 필드의 숫자를 "점"이라고 직접 인용해도 되지만, 소수점은 애초에 없으니 그대로 정수로.
- crossYukhap/crossChung 등 영문 필드명이나 pillarA/pillarB 같은 원문 키 이름은 절대 그대로
  옮기지 말고, "연지-일지"처럼 자연스러운 한국어(궁 이름)로 바꿔 씁니다.
- 리포트 제목이나 인사말 없이 첫 소제목부터 바로 시작합니다.`;
}

module.exports = { buildCompatPrompt };
