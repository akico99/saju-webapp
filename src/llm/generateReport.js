'use strict';
/* 18챕터 풀 루프 — 동시성 제한, 재시도, 진행률 콜백, chapters.json 증분 저장.
   중간 실패 시 그 챕터만 재시도할 수 있도록 매 챕터 결과를 즉시 디스크에 쓴다. */

const fs = require('fs');
const path = require('path');
const { CHAPTERS } = require('./chapters');
const { buildChapterPrompt } = require('./promptBuilder');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { generateText } = require('./client');

/* 예전에는 순차로 돌렸다. 매 챕터가 앞선 챕터들의 요약을 보고 중복을 피하게 하려는 의도였는데,
   그 요약이 실제로는 본문 5,500자에서 첫 두 문장 120자를 잘라낸 것이었다. 앞 챕터가 무엇을
   다뤘는지가 아니라 어떻게 시작했는지만 전달된 셈이다. 그 얇은 신호 하나 때문에 18단 깊이의
   의존 사슬이 생겨 생성이 10~20분 걸렸다.

   지금은 각 챕터가 나머지 17개 챕터의 소주제 목록을 통째로 본다. 이 목록은 chapterOutlines.js에
   이미 정의된 정적 데이터라 추가 호출도, 생성 지연도 없다. 요약보다 훨씬 구체적이고, 앞뒤
   양방향으로 작동하며, 챕터 1이 아무 맥락 없이 쓰이던 불공평도 사라진다. 순서 의존이 없어져
   병렬로 돌릴 수 있다.

   동시성 기본값은 보수적으로 4다. 분당 출력 토큰 한도에 걸리면 SDK가 retry-after만큼 기다렸다
   재시도한다(client.js). 실제 한도는 getLastRateLimit()으로 확인한 뒤 조정한다. */
const CONCURRENCY = Math.max(1, Number(process.env.SAJU_CHAPTER_CONCURRENCY || 4));

/** 이 챕터를 뺀 나머지 챕터가 무엇을 맡는지 — 소주제 제목까지 펼쳐 보여준다. */
function buildChapterMap(currentId) {
  return CHAPTERS
    .filter((c) => c.id !== currentId)
    .map((c) => {
      const heads = (c.outline || []).map((o) => o.heading).join(' · ');
      return `- 제${c.id}장 ${c.title}${heads ? ': ' + heads : ''}`;
    })
    .join('\n');
}

/** 동시 실행 수를 제한한 채 전부 처리한다. 하나라도 실패하면 상위로 던진다(주문 실패·환불 경로 유지). */
async function runPool(count, limit, worker) {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, count) }, async () => {
    for (let i = cursor++; i < count; i = cursor++) await worker(i);
  });
  await Promise.all(lanes);
}

/**
 * @param {Object} engineResult computeSaju() 결과
 * @param {Object} person {name, gender}
 * @param {string} outputDir 이 job의 output 폴더 (chapters.json 저장 위치)
 * @param {(progress: {current:number, total:number}) => void} onProgress
 */
async function generateReport(engineResult, person, outputDir, onProgress) {
  const chaptersPath = path.join(outputDir, 'chapters.json');
  const results = new Array(CHAPTERS.length).fill(null);

  // 이미 저장된 결과가 있으면 이어서 재시도(중간 실패 재개용)
  if (fs.existsSync(chaptersPath)) {
    try {
      const saved = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
      saved.forEach((r, i) => { if (r) results[i] = r; });
    } catch { /* 손상된 파일은 무시하고 처음부터 */ }
  }

  function persist() {
    fs.writeFileSync(chaptersPath, JSON.stringify(results, null, 2));
  }

  let completed = results.filter(Boolean).length;
  const total = CHAPTERS.length;
  if (onProgress) onProgress({ current: completed, total });

  await runPool(CHAPTERS.length, CONCURRENCY, async (idx) => {
    if (results[idx]) return; // 이미 생성됨(재개 시)
    const chapter = CHAPTERS[idx];
    const prompt = buildChapterPrompt(chapter, engineResult, person, [], {
      chapterMap: buildChapterMap(chapter.id)
    });
    // 잘림 재시도는 챕터 하나를 통째로 다시 만드는 일이라 비싸다. 넉넉히 열어 애초에 덜 잘리게 한다.
    const { text, usage } = await generateText(SYSTEM_PROMPT, prompt, { maxTokens: 16000 });
    results[idx] = { id: chapter.id, title: chapter.title, text, usage };
    completed++;
    persist();
    if (onProgress) onProgress({ current: completed, total });
  });

  return results;
}

module.exports = { generateReport, buildChapterMap };
