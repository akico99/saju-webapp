'use strict';
/* 주제별 심층 리딩(3,900원) — 990원 빠른 리딩을 대체한다.

   990원은 18장 리포트의 챕터 하나를 900자로 눌러 짠 것이라, 결론만 툭 던지고 "그래서
   언제, 뭘 하라는 건지"가 빠졌다. 분량이 아니라 시간축(대운·세운)이 통째로 없던 게 문제다.
   심층 리딩은 네 부분으로 만든다:

   1. 명식 한 장 — 일간·오행 균형·용신·격국. LLM 없이 엔진 값으로 그린다(템플릿 쪽).
   2. 타고난 구조 — 해당 챕터를 리포트와 같은 풀 분량으로. 프롬프트·가드레일 동일.
   3. 지금 대운, 앞으로 3년 — 인생 그래프와 같은 점수(relationScore)로 현재 대운과 다음
      3개 세운을 뽑아 주고, 이 주제 관점에서만 해석하게 한다.
   4. 지금 할 것 / 피할 것 — 3번과 같은 호출에서 받아 파싱한다.

   LLM 호출은 챕터 수 + 1회. 단일 주제는 2회, 첫 풀이(3장)는 4회. */
const { CHAPTERS } = require('./chapters');
const { buildChapterPrompt } = require('./promptBuilder');
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { generateText, sumUsage } = require('./client');
const { computeDaewoonScores, relationScore } = require('../pdf/charts');
const { STEM_OHAENG, BRANCH_MAIN_STEM, STEM_KO, BRANCH_KO } = require('../engine/constants');
const { computeCareerTimeline } = require('../engine/timing');

const DEEP_TOPICS = {
  intro: { chapterIds: [1, 2, 3], perChapterWords: 2000, label: '내 사주 첫 풀이', focus: '이 사람의 타고난 성격·기질과 오행 균형 전체' },
  wealth: { chapterIds: [8], label: '재물운', focus: '돈이 들어오고 나가는 흐름, 수입 구조, 지출과 저축, 투자·사업 판단' },
  career: { chapterIds: [9], label: '직업·적성운', focus: '일의 방향, 적성, 직장과 독립, 이직·승진 같은 커리어 판단' },
  love: { chapterIds: [11], label: '애정·결혼운', focus: '연애와 인연의 흐름, 관계가 시작·깊어지는 시기, 결혼 판단' },
  relationship: { chapterIds: [13], label: '대인관계·인복', focus: '사람과의 관계 방식, 도움을 주고받는 인연, 갈등이 생기기 쉬운 자리' },
  health: { chapterIds: [12], label: '건강운', focus: '타고난 체질과 약한 곳, 무리가 오기 쉬운 시기, 생활 습관' }
};

function ganZhiKo(ganZhi) {
  if (!ganZhi || ganZhi.length < 2) return '';
  return (STEM_KO[ganZhi[0]] || '') + (BRANCH_KO[ganZhi[1]] || '');
}

function scoreOf(ganZhi, yongshinMain) {
  if (!ganZhi) return 50;
  const stemO = STEM_OHAENG[ganZhi[0]]?.ohaeng;
  const branchMain = BRANCH_MAIN_STEM[ganZhi[1]];
  const branchO = branchMain ? STEM_OHAENG[branchMain]?.ohaeng : null;
  const raw = Math.round(relationScore(stemO, yongshinMain) * 0.5 + relationScore(branchO, yongshinMain) * 0.5);
  return Math.max(5, Math.min(95, raw));
}

function tier(score) {
  if (score >= 80) return '크게 도와주는 시기';
  if (score >= 65) return '순조로운 시기';
  if (score >= 40) return '무난한 시기';
  if (score >= 25) return '조심스러운 시기';
  return '신중해야 할 시기';
}

/* 인생 그래프(lifeGraph.js)와 같은 계산으로 현재 대운과 앞으로 3년 세운을 뽑는다.
   숫자는 여기서 확정하고 LLM에는 해석만 맡긴다 — 점수를 LLM이 지어내면 그래프와 어긋난다. */
function buildTimingData(engineResult, now = new Date()) {
  const yongshinMain = engineResult.yongshin.final.main;
  const birthYear = engineResult.meta.input.year;
  const currentAge = now.getFullYear() - birthYear + 1;
  const decades = computeDaewoonScores(engineResult.daewoon, yongshinMain).map((d) => ({ ...d, ganZhiKo: ganZhiKo(d.ganZhi) }));

  let current = null, next = null;
  for (let i = 0; i < decades.length; i++) {
    const d = decades[i], n = decades[i + 1];
    if (currentAge >= d.age && (!n || currentAge < n.age)) { current = d; next = n || null; break; }
  }
  if (!current && decades.length) { current = decades[0]; next = decades[1] || null; }

  const thisYear = now.getFullYear();
  const years = engineResult.daewoon.flatMap((d) => d.years)
    .filter((y) => y.ganZhi && y.year >= thisYear && y.year <= thisYear + 2)
    .map((y) => ({
      year: y.year, age: y.age, ganZhi: y.ganZhi, ganZhiKo: ganZhiKo(y.ganZhi),
      score: scoreOf(y.ganZhi, yongshinMain),
      stemShipsin: y.stemShipsinKo || null, branchShipsin: y.branchShipsinKo || null,
      unseong: y.unseong || null
    }));

  return { yongshinMain, currentAge, current, next, years };
}

/* 직업·적성 심층 리딩에만 붙는 5년 이직 타임라인 — 예전 990원 "이직 시기" 상품이 쓰던
   computeCareerTimeline 그대로. 그 상품은 이 표 하나가 결과의 전부였는데, 여기서는 챕터
   본문·3년 흐름과 함께 실려 "언제 움직일지"의 근거 하나로 들어간다. */
function buildCareerTimeline(engineResult, now = new Date()) {
  return computeCareerTimeline(engineResult, now.getFullYear(), 5)
    .map((r) => ({ ...r, ganZhiKo: ganZhiKo(r.ganZhi) }));
}

function timingBlockText(t) {
  const cur = t.current
    ? `- 현재 대운: ${t.current.ganZhiKo}(${t.current.ganZhi}) 대운, ${t.current.age}세 시작, 점수 ${t.current.score} (${tier(t.current.score)})`
    : '- 현재 대운: (대운 진입 전)';
  const nxt = t.next ? `- 다음 대운: ${t.next.ganZhiKo}(${t.next.ganZhi}) 대운, ${t.next.age}세 시작, 점수 ${t.next.score} (${tier(t.next.score)})` : '- 다음 대운: (자료 없음)';
  const yrs = t.years.map((y) => `- ${y.year}년(${y.age}세) ${y.ganZhiKo}(${y.ganZhi}) 세운: 점수 ${y.score} (${tier(y.score)}) · 천간 ${y.stemShipsin || '-'} · 지지 ${y.branchShipsin || '-'} · 12운성 ${y.unseong || '-'}`).join('\n');
  return `${cur}\n${nxt}\n${yrs}`;
}

function careerBlockText(rows) {
  if (!rows || !rows.length) return '';
  const lines = rows.map((r) => `- ${r.year}년(${r.age}세) ${r.ganZhiKo}: 커리어 점수 ${r.score}, 주도 기운 ${r.group} — ${r.desc}`);
  return '\n\n## 이직·승진 관점 5년 타임라인 (확정값)\n' + lines.join('\n');
}

function buildTimingPrompt(topic, engineResult, person, timing) {
  const yearList = timing.years.map((y) => y.year + '년').join(' · ');
  return `# ${topic.label} — 지금 대운과 앞으로 3년

## 점수 자료 (이 숫자는 확정값입니다. 바꾸거나 새로 만들지 마세요)
점수는 그 시기 간지의 오행이 이 사람의 용신(${timing.yongshinMain})을 얼마나 도와주는지로 계산한 값입니다. 0~100, 높을수록 유리.
${timingBlockText(timing)}${careerBlockText(timing.careerTimeline)}

## 이 사람 정보
이름: ${person.name || '(익명)'} / 성별: ${person.gender || '(미상)'} / 현재 ${timing.currentAge}세 / 일간 ${engineResult.ilgan.char}(${engineResult.ilgan.ko}) / 용신 ${timing.yongshinMain} / 격국 ${engineResult.kyukguk.name}

## 지시
위 점수 자료만 근거로, 오직 "${topic.label}" 관점(${topic.focus})에서 아래 형식 그대로 작성하세요. 다른 주제(예: 재물운 리딩에서 연애 얘기)는 꺼내지 마세요.

### 흐름
현재 대운이 이 주제에 어떤 바탕을 깔고 있는지 1문단, 이어서 ${yearList} 각각을 1문단씩. 각 연도 문단은 반드시 그 해 점수와 십신·12운성을 근거로 들고, "이 해에는 이런 일이 풀리기 쉽다/막히기 쉽다"를 구체적으로 쓰세요. 점수가 높은 해와 낮은 해의 차이가 글에서 분명히 드러나야 합니다. 총 2,100~2,700자(현재 대운 문단 600자 이상, 연도 문단 각 500자 이상).

### 지금 할 것
- 항목 5개. 각 항목은 한 줄, 위 흐름에서 나온 근거에 실제로 대응하는 행동. "긍정적으로 생각하기" 같은 뻔한 말 금지.

### 피할 것
- 항목 5개. 같은 기준.

세 소제목("### 흐름", "### 지금 할 것", "### 피할 것")을 정확히 이 표기로 쓰고, 그 밖의 제목이나 머리말은 쓰지 마세요.`;
}

function parseTimingText(text) {
  const grab = (name) => {
    const m = new RegExp('###\\s*' + name + '\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)').exec(text);
    return m ? m[1].trim() : '';
  };
  const bullets = (s) => s.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
  const flow = grab('흐름');
  const dos = bullets(grab('지금 할 것'));
  const donts = bullets(grab('피할 것'));
  // 형식이 무너져도 본문은 버리지 않는다 — 소제목을 못 찾으면 전체를 흐름으로 쓴다.
  return { flow: flow || text.trim(), dos, donts };
}

/**
 * @returns {{ topicKey, title, chapters: [{id,title,text}], timing: {flow,dos,donts,data}, usage }}
 */
async function generateDeepReading(engineResult, person, topicKey) {
  const topic = DEEP_TOPICS[topicKey];
  if (!topic) throw new Error(`알 수 없는 심층 리딩 주제입니다: ${topicKey}`);

  const usages = [];
  const chapters = [];
  const priorSummaries = [];
  for (const id of topic.chapterIds) {
    const base = CHAPTERS.find((c) => c.id === id);
    // 분량을 줄여 쓰는 주제(첫 풀이)는 골격의 소주제별 분량도 같은 비율로 줄인다 —
    // 안 그러면 소주제 합이 5,500인데 목표는 2,000이라 지시가 서로 어긋난다.
    let chapter = base;
    if (topic.perChapterWords) {
      const ratio = topic.perChapterWords / base.targetWords;
      chapter = {
        ...base, targetWords: topic.perChapterWords,
        outline: (base.outline || []).map((o) => ({ ...o, words: Math.max(150, Math.round(o.words * ratio / 50) * 50) }))
      };
    }
    const prompt = buildChapterPrompt(chapter, engineResult, person, priorSummaries);
    const { text, usage } = await generateText(SYSTEM_PROMPT, prompt);
    usages.push(usage);
    chapters.push({ id, title: base.title, text });
    // 다음 챕터가 같은 기초 사실을 반복하지 않게 앞 챕터의 마지막 문단(핵심 요약)을 넘긴다.
    const paras = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (paras.length) priorSummaries.push(paras[paras.length - 1].slice(0, 300));
  }

  const timingData = buildTimingData(engineResult);
  if (topicKey === 'career') timingData.careerTimeline = buildCareerTimeline(engineResult);
  const { text: timingText, usage: timingUsage } = await generateText(SYSTEM_PROMPT, buildTimingPrompt(topic, engineResult, person, timingData));
  usages.push(timingUsage);
  const timing = { ...parseTimingText(timingText), data: timingData };

  return { topicKey, title: topic.label, chapters, timing, usage: sumUsage(usages) };
}

/* 웹 화면과 주문 보관용 — 섹션 제목을 "## "로 달아 한 덩어리 텍스트로 만든다.
   quick-app.js가 이 텍스트를 받아 제목/문단으로 그린다. */
function toPlainText(reading) {
  const parts = [];
  for (const ch of reading.chapters) parts.push(`## ${ch.title}\n\n${ch.text}`);
  parts.push(`## 지금 대운, 앞으로 3년\n\n${reading.timing.flow}`);
  if (reading.timing.dos.length) parts.push(`## 지금 할 것\n\n${reading.timing.dos.map((d) => '- ' + d).join('\n')}`);
  if (reading.timing.donts.length) parts.push(`## 피할 것\n\n${reading.timing.donts.map((d) => '- ' + d).join('\n')}`);
  return parts.join('\n\n');
}

module.exports = { generateDeepReading, DEEP_TOPICS, buildTimingData, buildCareerTimeline, toPlainText, tier, parseTimingText };
