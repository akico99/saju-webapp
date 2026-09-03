'use strict';
/* 궁합 리포트용 프롬프트 — 18챕터 promptBuilder와 같은 원칙(엔진 JSON만이 사실 소스,
   영문 필드명 노출 금지)을 따르되, 단일 호출로 궁합 서술 전체를 받는다. */

const { safeName } = require('../pdf/personName');

function buildCompatPrompt(engineA, engineB, personA, personB, compat) {
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

  return `아래 두 사람의 궁합 데이터를 바탕으로 궁합 리포트 본문을 작성하세요.

## ${nameA}님의 명식
${JSON.stringify(summaryA, null, 2)}

## ${nameB}님의 명식
${JSON.stringify(summaryB, null, 2)}

## 궁합 계산 결과 (compatibility 엔진 JSON — 이것이 유일한 사실 소스입니다)
${JSON.stringify(compat, null, 2)}

## 작성 지침
- 분량은 한글 기준 2200자 내외로, 4~5개 문단으로 구성합니다.
- 첫 문단: 두 사람의 일간 상호 십신(shipsinAtoB, shipsinBtoA)이 뜻하는 바를 풀어 설명 —
  이건 "상대가 나에게 어떤 존재로 다가오는지"를 보여주는 가장 중요한 단서입니다.
- 둘째 문단: 일지-일지 관계(dayRelation) — 배우자궁끼리의 관계이므로 연애/결혼 궁합에서
  가장 비중 있게 다룹니다. 합이면 정서적 친밀감·자연스러운 끌림을, 충이면 초반 긴장이나
  자극이 있을 수 있지만 서로 다른 자극이 성장의 동력이 될 수도 있다는 균형 잡힌 톤으로.
- 셋째 문단: 나머지 교차 합/충(crossYukhap/crossChung/crossSamhap) 중 눈에 띄는 것 1~2개만
  골라 구체적으로(어느 기둥끼리인지) 언급 — 전부 나열하지 않습니다.
- 넷째 문단: 종합 점수(score)를 참고 수치로 자연스럽게 녹여 총평하고, 궁합은 두 사람의
  선택과 노력으로 얼마든지 좋아질 수 있다는 점을 분명히 합니다(운명론적 단정 금지).
- score 필드의 숫자를 "점"이라고 직접 인용해도 되지만, 소수점은 애초에 없으니 그대로 정수로.
- crossYukhap/crossChung 등 영문 필드명이나 pillarA/pillarB 같은 원문 키 이름은 절대 그대로
  옮기지 말고, "연지-일지"처럼 자연스러운 한국어(궁 이름)로 바꿔 씁니다.`;
}

module.exports = { buildCompatPrompt };
