'use strict';
/* 2027 신년운세(9,900원) — 한 해를 총운·12개월·네 주제·분기로 나눠 읽는 유료 상품.

   숫자는 모두 엔진이 정한다(engine/monthlyFlow): 총운 점수, 1~12월 점수, 재물·일·애정·건강
   네 주제의 연간 점수와 월별 점수. AI는 그 확정값을 해석만 하고 새 숫자를 만들지 않는다.
   LLM 호출은 1회(maxTokens 20000). 충분한 개인화 근거와 5,800~6,500자 분량을 요청하고,
   응답은 "### 총운 / 월별 풀이 / 재물운 / ..." 소제목으로
   받아 관대하게 파싱한다 — 빠진 섹션은 빈 값이고, 월별 풀이가 없어도 그래프는 나온다.

   해가 바뀌면 YEAR만 올리면 된다(상품 키 new_year_2027은 따로 바꿔야 한다). */
const { SYSTEM_PROMPT } = require('./systemPrompt');
const { generateText } = require('./client');
const { monthlyFlow, yearlyFlow } = require('../engine/monthlyFlow');
const { buildTimingData, tier } = require('./deepReading');
const { safeName } = require('../pdf/personName');

const YEAR = 2027;

/* 네 주제. key는 monthlyFlow의 topic 값, heading은 AI 응답의 소제목(aliases는 표기가 조금 달라도 받는다). */
const NEWYEAR_TOPICS = [
  { key: 'wealth', label: '재물운', heading: '재물운', aliases: ['재물'], focus: '수입·지출·저축·투자와 사업 판단' },
  { key: 'career', label: '일·직업운', heading: '일·직업운', aliases: ['일직업운', '직업운', '일과 직업운', '일·직업', '일·커리어운', '직업·적성운'], focus: '일의 방향, 승진·이직·독립 같은 커리어 판단' },
  { key: 'love', label: '애정운', heading: '애정운', aliases: ['애정·결혼운', '연애운', '애정'], focus: '인연이 시작되고 깊어지는 흐름, 연애·결혼·관계 판단' },
  { key: 'health', label: '건강운', heading: '건강운', aliases: ['건강'], focus: '생활 리듬과 컨디션 관리(질병·의학 얘기는 하지 않음)' }
];
const QUARTERS = [
  { q: 1, label: '1분기', range: '1~3월', months: [1, 2, 3] },
  { q: 2, label: '2분기', range: '4~6월', months: [4, 5, 6] },
  { q: 3, label: '3분기', range: '7~9월', months: [7, 8, 9] },
  { q: 4, label: '4분기', range: '10~12월', months: [10, 11, 12] }
];

function bestOf(rows) { return rows.reduce((a, b) => (b.score > a.score ? b : a)); }
/* 가장 낮은 달 — 점수가 같으면 더 나중 달. 가장 좋은 달과 같은 달이면(전부 같은 점수) null. */
function cautionOf(rows, best) {
  const c = rows.reduce((a, b) => (b.score <= a.score ? b : a));
  return c.month === best.month ? null : c;
}
const pick = (m) => ({ month: m.month, score: m.score });

/** 엔진 숫자만으로 신년운세의 모든 점수를 확정한다. 실패하면 던진다(호출한 쪽이 주문을 환불). */
function buildNewYearData(engine, person = {}, opts = {}) {
  const year = opts.year || YEAR;
  const gender = person.gender || engine.meta.input.gender || null;
  const [yr] = yearlyFlow(engine, [year], { topic: 'intro', gender });
  const months = monthlyFlow(engine, { fromYear: year, fromMonth: 1, count: 12, topic: 'intro', gender });
  const best = bestOf(months);
  const caution = cautionOf(months, best);

  const topics = NEWYEAR_TOPICS.map((t) => {
    const [ty] = yearlyFlow(engine, [year], { topic: t.key, gender });
    const tm = monthlyFlow(engine, { fromYear: year, fromMonth: 1, count: 12, topic: t.key, gender });
    const tb = bestOf(tm);
    const tc = cautionOf(tm, tb);
    return { key: t.key, label: t.label, score: ty.score, months: tm, best: pick(tb), caution: tc ? pick(tc) : null };
  });

  const quarters = QUARTERS.map((qq) => {
    const rows = months.filter((m) => qq.months.includes(m.month));
    return { ...qq, avg: Math.round(rows.reduce((s, m) => s + m.score, 0) / rows.length) };
  });

  // 대운·그 해의 12운성 같은 배경 — 실패해도 나머지는 그대로 간다.
  let context = null;
  try {
    const td = buildTimingData(engine, new Date(year, 5, 15), { topicKey: 'intro', gender });
    context = { age: td.currentAge, current: td.current, yearRow: (td.years || []).find((y) => y.year === year) || null };
  } catch (e) { context = null; }
  const age = context ? context.age : year - engine.meta.input.year + 1;

  return {
    year, gender, age, yongshinMain: engine.yongshin.final.main, context,
    overall: { score: yr.score, ganZhi: yr.ganZhi, ganZhiKo: yr.ganZhiKo, stemShipsin: yr.stemShipsin, branchShipsin: yr.branchShipsin },
    months, best: pick(best), caution: caution ? pick(caution) : null, topics, quarters
  };
}

function monthLine(m) {
  return '- ' + m.month + '월 ' + m.ganZhiKo + '(' + m.ganZhi + ')월: 점수 ' + m.score + ' (' + tier(m.score) + ') · 천간 ' + (m.stemShipsin || '-') + ' · 지지 ' + (m.branchShipsin || '-');
}

function buildNewYearPrompt(data, engine, person = {}) {
  const y = data.year, o = data.overall;
  const ctx = data.context;
  const pillars = engine.palja || {};
  const pillarText = [
    ['년주', pillars.yearPillar], ['월주', pillars.monthPillar],
    ['일주', pillars.dayPillar], ['시주', pillars.hourPillar]
  ].filter(([, p]) => p && p.stem && p.branch)
    .map(([label, p]) => label + ' ' + p.stem + p.branch).join(' · ');
  const dae = ctx && ctx.current ? '\n- 이 해의 대운: ' + ctx.current.ganZhiKo + '(' + ctx.current.ganZhi + ') 대운(' + ctx.current.age + '세 시작), 대운 점수 ' + ctx.current.score + ' (' + tier(ctx.current.score) + ')' : '';
  const unseong = ctx && ctx.yearRow && ctx.yearRow.unseong ? ' · 12운성 ' + ctx.yearRow.unseong : '';
  const topicBlocks = data.topics.map((t) => {
    const scores = t.months.map((m) => m.month + '월 ' + m.score).join(' · ');
    return '### ' + t.label + ' (확정값)\n- ' + y + '년 ' + t.label + ' 점수: ' + t.score + ' (' + tier(t.score) + ')\n- 월별 점수: ' + scores +
      '\n- 가장 좋은 달: ' + t.best.month + '월(' + t.best.score + ')' + (t.caution ? ' · 조심할 달: ' + t.caution.month + '월(' + t.caution.score + ')' : '');
  }).join('\n\n');
  const quarterLine = data.quarters.map((q) => q.label + '(' + q.range + ') 평균 ' + q.avg).join(' · ');
  const healthCaution = (data.topics.find((x) => x.key === 'health') || {}).caution;

  return '# ' + y + '년 신년운세 — 한 해 전체 리딩\n\n' +
    '## 이 사람 정보\n' +
    '이름: ' + safeName(person.name, '(익명)') + ' / 성별: ' + (person.gender || '(미상)') + ' / ' + y + '년 기준 ' + data.age + '세 / 일간 ' + engine.ilgan.char + '(' + engine.ilgan.ko + ') / 용신 ' + data.yongshinMain + ' / 격국 ' + engine.kyukguk.name + ' / 신강약 ' + engine.strength.verdict + '\n' +
    '사주 네 기둥: ' + (pillarText || '확인 가능한 기둥 없음') + ' / 용신 판정 참고: ' + engine.yongshin.final.note + '\n\n' +
    '## ' + y + '년 총운 (확정값 — 이 숫자는 바꾸거나 새로 만들지 마세요)\n' +
    '점수는 그 시기 간지가 이 사람의 용신을 얼마나 돕는지(60%)와 십신 흐름(40%)을 함께 본 값입니다. 0~100, 높을수록 유리.\n' +
    '- ' + y + '년 세운: ' + o.ganZhiKo + '(' + o.ganZhi + ') · 천간 ' + (o.stemShipsin || '-') + ' · 지지 ' + (o.branchShipsin || '-') + unseong + dae + '\n' +
    '- ' + y + '년 총운 점수: ' + o.score + ' (' + tier(o.score) + ')\n' +
    '- 12개월 중 가장 좋은 달: ' + data.best.month + '월(' + data.best.score + ')' + (data.caution ? ' · 가장 조심할 달: ' + data.caution.month + '월(' + data.caution.score + ')' : '') + '\n' +
    '- 분기 평균: ' + quarterLine + '\n\n' +
    '## 1~12월 총운 점수 (확정값)\n' +
    '월은 절기 기준이라 각 달의 기운은 양력 중순쯤 들어옵니다. 특히 1월은 아직 전년도 축월(丑月)의 기운이고, 새해 기운은 2월 입춘 전후부터 본격적으로 바뀝니다.\n' +
    data.months.map(monthLine).join('\n') + '\n\n' +
    '## 주제별 ' + y + '년 점수 (확정값)\n' +
    topicBlocks + '\n\n' +
    '## 지시\n' +
    '위 확정값만 근거로, 아래 여덟 개 소제목을 정확히 이 표기와 순서로 쓰세요. 소제목 앞에는 "### "를 붙이고, 그 밖의 제목·머리말·맺음말은 쓰지 마세요. 어디에도 위에 없는 점수·연도·월을 새로 만들지 마세요.\n\n' +
    '### 총운\n' +
    '1,300~1,500자, 정확히 4문단. 첫 문장은 ' + y + '년 한 해를 한 줄로 요약하는 결론 문장(점수 ' + o.score + '을 근거로, 40~80자). 나머지 문단은 각각 250자 이상으로 쓰세요. ' + y + '년 세운의 십신·12운성과 대운이 일간·용신·격국 및 실제 사주 네 기둥과 어떻게 맞물리는지, 상반기와 하반기 중 어디에 힘이 실리는지, 이 해의 가장 큰 기회와 과제를 구체적으로 풀이하세요. 각 문단에 일주·월주·용신·격국 중 최소 하나의 실제 근거를 이름과 함께 넣으세요. 1월은 전년도 축월의 기운이 남아 있다는 점을 한 번만 부드럽게 짚으세요. 같은 해석을 다른 말로 반복해 분량을 채우지 마세요.\n\n' +
    '### 월별 풀이\n' +
    '위 1~12월 점수의 순서 그대로 정확히 12줄. 각 줄은 "- N월: 풀이" 형식(N은 숫자, 예: "- 3월: ..."). 줄마다 130~160자, 정확히 두 문장으로 쓰세요. 첫 문장은 그 달의 점수와 천간·지지 십신을 연결해 흐름을 풀이하고, 둘째 문장은 실제로 할 행동이나 미룰 판단 하나를 제안하세요. 각 달에 서로 다른 근거와 행동을 쓰고, 점수가 높은 달과 낮은 달의 말투 차이가 분명해야 합니다. ' + data.best.month + '월(가장 좋은 달)' + (data.caution ? '과 ' + data.caution.month + '월(가장 조심할 달)' : '') + '의 차이를 분명히 쓰세요.\n\n' +
    NEWYEAR_TOPICS.map((t) => {
      const rule = t.key === 'health'
        ? '550~650자, 정확히 2문단(각 240자 이상). 사주 네 기둥과 오행 균형을 생활 리듬 해석에 연결하되, 병명·진단·치료·약·검사·의학적 단정은 절대 쓰지 마세요. 수면·식사·운동·휴식 리듬과 무리하기 쉬운 시기를 다루고, 현실적으로 실행할 컨디션 관리 방법을 제안하세요.' + (healthCaution ? ' 조심할 달(' + healthCaution.month + '월)의 휴식 방법도 구체적으로 쓰세요.' : '')
        : '550~650자, 정확히 2문단(각 240자 이상). ' + t.focus + '을 중심으로 일주·월주·용신·격국 중 실제 근거를 문단마다 하나 이상 이름과 함께 설명하세요. 이 주제의 ' + y + '년 점수와 월별 점수, 가장 좋은 달·조심할 달을 근거로 들고, 그 시기에 실제로 무엇을 준비하거나 피할지 실행 가능한 예를 쓰세요. 뜬구름 잡는 조언과 앞 문단의 반복은 피하세요.';
      return '### ' + t.heading + '\n' + rule;
    }).join('\n\n') + '\n\n' +
    '### 분기별 할 것\n' +
    '정확히 4줄. 각 줄은 "- 1분기: ..." 형식(1분기~4분기). 줄마다 100~130자, 두 문장으로 작성하세요. 첫 문장은 분기 평균 점수와 달별 흐름을 근거로 삼고, 둘째 문장은 실제로 시작할 수 있는 행동 하나와 실행 시점을 제안하세요.\n\n' +
    '### 분기별 피할 것\n' +
    '정확히 4줄. 같은 형식("- 1분기: ..."). 줄마다 100~130자, 두 문장으로 작성하세요. 그 분기 점수와 흐름을 근거로 무리하기 쉬운 것 하나를 짚고, 대신 취할 수 있는 대안을 제안하세요.\n\n' +
    '전체 분량은 5,800~6,500자. 이 사람의 일간·용신·격국·실제 기둥과 점수를 문단마다 하나 이상 근거로 들고, 그 근거가 행동 제안과 어떻게 이어지는지 설명하세요. 겁주거나 미래를 단정하지 말고 선택의 방향을 제시하세요. 강조(**굵게**)는 소제목마다 1~3곳, 짧은 핵심 구절에만 쓰고 마크다운 제목은 지정된 소제목 외에 만들지 마세요.';
}

const escRe = (s) => s.replace(/[.*+?^$\{}()|[\]\\]/g, '\\$&');

/* "### 이름" 아래 본문을 다음 소제목 직전까지. 소제목은 ##~#### 모두 받고, 이름 뒤에 덧말이 붙어도(예: "총운 (1,200자)") 괜찮다. */
function grabSection(text, names) {
  for (const name of names) {
    const m = new RegExp('(?:^|\\n)#{2,4}\\s*' + escRe(name) + '[^\\n]*\\n([\\s\\S]*?)(?=\\n#{2,4}\\s|$)').exec(text);
    if (m && m[1].trim()) return m[1].trim();
  }
  return '';
}

function parseNumbered(body, unit, max) {
  const out = [], seen = new Set();
  const re = new RegExp('^\\s*(?:[-•*]\\s*)?(\\d{1,2})\\s*' + unit + '\\s*[:：]\\s*(.+?)\\s*$');
  for (const line of String(body || '').split('\n')) {
    const m = re.exec(line);
    if (!m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > max || seen.has(n)) continue;
    seen.add(n);
    out.push({ n, text: m[2] });
  }
  return out;
}

/** AI 응답 → 구조. 어떤 입력에도 던지지 않는다. 못 찾은 섹션은 빈 문자열·빈 배열. */
function parseNewYearText(raw) {
  const text = typeof raw === 'string' ? raw : '';
  const empty = { overall: '', monthNotes: [], topics: { wealth: '', career: '', love: '', health: '' }, quarterDos: [], quarterDonts: [] };
  try {
    const topics = {};
    NEWYEAR_TOPICS.forEach((t) => { topics[t.key] = grabSection(text, [t.heading, ...t.aliases]); });
    return {
      overall: grabSection(text, ['총운', YEAR + ' 총운', '올해 총운']),
      monthNotes: parseNumbered(grabSection(text, ['월별 풀이', '월별 한 줄', '월별']), '월', 12).map((x) => ({ month: x.n, note: x.text })),
      topics,
      quarterDos: parseNumbered(grabSection(text, ['분기별 할 것', '분기 할 것']), '분기', 4).map((x) => ({ quarter: x.n, text: x.text })),
      quarterDonts: parseNumbered(grabSection(text, ['분기별 피할 것', '분기 피할 것']), '분기', 4).map((x) => ({ quarter: x.n, text: x.text }))
    };
  } catch (e) { return empty; }
}

/**
 * @returns {{ year, title, data, overall, monthNotes, topics, quarterDos, quarterDonts, usage }}
 */
async function generateNewYearReading(engine, person) {
  const data = buildNewYearData(engine, person);
  const prompt = buildNewYearPrompt(data, engine, person);
  const { text, usage } = await generateText(SYSTEM_PROMPT, prompt, { maxTokens: 20000 });
  return { year: data.year, title: data.year + ' 신년운세', data, ...parseNewYearText(text), usage };
}

/* 웹 화면·주문 보관용 — "## 섹션" 제목으로 한 덩어리. new-year-app.js가 이 텍스트를 읽는다. */
function toPlainText(reading) {
  const parts = [];
  if (reading.overall) parts.push('## ' + reading.year + ' 총운\n\n' + reading.overall);
  if ((reading.monthNotes || []).length) parts.push('## 월별 풀이\n\n' + reading.monthNotes.map((n) => '- ' + n.month + '월: ' + n.note).join('\n'));
  NEWYEAR_TOPICS.forEach((t) => { const body = reading.topics && reading.topics[t.key]; if (body) parts.push('## ' + t.label + '\n\n' + body); });
  if ((reading.quarterDos || []).length) parts.push('## 분기별 할 것\n\n' + reading.quarterDos.map((d) => '- ' + d.quarter + '분기: ' + d.text).join('\n'));
  if ((reading.quarterDonts || []).length) parts.push('## 분기별 피할 것\n\n' + reading.quarterDonts.map((d) => '- ' + d.quarter + '분기: ' + d.text).join('\n'));
  return parts.join('\n\n');
}

module.exports = { YEAR, NEWYEAR_TOPICS, QUARTERS, generateNewYearReading, buildNewYearData, buildNewYearPrompt, parseNewYearText, toPlainText };

