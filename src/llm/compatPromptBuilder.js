'use strict';
/* 궁합 리포트용 프롬프트 — 18챕터 promptBuilder와 같은 원칙(엔진 JSON만이 사실 소스,
   영문 필드명 노출 금지)을 따르되, 단일 호출로 궁합 서술 전체를 받는다. */

const { safeName } = require('../pdf/personName');
const { RELATIONS, TARGET_WORDS, getCompatOutline, normalizeRelation } = require('./compatOutlines');
const { buildCompatTiming, timingPromptBlock } = require('./compatTiming');
const { PILLAR_KO } = require('../engine/compatibility');

/* 영문 방향 필드를 그대로 전달하지 않고, 계산된 사실에 두 사람 이름을 붙인다. */
function compatFacts(engineA, engineB, nameA, nameB, compat) {
  const pair = (entry) => ({
    본인: nameA, 본인궁: PILLAR_KO[entry.pillarA], 본인지지: entry.branchA,
    상대: nameB, 상대궁: PILLAR_KO[entry.pillarB], 상대지지: entry.branchB,
    합화오행: entry.element ?? null
  });
  const basis = compat.scoreBasis;
  return {
    십신방향: [
      { 작용자: nameB, 받는사람: nameA, 십신: compat.shipsinAtoBKo },
      { 작용자: nameA, 받는사람: nameB, 십신: compat.shipsinBtoAKo }
    ],
    배우자궁: { 본인: nameA, 본인일지: engineA.palja.dayPillar.branch,
      상대: nameB, 상대일지: engineB.palja.dayPillar.branch,
      관계: ({ yukhap: '육합', samhap: '삼합 두 지지', chung: '충' })[compat.dayRelation?.type] || '특별한 합충 없음' },
    교차육합: compat.crossYukhap.map(pair), 교차삼합두지지: compat.crossSamhap.map(pair), 교차충: compat.crossChung.map(pair),
    표면오행: [{ 이름: nameA, 개수: engineA.counts.ohaeng }, { 이름: nameB, 개수: engineB.counts.ohaeng }],
    용신상보: [
      { 용신주인: nameA, 용신: engineA.yongshin.final.main, 제공자: nameB, 제공자표면개수: engineB.counts.ohaeng[engineA.yongshin.final.main] },
      { 용신주인: nameB, 용신: engineB.yongshin.final.main, 제공자: nameA, 제공자표면개수: engineA.counts.ohaeng[engineB.yongshin.final.main] }
    ],
    점수산출: { 기본: basis.base, 육합가산: basis.yukhap, 삼합가산: basis.samhap, 충감산: basis.chung,
      일지보정: basis.day, 범위보정전: basis.raw, 하한: basis.min, 상한: basis.max, 최종: compat.score,
      산식제외: ['십신', '용신', '오행 상보', '시기 점수'] }
  };
}

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

## 궁합 확정 근거 (엔진 계산값에 이름과 양쪽 궁을 붙인 JSON — 궁합 사실은 이 값만 사용)
${JSON.stringify(compatFacts(engineA, engineB, nameA, nameB, compat), null, 2)}

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
- 궁합 점수는 점수산출의 최종 정수를 그대로 인용합니다. 기본 55에 교차 육합 개수×8, 삼합 두 지지 개수×10, 충 개수×(-10), 일지끼리 육합·삼합이면 +12 또는 충이면 -15를 더한 뒤 5~95로 제한합니다. 교차 목록에 일지끼리도 포함되며 일지보정은 추가분입니다. 산식제외 항목을 점수의 산출 근거로 설명하지 않습니다. 시기 점수는 별도 계산입니다.
- 십신은 반드시 "작용자가 받는사람에게 십신으로 다가온다"는 방향으로 읽습니다. 받는사람의 입장에서는 "작용자가 나에게 십신"입니다. 사람의 고정 성격처럼 "누구의 식신/편인"으로 줄여 방향을 흐리지 않습니다.
- 합·충을 인용할 때는 반드시 "${nameA}님의 연지–${nameB}님의 시지"처럼 양쪽 사람 이름과 궁을 모두 붙입니다. 빈 목록은 없다는 뜻입니다. 없는 충·합이나 합화오행이 null인 곳의 합화 오행을 만들지 않습니다. 삼합 두 지지 관계를 세 지지가 완성된 삼합국이라고 쓰지 않습니다.
- 표면오행은 각 명식의 천간·지지 8글자 개수이며 지장간·합화 후 분포가 아닙니다. 용신상보의 제공자표면개수가 0이면 그 제공자가 해당 용신을 채운다고 쓰지 않습니다. 교차 합의 오행을 표면 개수에 더하지 않습니다. 상보는 서로 같다고 가정하지 않습니다.
- 이 데이터만으로 다른 커플과의 비교·희소성·상대 속마음·실제 다툼이나 이별 원인을 확정하지 않습니다. "흔치 않다", "상위 몇 퍼센트" 같은 분포 없는 표현은 쓰지 않습니다. 실제 생활 장면은 가능성으로 제시합니다.
- 제출 전 본문·핵심 요약·지금 할 것·피할 것 네 구역의 십신 방향, 양쪽 궁, 오행 상보, 점수 산출 설명을 위 확정값과 각각 대조해 바로잡습니다. 이 검토 과정은 출력하지 않습니다.
- 리포트 제목이나 인사말 없이 첫 소제목부터 바로 시작합니다.`;
}

module.exports = { buildCompatPrompt };
