'use strict';
/* 표지 맨 위에 실리는 "평생사주 3줄 요약" — 18챕터 시작 전에 먼저 읽는 첫인상용 카피.
   기존 리포트와 같은 시스템 프롬프트(사실 기반, 지어내지 않기)를 그대로 쓰되, 형식만
   "짧고 확신에 찬 3문장"으로 별도 지시한다. */
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { generateText } = require('./client');

function buildCoverSummaryPrompt(engineResult, person) {
  const facts = {
    일간: `${engineResult.ilgan.char}(${engineResult.ilgan.ko})`,
    신강신약: engineResult.strength.verdict,
    격국: engineResult.kyukguk.name,
    용신: engineResult.yongshin.final.main,
    부족한오행: engineResult.counts.lacking,
    비어있는십성그룹: engineResult.counts.missingShipsin
  };

  return `아래는 ${person.name ? person.name + ' 님' : '이 사람'}의 명식 핵심 데이터입니다.

\`\`\`json
${JSON.stringify(facts, null, 2)}
\`\`\`

## 지시
이 사람의 사주를 딱 3문장으로 요약하세요. 100페이지 리포트 표지 맨 위, 본문을 펼치기 전에
가장 먼저 읽는 첫인상용 요약입니다.
- 정확히 3문장만 씁니다. 각 문장은 20~40자 내외로 짧고 단정하게.
- 명리학 용어는 한 글자도 쓰지 않습니다. 위 데이터가 뜻하는 실제 기질·강점·주의점만
  현대적이고 확신에 찬 말투로 풀어씁니다(존댓말 유지, 군더더기 수식어는 뺍니다).
- 첫 문장: 이 사람의 타고난 기질·강점. 둘째 문장: 지금 이 사람에게 중요한 균형이나
  주의점. 셋째 문장: 이 사람이 나아가면 좋을 삶의 방향.
- 위 JSON에 없는 사실은 절대 지어내지 않습니다.
- 마크다운·소제목·번호·강조(**) 없이, 3개 문장만 줄바꿈으로 구분해 출력하세요.`;
}

async function generateCoverSummary(engineResult, person) {
  const prompt = buildCoverSummaryPrompt(engineResult, person);
  const { text, usage } = await generateText(SYSTEM_PROMPT, prompt);
  const lines = text.trim().split('\n').map((s) => s.trim()).filter(Boolean);
  return { lines: lines.slice(0, 3), usage };
}

module.exports = { generateCoverSummary };
