'use strict';
/* 무료 사주 분석의 개인 맞춤 소개(300~400자) — "당신은 이런 사람이에요"(연애·신년운세)와
   "두 사람은 이런 사이예요"(재회·궁합).

   무료 미리보기 응답(/api/<상품>/preview)은 AI 없이 즉시 나가야 하므로, 소개는 화면이 따로
   POST /api/<상품>/intro 로 받아 나중에 채운다. 실패하면 화면은 그 칸을 조용히 숨긴다.

   - 근거는 엔진 값만(일간·배우자 자리·매력 표지·오행 균형·두 사람의 끌림과 부딪힘). 달·점수는 넘기지 않는다
     — 잠긴 1·2위 달이 소개 문장으로 새어 나갈 길을 처음부터 막는다. 이름도 넘기지 않는다(캐시 적중률, 프롬프트 주입).
   - 비용: 가장 싼 모델(기본 claude-haiku-5-5, SAJU_INTRO_MODEL로 바꿈).
   - 남용 방지: 같은 근거는 메모리 LRU 캐시(24시간)에서 바로 돌려주고, 새로 만들 때만 IP당 분당·일당 한도와
     서버 전체 일일 한도를 센다. 같은 근거로 동시에 들어온 요청은 한 번만 생성한다. */
const crypto = require('crypto');
const { generateText } = require('./client');
const { computeSaju } = require('../engine/index');
const { readBalance, readCharm, pillarsOf } = require('../engine/freeReadings');
const { SHIPSIN_GROUP } = require('../engine/constants');

const INTRO_MODEL = process.env.SAJU_INTRO_MODEL || 'claude-haiku-5-5';
// $/백만 토큰 — claude-haiku-5-5 공식 단가(프롬프트 10만 토큰 이하, platform.claude.com/docs/en/models/haiku-5-5).
// 모델을 바꾸면 SAJU_INTRO_PRICE_IN / _OUT 으로 함께 맞춘다.
const PRICE = { input: Number(process.env.SAJU_INTRO_PRICE_IN || 0.1), output: Number(process.env.SAJU_INTRO_PRICE_OUT || 0.5) };
const introCostUsd = (u) => (u ? ((u.input_tokens || 0) * PRICE.input + (u.output_tokens || 0) * PRICE.output) / 1e6 : 0);

const LIMITS = {
  perMinute: Number(process.env.SAJU_INTRO_PER_MINUTE || 5),
  perDay: Number(process.env.SAJU_INTRO_PER_DAY || 30),
  globalPerDay: Number(process.env.SAJU_INTRO_GLOBAL_PER_DAY || 3000)
};
const CACHE_MAX = 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// 화면 목표는 300~400자. 모델이 길게 쓰는 편이라(haiku 실측 500~580자) 요청은 짧게 하고, 넘치면 마지막 문단을 덜어 낸다.
const MIN_CHARS = 220, MAX_CHARS = 480;

/* ---------- 쉬운 말 ---------- */
const OHAENG_PLAIN = { 木: '나무(木)', 火: '불(火)', 土: '흙(土)', 金: '쇠(金)', 水: '물(水)' };
const STRENGTH_PLAIN = { 신강: '스스로의 기운이 센 편(주관이 뚜렷함)', 신약: '스스로의 기운이 여린 편(주변과 어울리며 힘을 얻음)', 중화: '기운이 고르게 맞춰진 편' };
function groupPlain(group, gender) {
  if (group === '관성') return gender === '여' ? '연인을 뜻하는 기운(규칙과 책임의 기운이기도 함)' : '규칙과 책임의 기운';
  if (group === '재성') return gender === '남' ? '연인을 뜻하는 기운(현실 감각의 기운이기도 함)' : '재물과 현실 감각의 기운';
  return { 비겁: '나와 같은 편의 기운(자존심·독립심)', 식상: '표현하고 드러내는 기운(말·재능·애정 표현)', 인성: '생각하고 품는 기운(배움·보살핌)' }[group] || '뚜렷하게 치우치지 않은 기운';
}
const genderOf = (engine) => (engine.meta && engine.meta.input && engine.meta.input.gender) || null;

function personLines(engine, label) {
  const g = genderOf(engine);
  const charm = readCharm(engine);
  const bal = readBalance(engine);
  const day = engine.manse.day;
  const groups = (engine.counts && engine.counts.shipsinGroup) || {};
  const star = g === '남' ? '재성' : '관성';
  const lines = [
    '- 나를 뜻하는 글자(일간): ' + (OHAENG_PLAIN[engine.ilgan.ohaeng] || engine.ilgan.ohaeng) + '의 성질 — ' + charm.base.text,
    '- 타고난 기운의 세기: ' + (STRENGTH_PLAIN[engine.strength.verdict] || '보통'),
    '- 배우자 자리(가장 가까운 사람의 자리)에 든 기운: ' + groupPlain(SHIPSIN_GROUP[day.branchShipsinKo], g),
    '- 다섯 기운의 균형: ' + bal.headline,
    '- 연인을 뜻하는 기운 ' + (groups[star] ?? 0) + '개, 표현하는 기운 ' + (groups['식상'] ?? 0) + '개, 나와 같은 편의 기운 ' + (groups['비겁'] ?? 0) + '개, 생각하고 품는 기운 ' + (groups['인성'] ?? 0) + '개'
  ];
  charm.found.slice(0, 3).forEach((f) => lines.push('- 매력 표지: ' + String(f.title).split('—').pop().trim() + ' — ' + f.core));
  if (!pillarsOf(engine).includes('hour')) lines.push('- 태어난 시각을 몰라 세 기둥으로만 봤어요(개수는 대략).');
  return (label ? '[' + label + ']\n' : '') + lines.join('\n');
}

/* ---------- 상품별 근거 ---------- */
/** 연애: birth(성별 포함), situationLabel('솔로' 등) */
function loveFacts(birth, situationLabel) {
  const engine = computeSaju(birth);
  return { kind: 'love', facts: '지금 연애 상황: ' + situationLabel + '\n' + personLines(engine) };
}
/** 신년운세: birth, yearLine(무료 분석의 한 해 요약 — 달 정보 없음) */
function newYearFacts(birth, yearLine) {
  const engine = computeSaju(birth);
  return { kind: 'newyear', facts: personLines(engine) + '\n- 다가오는 한 해: ' + yearLine.headline + '. ' + yearLine.text + ' ' + yearLine.comes };
}
/** 재회: 두 birth와 describeBond 결과, 이야기(헤어진 시기 등), 경계 모드 */
function reunionFacts(birthA, birthB, bond, story) {
  const a = computeSaju(birthA), b = computeSaju(birthB);
  const rel = [
    '- 헤어진 지: ' + story.since + ' / 먼저 이별을 말한 쪽: ' + story.initiator + ' / 지금 연락: ' + story.contact,
    ...bond.attraction.map((t) => '- 끌림: ' + t),
    ...bond.friction.map((t) => '- 부딪힘: ' + t)
  ];
  if (bond.toMe) rel.push('- 그 사람은 나에게 "' + bond.toMe + '"으로, 나는 그 사람에게 "' + bond.toThem + '"으로 다가가요.');
  return { kind: 'reunion', boundary: !!story.boundary, facts: personLines(a, '나') + '\n' + personLines(b, '그 사람') + '\n[두 사람 사이]\n' + rel.join('\n') };
}
/** 궁합: 두 birth와 무료 분석(buildCouplePreview, 이름은 '나'·'그 사람'으로 만든 것) */
function coupleFacts(birthA, birthB, preview) {
  const a = computeSaju(birthA), b = computeSaju(birthB);
  const rel = [
    '- 지금 관계: ' + preview.relation.label,
    '- ' + preview.pull.headline,
    // 제목이 "그 사람이 나에게"처럼 방향을 담고 있다. 방향이 뒤바뀌어 읽히지 않게 문장으로 풀어 둔다.
    ...preview.pull.points.map((p) => (/에게$/.test(p.title) ? '- ' + p.title + ' 다가오는 모습: ' + p.text : '- 끌어당기는 결(' + p.title + '): ' + p.text)),
    ...preview.clash.points.map((p) => '- 부딪히는 결(' + p.title + '): ' + p.text),
    '- 서로 채워 주는 기운: ' + preview.complement.headline
  ];
  return { kind: 'couple', facts: personLines(a, '나') + '\n' + personLines(b, '그 사람') + '\n[두 사람 사이]\n' + rel.join('\n') };
}

/* ---------- 프롬프트 ---------- */
const COMMON_RULES = [
  '- 공백 포함 280~350자를 넘기지 않습니다. 딱 2문단, 문단마다 2~3문장. 문단 사이에 빈 줄 하나.',
  '- 다정하고 분명한 존댓말("~해요", "~예요"). 첫 문장에 핵심을 한 줄로 말합니다.',
  '- 아래 "근거"에 있는 내용만 씁니다. 직업·외모·나이·과거 사건·가족 이야기를 지어내지 않습니다.',
  '- 단정하지 않습니다. "반드시", "틀림없이", "100%", "운명", "천생연분" 같은 말 대신 "~한 편이에요", "~하기 쉬워요"로 씁니다.',
  '- 한자, 십신·신살·용신 같은 전문 용어, 점수 숫자, 날짜·달 이름을 쓰지 않습니다.',
  '- "배우자 자리", "말년 자리"처럼 사주 자리 이름을 그대로 옮기지 말고, 가까운 관계·일상의 장면으로 바꿔 씁니다.',
  '- 제목, 마크다운 기호(#, *, -), 목록, 이모지, 따옴표로 감싼 인용을 쓰지 않습니다. 본문만 씁니다.'
];
const SYSTEM = {
  single: "당신은 '사주보는 수달'에서 무료 사주 분석의 첫 소개를 쓰는 풀이자입니다. 읽는 사람은 사주를 모르는 20~40대입니다. 사주 근거로 \"당신은 이런 사람이에요\"라는 짧은 개인 소개를 써서, 읽는 사람이 '나를 알아봤다'고 느끼게 합니다. 성격의 장점과 그 장점이 지나칠 때의 모습을 함께 보여 주세요. 읽는 사람을 \"당신\"이라고 부릅니다.\n\n" + COMMON_RULES.join('\n'),
  pair: "당신은 '사주보는 수달'에서 무료 사주 분석의 첫 소개를 쓰는 풀이자입니다. 읽는 사람은 사주를 모르는 20~30대입니다. 두 사람의 사주 근거로 \"두 사람은 이런 사이예요\"라는 짧은 관계 소개를 써서, 읽는 사람이 '우리 이야기 같다'고 느끼게 합니다. 서로 끌리는 결과 부딪히기 쉬운 결을 함께 보여 주세요. 읽는 사람은 \"당신\", 상대는 \"그 사람\"이라고 부릅니다. 상대의 지금 속마음을 단정하지 않고, 재회나 관계의 결말을 약속하지 않습니다.\n\n" + COMMON_RULES.join('\n')
};

function buildIntroPrompt(f) {
  const pair = f.kind === 'reunion' || f.kind === 'couple';
  const focus = {
    love: '연애에서 이 사람이 어떤 사람인지(사람을 대하는 방식, 끌리는 매력, 관계에서 반복되기 쉬운 모습)를 중심으로 쓰세요.',
    newyear: '이 사람의 타고난 성격과 일·사람을 대하는 방식을 중심으로 쓰고, 마지막 한 문장만 다가오는 한 해의 큰 결과 이어 주세요.',
    reunion: f.boundary
      ? '두 사람이 왜 끌렸고 어디서 엇갈렸는지를 중심으로 쓰세요. 지금은 상대가 거리를 원한 상황이니 연락이나 재회를 권하지 말고, 마지막 문장은 당신의 마음을 돌보는 쪽으로 맺으세요.'
      : '두 사람이 왜 끌렸고 어디서 엇갈렸는지를 중심으로 쓰세요. 다시 만날지 말지는 판단하지 마세요.',
    couple: '두 사람이 서로에게 어떤 존재이고 어떤 결에서 잘 맞고 어디서 부딪히기 쉬운지를 중심으로 쓰세요.'
  }[f.kind];
  return { system: pair ? SYSTEM.pair : SYSTEM.single, user: '## 근거\n' + f.facts + '\n\n## 요청\n' + focus };
}

const FORBIDDEN = /반드시|틀림없|100%|천생연분|운명적|\d{1,2}\s*월|\d{4}\s*년|[#*]|^\s*-\s/m;
function cleanIntro(text) {
  const paras = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const size = (ps) => ps.join(' ').length;
  // 너무 길면 뒤 문단부터 덜어 낸다(남는 글이 하한보다 짧아지면 그대로 두고 검사에서 거른다).
  while (paras.length > 1 && size(paras) > MAX_CHARS && size(paras.slice(0, -1)) >= MIN_CHARS) paras.pop();
  return paras.join('\n\n');
}
function checkIntro(text) {
  const len = text.replace(/\s+/g, ' ').length;
  if (len < MIN_CHARS || len > MAX_CHARS) return '길이 ' + len + '자';
  if (FORBIDDEN.test(text)) return '금지 표현';
  if (/[\u4e00-\u9fff]/.test(text)) return '한자';
  return null;
}

/* ---------- 캐시·한도 ---------- */
const cache = new Map(); // key -> { text, at } (Map 순서 = 최근 사용 순)
const inflight = new Map();
const counters = new Map(); // key -> { count, resetAt }
function cacheGet(key, now) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  cache.delete(key); cache.set(key, hit);
  return hit.text;
}
function cacheSet(key, text, now) {
  cache.set(key, { text, at: now });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
function bump(key, windowMs, max, now) {
  let c = counters.get(key);
  if (!c || c.resetAt <= now) { c = { count: 0, resetAt: now + windowMs }; counters.set(key, c); }
  if (c.count >= max) return false;
  c.count++;
  return true;
}
function allow(ip, now) {
  const minuteKey = 'm:' + ip, dayKey = 'd:' + ip;
  const m = counters.get(minuteKey), d = counters.get(dayKey), g = counters.get('global');
  const full = (c, max) => c && c.resetAt > now && c.count >= max;
  if (full(m, LIMITS.perMinute) || full(d, LIMITS.perDay) || full(g, LIMITS.globalPerDay)) return false;
  bump(minuteKey, 60 * 1000, LIMITS.perMinute, now);
  bump(dayKey, 24 * 60 * 60 * 1000, LIMITS.perDay, now);
  bump('global', 24 * 60 * 60 * 1000, LIMITS.globalPerDay, now);
  if (counters.size > 20000) for (const [k, c] of counters) if (c.resetAt <= now) counters.delete(k);
  return true;
}

let generator = generateText; // 테스트는 setGenerator로 가짜 생성기를 넣는다(실제 AI 호출 없음)
function setGenerator(fn) { generator = fn || generateText; }

class IntroError extends Error { constructor(status, message) { super(message); this.status = status; } }

/** 근거(f)로 소개를 만든다. 캐시 → 한도 → 생성(형식이 어긋나면 한 번 더) 순서. */
async function getIntro(f, ip, now = Date.now()) {
  const { system, user } = buildIntroPrompt(f);
  const key = crypto.createHash('sha256').update(f.kind + '\n' + user).digest('hex');
  const cached = cacheGet(key, now);
  if (cached) return { text: cached, cached: true };
  if (inflight.has(key)) return inflight.get(key);
  if (!allow(String(ip || 'unknown'), now)) throw new IntroError(429, '잠시 뒤 다시 시도해 주세요.');
  const job = (async () => {
    const started = Date.now();
    let usage = { input_tokens: 0, output_tokens: 0 }, problem = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await generator(system, user, { model: INTRO_MODEL, maxTokens: 1000, maxRetries: 1, thinking: { type: 'disabled' } });
      if (r && r.usage) { usage.input_tokens += r.usage.input_tokens || 0; usage.output_tokens += r.usage.output_tokens || 0; }
      const text = cleanIntro(r && r.text);
      problem = checkIntro(text);
      if (!problem) {
        cacheSet(key, text, Date.now());
        return { text, cached: false, usage, costUsd: introCostUsd(usage), ms: Date.now() - started };
      }
    }
    throw new IntroError(503, '소개를 만들지 못했어요(' + problem + ').');
  })();
  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

/** 라우터용 핸들러. buildFacts(req.body)는 입력 검사에 실패하면 던진다(400). */
function introHandler(buildFacts) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let f;
    try { f = buildFacts(req.body || {}); } catch (e) { return res.status(400).json({ error: e.message }); }
    try {
      const r = await getIntro(f, req.ip);
      return res.json({ intro: r.text });
    } catch (e) {
      const status = e instanceof IntroError ? e.status : 503;
      if (status === 429) res.set('Retry-After', '60');
      if (!(e instanceof IntroError)) console.warn('[intro] 생성 실패:', e.message);
      return res.status(status).json({ error: status === 429 ? e.message : '소개를 만들지 못했어요.' });
    }
  };
}

function _reset() { cache.clear(); inflight.clear(); counters.clear(); }

module.exports = {
  INTRO_MODEL, LIMITS, loveFacts, newYearFacts, reunionFacts, coupleFacts, buildIntroPrompt, checkIntro, cleanIntro,
  getIntro, introHandler, setGenerator, introCostUsd, IntroError, _reset
};

