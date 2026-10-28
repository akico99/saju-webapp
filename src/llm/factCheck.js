'use strict';
/* 유료 풀이 본문의 사실 진술을 엔진 값과 대조한다. 사주를 아는 사람이 검토하기 전에 기계로 잡을 수 있는 것만 잡는다.

   오류(error) — 엔진 값과 1:1로 맞출 수 있고 틀리면 독자가 바로 속는 진술. 그 묶음을 다시 만드는 사유가 된다.
     · 오행 개수 ("화가 3개", "불(火) 기운이 두 개")
     · 일간 글자 ("일간은 丙", "일간이 병화")
     · 강한 달 순위 ("가장 강한 달은 2026년 11월", "두 번째로 좋은 달은 7월")
   경고(warning) — 맞을 수도 있는 진술. 검토 화면에 띄우고 재생성 사유로는 쓰지 않는다.
     · 명식·흐름 어디에도 없는 십신·신살 이름
     · 12개월 범위 밖의 'YYYY년 M월'
   오탐을 줄이려고 보수적으로 찾는다 — 일상어와 겹치는 말(상관없이, 강한 편인데)은 건너뛰고, 두 사람 상품은
   둘 중 누구의 값과 맞아도 맞은 것으로 본다. 시각을 모르는 사람이 있으면 오행 개수는 경고로 낮춘다. */

const OHAENG = { 목: '木', 나무: '木', 木: '木', 화: '火', 불: '火', 火: '火', 토: '土', 흙: '土', 土: '土', 금: '金', 쇠: '金', 金: '金', 수: '水', 물: '水', 水: '水' };
const OHAENG_KO = { 木: '목', 火: '화', 土: '토', 金: '금', 水: '수' };
const NUM = { 하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8 };
const STEM_KO = { 甲: '갑', 乙: '을', 丙: '병', 丁: '정', 戊: '무', 己: '기', 庚: '경', 辛: '신', 壬: '임', 癸: '계' };
const SHIPSIN = ['비견', '겁재', '식신', '상관', '편재', '정재', '편관', '정관', '편인', '정인'];
const SHIPSIN_HANJA = { 比肩: '비견', 劫財: '겁재', 食神: '식신', 傷官: '상관', 偏財: '편재', 正財: '정재', 偏官: '편관', 正官: '정관', 七殺: '편관', 偏印: '편인', 正印: '정인' };
// 본문에 나올 수 있는 신살 이름(살을 뺀 이름). 뒤에 '살'이 붙거나 괄호 안에 단독으로 있을 때만 신살로 본다.
const SHINSAL = ['도화', '홍염', '화개', '역마', '장성', '반안', '망신', '육해', '겁살', '재살', '천살', '지살', '년살', '월살', '백호', '괴강', '양인', '천을귀인', '문창귀인', '귀문관', '원진', '홍란', '천희'];
const HANGUL = /[가-힣]/;
// 받침이 ㄴ인 글자 — "강한 편인", "센 편인" 같은 형용사 꼴을 걸러 낸다.
const endsWithNieun = (ch) => { const c = ch ? ch.charCodeAt(0) - 0xac00 : -1; return c >= 0 && c < 11172 && c % 28 === 4; };

const shinsalBase = (s) => String(s).replace(/\(.*?\)/g, '').replace(/살$/, '').trim();
const ymKey = (y, m) => y + '-' + m;

/** 엔진·시기 값에서 대조할 사실을 모은다.
    @param {{ engines: object[], months?: {year,month}[], ranked?: {year,month}[], rankSections?: string[], extra?: any[] }} src
    extra: 본문이 근거로 쓸 수 있는 다른 엔진 자료(월별 십신 등). 그 안의 십신 이름도 '있는 것'으로 본다. */
function buildFacts({ engines, months = [], ranked = [], rankSections = null, extra = [] }) {
  const list = engines.filter(Boolean);
  const shipsin = new Set();
  const shinsal = new Set();
  const scan = (v) => {
    if (v == null) return;
    if (typeof v === 'string') {
      if (SHIPSIN.includes(v)) shipsin.add(v);
      if (SHIPSIN_HANJA[v]) shipsin.add(SHIPSIN_HANJA[v]);
      return;
    }
    if (Array.isArray(v)) return v.forEach(scan);
    if (typeof v === 'object') for (const k of Object.keys(v)) scan(v[k]);
  };
  for (const e of list) {
    for (const p of ['year', 'month', 'day', 'hour']) {
      const pillar = e.manse && e.manse[p];
      if (!pillar) continue;
      scan([pillar.stemShipsinKo, pillar.branchShipsinKo, pillar.stemShipsin, pillar.branchShipsin]);
      for (const s of pillar.shinsals || []) shinsal.add(shinsalBase(s));
    }
    const detail = (e.counts && e.counts.shipsinDetail) || {};
    for (const [k, n] of Object.entries(detail)) if (n > 0) shipsin.add(k);
  }
  scan(months); scan(extra);
  return {
    people: list.map((e) => ({
      ilgan: e.ilgan ? e.ilgan.char : null,
      ohaeng: (e.counts && e.counts.ohaeng) || {},
      hourKnown: !(e.meta && e.meta.hourGiven === false)
    })),
    shipsin, shinsal,
    months: months.map((m) => ({ year: m.year, month: m.month })),
    ranked: ranked.map((m) => ({ year: m.year, month: m.month })),
    rankSections
  };
}

function quoteAround(text, index, length) {
  const s = Math.max(0, index - 12), e = Math.min(text.length, index + length + 12);
  return (s > 0 ? '…' : '') + text.slice(s, e).replace(/\s+/g, ' ').trim() + (e < text.length ? '…' : '');
}

const OHAENG_RE = /(나무|불|흙|쇠|물|목|화|토|금|수|木|火|土|金|水)(?:\s*[(（](?:木|火|土|金|水|목|화|토|금|수)[)）])?(?:\s*(?:의\s*)?(?:기운|글자|오행))?\s*(?:이|가|은|는|도)?\s*(\d|하나|둘|셋|넷|다섯|여섯|일곱|여덟|한|두|세|네)\s*(?:개(?!월)|글자)/g;
const ILGAN_HANJA_RE = /일간[^\n.。]{0,8}?([甲乙丙丁戊己庚辛壬癸])/g;
const ILGAN_KO_RE = /일간\s*[)）]?\s*(?:은|는|이|가|인|:|：)?\s*['"‘“]?([갑을병정무기경신임계])(목|화|토|금|수)(?=$|[^가-힣]|이|은|는|을|를|의|와|과|도|으로|에)/g;
const RANK_RE = /(가장|두\s*번째로|세\s*번째로|두\s*번째|세\s*번째)\s*(?:[가-힣]+\s+){0,1}(강한|좋은)\s*달(?:은|이|는|로)?\s*[,:：]?\s*(?:\*\*)?\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월/g;
const DATE_RE = /(\d{4})\s*년\s*(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)/g;
// 순위 문장 앞에 이런 말이 있으면 전체 순위가 아니라 한 사람·한 분야의 순위다(검사하지 않는다).
const RANK_SKIP_BEFORE = /(재물|돈|일|직업|애정|연애|건강|몸|분기|상반기|하반기|님|에게|의 흐름|혼자|각자|개인)/;

/** @param {{ key, title?, text }[]} sections  @param {{ year?, month, note }[]} monthNotes  @returns {{ errors: object[], warnings: object[] }} */
function factCheck({ sections = [], monthNotes = [] } = {}, facts) {
  const errors = [], warnings = [];
  const items = sections.map((s) => ({ key: s.key, text: String(s.text || '') }));
  if (monthNotes.length) items.push({ key: 'months', text: monthNotes.map((n) => '- ' + (n.year ? n.year + '년 ' : '') + n.month + '월: ' + n.note).join('\n') });
  const add = (list, item, kind, index, length, message) => list.push({ section: item.key, kind, quote: quoteAround(item.text, index, length), message });
  const hourUnknown = facts.people.some((p) => !p.hourKnown);
  const minYear = facts.months.length ? Math.min(...facts.months.map((m) => m.year)) : null;
  const maxYear = facts.months.length ? Math.max(...facts.months.map((m) => m.year)) : null;
  const inWindow = new Set(facts.months.map((m) => ymKey(m.year, m.month)));

  for (const item of items) {
    const text = item.text.replace(/\*\*/g, '');
    let m;

    OHAENG_RE.lastIndex = 0;
    while ((m = OHAENG_RE.exec(text))) {
      if (m.index > 0 && HANGUL.test(text[m.index - 1])) continue; // 선물이 2개, 횟수가 3개
      const el = OHAENG[m[1]];
      const n = /^\d$/.test(m[2]) ? Number(m[2]) : NUM[m[2]];
      if (!el || !n || facts.people.some((p) => p.ohaeng[el] === n)) continue;
      const actual = facts.people.map((p) => p.ohaeng[el] ?? 0).join('·');
      add(hourUnknown ? warnings : errors, item, 'ohaeng', m.index, m[0].length, (OHAENG_KO[el] || el) + ' 개수가 ' + n + '개라고 썼지만 명식에는 ' + actual + '개예요.');
    }

    const ilgans = new Set(facts.people.map((p) => p.ilgan).filter(Boolean));
    if (ilgans.size) {
      const ilganLabel = [...ilgans].map((ch) => ch + '(' + STEM_KO[ch] + ')').join('·');
      ILGAN_HANJA_RE.lastIndex = 0;
      while ((m = ILGAN_HANJA_RE.exec(text))) {
        if (!ilgans.has(m[1])) add(errors, item, 'ilgan', m.index, m[0].length, '일간을 ' + m[1] + '(으)로 썼지만 명식의 일간은 ' + ilganLabel + '이에요.');
      }
      const ilganKo = new Set([...ilgans].map((c) => STEM_KO[c]));
      ILGAN_KO_RE.lastIndex = 0;
      while ((m = ILGAN_KO_RE.exec(text))) {
        if (!ilganKo.has(m[1])) add(errors, item, 'ilgan', m.index, m[0].length, '일간을 ' + m[1] + m[2] + '(으)로 썼지만 명식의 일간은 ' + ilganLabel + '이에요.');
      }
    }

    if (facts.ranked.length && (!facts.rankSections || facts.rankSections.includes(item.key))) {
      RANK_RE.lastIndex = 0;
      while ((m = RANK_RE.exec(text))) {
        const before = text.slice(Math.max(0, m.index - 14), m.index);
        if (RANK_SKIP_BEFORE.test(before) || /아니|다음|보다/.test(m[0])) continue;
        const order = m[1] === '가장' ? 0 : /두/.test(m[1]) ? 1 : 2;
        const expected = facts.ranked[order];
        if (!expected) continue;
        const year = m[3] ? Number(m[3]) : null, month = Number(m[4]);
        if (month === expected.month && (year == null || year === expected.year)) continue;
        add(errors, item, 'rank', m.index, m[0].length, m[1].replace(/\s+/g, ' ') + ' ' + m[2] + ' 달을 ' + (year ? year + '년 ' : '') + month + '월로 썼지만 확정값은 ' + expected.year + '년 ' + expected.month + '월이에요.');
      }
    }

    if (inWindow.size) {
      DATE_RE.lastIndex = 0;
      while ((m = DATE_RE.exec(text))) {
        const y = Number(m[1]), mo = Number(m[2]);
        // 생년·옛 기억 같은 먼 해는 시기 진술이 아니다 — 범위 바로 앞뒤 해만 본다.
        if (y < minYear - 1 || y > maxYear + 1 || inWindow.has(ymKey(y, mo))) continue;
        add(warnings, item, 'date', m.index, m[0].length, y + '년 ' + mo + '월은 이 리포트의 12개월 범위 밖이에요.');
      }
    }

    for (const name of SHIPSIN) {
      const re = new RegExp(name, 'g');
      while ((m = re.exec(text))) {
        const prev = text[m.index - 1], next = text.slice(m.index + name.length, m.index + name.length + 2);
        if (prev && HANGUL.test(prev)) continue;
        if (next && HANGUL.test(next[0]) && !/^(은|는|이|가|을|를|의|과|와|도|으|로|에|격|성|운|살|이에|이라|기운)/.test(next)) continue;
        if (name === '상관' && /^(없|있|하|이 없|이 있)/.test(next)) continue;
        if (name === '편인' && /^\s/.test(next || ' ') && endsWithNieun(text[m.index - 2])) continue;
        if (facts.shipsin.has(name)) continue;
        add(warnings, item, 'shipsin', m.index, name.length, name + '은(는) 명식과 이 리포트의 시기 자료 어디에도 없는 십신이에요.');
      }
    }

    for (const base of SHINSAL) {
      const named = base.endsWith('살') ? base : base + '살';
      const re = new RegExp('(' + named + '|[(（]' + base + '[)）])', 'g');
      while ((m = re.exec(text))) {
        if (m[1] === named && m.index > 0 && HANGUL.test(text[m.index - 1])) continue;
        if (facts.shinsal.has(shinsalBase(base))) continue;
        add(warnings, item, 'shinsal', m.index, m[0].length, named + '은(는) 명식의 신살에 없어요.');
      }
    }
  }
  return { errors, warnings };
}

/** 재생성 요청에 붙일 수정 사유. 생성기가 이 문장을 로그에도 남기므로 본문 인용(이름이 섞일 수 있음)은 넣지 않는다. */
function correctionMessage(errors) {
  const lines = [...new Set(errors.map((e) => e.message))].slice(0, 5);
  return '사주 자료와 다른 진술이 있습니다(' + lines.join(' / ') + '). 확정값과 전달된 자료에 적힌 사실만 쓰세요.';
}

module.exports = { buildFacts, factCheck, correctionMessage, SHIPSIN, SHINSAL };

