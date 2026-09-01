'use strict';
/* 챕터별 프롬프트 조립 — 엔진 JSON의 일부 필드만, interpretation.md의 해당 섹션만 슬라이스해
   프롬프트를 작게 유지한다(관련 없는 필드를 근거 없이 인용하는 사고 방지). */

const fs = require('fs');
const path = require('path');

const INTERPRETATION_PATH = path.join(__dirname, '..', 'reference', 'interpretation.md');
let interpretationCache = null;

function loadInterpretationSections() {
  if (interpretationCache) return interpretationCache;
  const raw = fs.readFileSync(INTERPRETATION_PATH, 'utf8');
  const lines = raw.split('\n');
  const sections = {};
  let currentNum = null;
  let buf = [];
  const headerRe = /^## (\d+)\./;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (currentNum !== null) sections[currentNum] = buf.join('\n').trim();
      currentNum = Number(m[1]);
      buf = [line];
    } else if (currentNum !== null) {
      buf.push(line);
    }
  }
  if (currentNum !== null) sections[currentNum] = buf.join('\n').trim();
  interpretationCache = sections;
  return sections;
}

function getByPath(obj, dotPath) {
  return dotPath.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function sliceEngineJson(engineResult, fieldPaths) {
  const out = {};
  fieldPaths.forEach(p => {
    const value = getByPath(engineResult, p);
    if (value === undefined) return;
    // 마지막 키만 남기고 중첩 구조는 얕게 유지 (예: 'counts.shipsinGroup.인성' -> {counts:{shipsinGroup:{인성:v}}})
    const keys = p.split('.');
    let cursor = out;
    for (let i = 0; i < keys.length - 1; i++) {
      cursor[keys[i]] = cursor[keys[i]] || {};
      cursor = cursor[keys[i]];
    }
    cursor[keys[keys.length - 1]] = value;
  });
  return out;
}

/**
 * @param {Object} chapter chapters.js의 항목 하나
 * @param {Object} engineResult computeSaju() 결과
 * @param {Object} person {name, gender}
 * @param {string[]} priorSummaries 이전 챕터 핵심 요지 요약(불릿, 중복 방지용)
 */
function buildChapterPrompt(chapter, engineResult, person, priorSummaries) {
  const sections = loadInterpretationSections();
  const engineSlice = sliceEngineJson(engineResult, chapter.engineFieldPaths);
  const refText = chapter.interpretationRefs
    .map(n => sections[n])
    .filter(Boolean)
    .join('\n\n---\n\n');

  const priorBlock = priorSummaries.length
    ? `\n\n## 이전 챕터 핵심 요지(중복 서술 방지용)\n${priorSummaries.map(s => `- ${s}`).join('\n')}`
    : '';

  const userMessage = `# 챕터: 제${chapter.id}장 "${chapter.title}"

## 이 챕터에서 쓸 수 있는 명식 데이터 (이 JSON에 없는 사실은 언급 금지)
\`\`\`json
${JSON.stringify(engineSlice, null, 2)}
\`\`\`

## 참고 해석 사전 (이 내용에 근거해 서술)
${refText || '(해당 챕터는 명식 데이터만으로 서술)'}
${priorBlock}

## 이 사람 정보
이름: ${person.name || '(익명)'} / 성별: ${person.gender || '(미상)'}

## 지시
위 명식 데이터와 해석 사전만 근거로 "${chapter.title}" 챕터를 작성하세요. 분량은 한글 기준 ${chapter.targetWords}자에 최대한 가깝게(짧게 끝내지 말고 이 근처까지) 채워주세요. 부족하면 근거 데이터를 다른 각도(궁위·육친·개운법 등)에서 더 풀어써서 채우되, 빈 말로 늘리지는 마세요. 챕터 제목은 쓰지 말고 본문만 작성하세요.`;

  return userMessage;
}

module.exports = { buildChapterPrompt, loadInterpretationSections, sliceEngineJson, getByPath };
