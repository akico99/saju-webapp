'use strict';
/* 18챕터 풀 루프 — 동시성 제한, 재시도, 진행률 콜백, chapters.json 증분 저장.
   중간 실패 시 그 챕터만 재시도할 수 있도록 매 챕터 결과를 즉시 디스크에 쓴다. */

const fs = require('fs');
const path = require('path');
const { CHAPTERS } = require('./chapters');
const { buildChapterPrompt } = require('./promptBuilder');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { generateText } = require('./client');

// 예전엔 3개씩 동시 처리했는데, 같은 배치로 묶인 챕터끼리는 서로 아직 안 끝난 상태라
// "이전 챕터 요약"을 못 보고 써서 그 3개끼리 내용이 겹치는 문제가 있었다. 순차 처리로
// 바꿔 매 챕터가 그 앞의 모든 챕터를 확실히 참고하게 한다(생성 시간은 늘어나지만, 100p
// 유료 리포트에서는 속도보다 챕터 간 중복 없는 품질이 우선).
const CONCURRENCY = 1;

function summarize(text) {
  // 다음 챕터 프롬프트에 넣을 짧은 핵심 요지(중복 서술 방지용) — 첫 문장 위주로 축약
  const firstSentences = text.split(/(?<=[.!?다요])\s+/).slice(0, 2).join(' ');
  return firstSentences.slice(0, 120);
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

  function priorSummaries(uptoIndex) {
    return results.slice(0, uptoIndex).filter(Boolean).map(r => r.summary);
  }

  let completed = results.filter(Boolean).length;
  const total = CHAPTERS.length;
  if (onProgress) onProgress({ current: completed, total });

  // 순서 의존성(이전 챕터 요약 참조) 때문에 앞에서부터 CONCURRENCY개씩 배치 처리
  for (let start = 0; start < CHAPTERS.length; start += CONCURRENCY) {
    const batch = CHAPTERS.slice(start, start + CONCURRENCY);
    await Promise.all(batch.map(async (chapter, offset) => {
      const idx = start + offset;
      if (results[idx]) return; // 이미 생성됨(재개 시)
      const prompt = buildChapterPrompt(chapter, engineResult, person, priorSummaries(idx));
      const { text, usage } = await generateText(SYSTEM_PROMPT, prompt);
      results[idx] = { id: chapter.id, title: chapter.title, text, summary: summarize(text), usage };
      completed++;
      persist();
      if (onProgress) onProgress({ current: completed, total });
    }));
  }

  return results;
}

module.exports = { generateReport };
