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

  const angleBlock = chapter.angle ? `\n\n## 이 챕터만의 관점(다른 챕터와 겹치지 않게)\n${chapter.angle}` : '';

  /* 골격(outline) — 소주제와 분량을 정해준다. 예전에는 "5,500자로 쓰라"고만 해서 모델이 할 말이
     떨어지면 절반에서 멈췄다(직업·적성운 실측 2,817자). 무엇을 다뤄야 그 분량이 나오는지를 주면
     분량이 구조로 보장되고 소주제끼리 같은 근거를 반복하지도 않는다. */
  const outline = Array.isArray(chapter.outline) ? chapter.outline : [];
  /* 분량 보정 — 모델은 "약 1,000자"를 요청하면 650자 안팎을 쓴다(2026-09 실측, 소주제 6개 전부
     같은 비율). 모델의 글자 수 감각이 실제보다 작게 잡혀 있어서, 목표에 닿게 하려면 요청 숫자를
     키워야 한다. 아래 계수는 실측으로 맞춘 값이고, chapters.js의 targetWords는 실제 결과물 기준을
     그대로 둔다(그게 상품 설명·검수 기준). */
  const ASK_RATIO = 1.5;
  const ask = (n) => Math.round(n * ASK_RATIO / 50) * 50;
  const outlineBlock = outline.length
    ? `\n\n## 이 챕터의 구성 (이 순서대로, 각 소주제를 "### 소제목" 한 줄로 시작)\n` +
      outline.map((o, i) => `${i + 1}. ### ${o.heading} — 약 ${ask(o.words)}자\n   ${o.hint}`).join('\n') +
      `\n\n소주제를 하나도 빠뜨리지 말고, 각 소주제의 분량을 지키세요. 소주제끼리 같은 근거·같은 문장을 반복하지 말고, 앞 소주제에서 이미 쓴 사실은 "앞서 본 것처럼" 정도로만 짧게 받으세요. "### 소제목" 줄은 정확히 위 표기(### 뒤 한 칸)로 쓰고, 소제목 줄 바로 다음 줄부터 본문을 이어가세요.`
    : '';

  const userMessage = `# 챕터: 제${chapter.id}장 "${chapter.title}"

## 이 챕터에서 쓸 수 있는 명식 데이터 (이 JSON에 없는 사실은 언급 금지)
\`\`\`json
${JSON.stringify(engineSlice, null, 2)}
\`\`\`

## 참고 해석 사전 (이 내용에 근거해 서술)
${refText || '(해당 챕터는 명식 데이터만으로 서술)'}
${priorBlock}${angleBlock}${outlineBlock}

## 이 사람 정보
이름: ${person.name || '(익명)'} / 성별: ${person.gender || '(미상)'}

## 지시
위 명식 데이터와 해석 사전만 근거로 "${chapter.title}" 챕터를 작성하세요. 분량은 한글 기준 ${ask(chapter.targetWords)}자에 최대한 가깝게(짧게 끝내지 말고 이 근처까지) 채워주세요.${outline.length ? ' 위 "이 챕터의 구성"의 소주제별 분량을 합치면 이 목표가 됩니다 — 소주제마다 정해진 분량을 채우는 것으로 목표에 도달하세요.' : ' 부족하면 근거 데이터를 다른 각도(궁위·육친·개운법 등)에서 더 풀어써서 채우되, 빈 말로 늘리지는 마세요.'}

일간·격국·용신·오행 분포 같은 기초 사실은 "이전 챕터 핵심 요지"에서 이미 여러 번 나왔다면 그 사실을 처음부터 다시 설명하지 말고, 이미 안다는 전제로 바로 이 챕터의 주제(${chapter.title})에 적용한 해석으로 들어가세요.

${outline.length ? '마지막 소주제는' : '챕터 마지막 문단은'} 반드시 이 챕터에서 실제로 다룬 내용을 압축한 "핵심 요약" 1~2문장과, 그 내용에 바로 이어지는 구체적인 실천 포인트 2개로 마무리하세요. "긍정적으로 생각하세요", "노력하세요" 같은 뻔한 조언이 아니라, 이 챕터에서 나온 근거(예: 특정 오행 부족, 특정 십신 강세 등)에 실제로 대응하는 행동이어야 합니다. 챕터 제목은 쓰지 말고 본문만 작성하세요.`;

  return userMessage;
}

module.exports = { buildChapterPrompt, loadInterpretationSections, sliceEngineJson, getByPath };
