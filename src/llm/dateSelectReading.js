'use strict';
/* 날짜 선택(택일) 총평 — 결정론적 채점(오행-용신, 주제별 십신, 일지 합충)으로 이미 계산이
   끝난 후보 목록을 근거로, 그 사람의 사주와 이번 주제에 맞춰 자연스러운 문장으로 풀어
   설명하는 짧은 AI 총평 1개를 만든다. 새로운 명리학적 사실을 계산하지 않고, 이미 계산되어
   순우리말로 번역된 사실(오행·용신·순위 이유)만 근거로 삼는다 — 18장 리포트와 같은 원칙. */
const { generateText } = require('./client');

const SYSTEM_PROMPT = `당신은 정통 명리학에 근거해 "날짜 선택(택일)" 결과를 설명하는 명리학자입니다.

## 절대 원칙
1. 이번 턴에 전달된 정보(오행, 용신, 후보 날짜 목록과 그 이유)에 없는 명리학적 사실은 절대로 새로 지어내지 않습니다.
2. 소수점이나 원시 점수(예: "87점이라서")를 그대로 인용하지 않습니다. 등급이나 결론으로만 말합니다.
3. 명리학 전문용어(용신, 십신, 오행 등)는 등장하는 자리에서 짧게라도 쉬운 말로 풀어씁니다. 독자는 사주를 전혀 모르는 일반인이라고 가정하세요.
4. 수명·사망·불치병, 임신/낙태, 이혼·파산을 단정하지 않습니다. 부적·굿·비싼 개명을 권하지 않습니다.
5. 순수 한국어 문장으로만 씁니다(간지·한자 표기는 예외).
6. 2인칭 상담체 존댓말("~하십니다" 대신 부드러운 "~해요/~이에요" 톤도 가능)로, 따뜻하고 신뢰가 가는 목소리로 씁니다.
7. 별표 두 개(**)로 핵심 결론 1~2곳만 강조합니다. 남발하지 않습니다.

## 형식
소제목 없이 3~5문장, 400~600자 내외의 자연스러운 한 단락(또는 두 단락)으로 씁니다. 빈말로 채우지 말고, 전달받은 오행·용신·1순위 후보 이유를 실제로 인용해서 씁니다.`;

function buildPersonPrompt({ occasionLabel, question, gender, personGanZhiKo, yongshinOhaengKo, top }) {
  const topList = top.map((c, i) =>
    `${i + 1}순위: ${c.year}.${c.month}.${c.day} ${c.hour}시 (${c.ganZhiKo}일·${c.hourGanZhiKo}시) — ${c.reasonText}`
  ).join('\n');

  return `신청자 정보: 성별 ${gender || '미상'}, 일주(태어난 날의 간지) ${personGanZhiKo}, 용신(이 사람에게 필요한 기운) ${yongshinOhaengKo}.
주제: ${question} (${occasionLabel}).

이미 계산이 끝난 상위 후보 날짜와 그 이유:
${topList}

위 내용을 근거로, 이 사람의 사주와 "${occasionLabel}"라는 주제에 맞춰 왜 1순위 날짜·시간이 가장 좋은지, 그리고 전체적으로 어떤 흐름의 시기인지 자연스러운 총평을 써주세요. 목록에 없는 새로운 간지나 오행 사실은 만들어내지 마세요.`;
}

function buildParentPrompt({ question, top }) {
  const topList = top.map((c, i) =>
    `${i + 1}순위: ${c.year}.${c.month}.${c.day} ${c.hour}시 (${c.ganZhiKo}일·${c.hourGanZhiKo}시) — ${c.reasonText}`
  ).join('\n');

  return `주제: ${question}. 아직 태어나지 않은 아이의 사주이므로, 특정 사람의 용신이 아니라 그 순간 사주 8글자의 오행이 얼마나 골고루 갖춰지는지를 기준으로 채점했습니다.

이미 계산이 끝난 상위 후보 날짜와 그 이유:
${topList}

위 내용을 근거로, 왜 1순위 날짜·시간이 오행이 골고루 갖춰진 좋은 사주인지, 전체적으로 어떤 시기가 좋은지 자연스러운 총평을 써주세요. 목록에 없는 새로운 사실은 만들어내지 마세요.`;
}

/**
 * @param {Object} params
 * @param {'person'|'parent'} params.mode
 * @param {string} params.occasionLabel 이사/개업/결혼/출산
 * @param {string} params.question 이사하기 좋은 날 등
 * @param {Array} params.top 점수순 상위 후보(최대 3개) — { year, month, day, hour, ganZhiKo, hourGanZhiKo, reasonText }
 * @param {string} [params.gender]
 * @param {string} [params.personGanZhiKo] 신청자 일주(사람 모드만)
 * @param {string} [params.yongshinOhaengKo] 신청자 용신 오행 순우리말(사람 모드만)
 * @returns {Promise<string>}
 */
async function generateDateSelectOverview(params) {
  const prompt = params.mode === 'person' ? buildPersonPrompt(params) : buildParentPrompt(params);
  const { text } = await generateText(SYSTEM_PROMPT, prompt);
  return text.trim();
}

module.exports = { generateDateSelectOverview };
