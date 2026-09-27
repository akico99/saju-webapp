'use strict';
/* 사주 도감 — 무료. LLM 없이 엔진 값과 고정 문구표(fieldGuideRules·fieldGuideIlju)로만 만든다.
   같은 입력이면 항상 같은 결과가 나와야 한다. 필드 설명은 docs/field-guide-contract.md.

   계산 기준
   - 나이는 한국 나이(태어난 해 = 1살). 엔진 대운의 startAge와 같은 기준이다.
   - 시각을 모르면 엔진이 정오로 가정한 시주를 오행·십성 개수, 신살, 합충의 근거에서 뺀다.
   - "올해"는 양력 연도로 잡는다(입춘 전 1월에 보더라도 그해 간지로 보여준다). */
const { computeSaju } = require('./index');
const { hasBatchim, pillarsOf } = require('./freeReadings');
const { HEAVENLY_STEMS, EARTHLY_BRANCHES, STEM_OHAENG, BRANCH_MAIN_STEM, SHIPSIN_GROUP, STEM_KO, BRANCH_KO } = require('./constants');
const R = require('./fieldGuideRules');
const { ILJU } = require('./fieldGuideIlju');

const OH_ORDER = ['木', '火', '土', '金', '水'];
const PILLAR_META = {
  year: { label: '태어난 해', meaning: '뿌리 · 어린 시절' },
  month: { label: '태어난 달', meaning: '사회 속의 나' },
  day: { label: '태어난 날', meaning: '진짜 나' },
  hour: { label: '태어난 시', meaning: '속마음 · 앞날' }
};

const stemOh = (s) => (STEM_OHAENG[s] || {}).ohaeng || null;
const branchOh = (b) => stemOh(BRANCH_MAIN_STEM[b]);
const ko = (gz) => (gz ? STEM_KO[gz[0]] + BRANCH_KO[gz[1]] : '');

/** 60갑자 순번 (갑자=1 … 계해=60) */
function sexagenaryNo(stem, branch) {
  for (let i = 0; i < 60; i++) {
    if (HEAVENLY_STEMS[i % 10] === stem && EARTHLY_BRANCHES[i % 12] === branch) return i + 1;
  }
  return null;
}

/** 이름 조사 — 받침이 있으면 "이"를 붙인다(지은 → 지은이, 수아 → 수아). 비우면 "나". */
function nameForms(raw) {
  const n = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 10);
  if (!n) return { raw: '', display: '나', vocative: null };
  const b = hasBatchim(n);
  return { raw: n, display: b ? n + '이' : n, vocative: n + (b ? '아' : '야') };
}

function countOf(r, keys) {
  const ohaeng = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  const groups = { 비겁: 0, 식상: 0, 재성: 0, 관성: 0, 인성: 0 };
  keys.forEach((k) => {
    const p = r.manse[k];
    if (p.stemOhaeng) ohaeng[p.stemOhaeng]++;
    if (p.branchOhaeng) ohaeng[p.branchOhaeng]++;
    [p.stemShipsinKo, p.branchShipsinKo].forEach((s) => { if (s && SHIPSIN_GROUP[s]) groups[SHIPSIN_GROUP[s]]++; });
  });
  return { ohaeng, groups };
}

/** 특이 행동 후보 — 원국(쓸 수 있는 기둥)의 신살과 충·형. 고르는 건 규칙표가 한다. */
function traitCandidates(r, keys) {
  const out = [];
  const seen = new Set();
  const within = (pillars) => pillars.every((p) => keys.includes(p));
  keys.forEach((k) => {
    (r.manse[k].shinsals || []).forEach((raw) => {
      const name = raw.replace(/\(.*?\)/g, '');
      if (seen.has(name)) return;
      seen.add(name);
      out.push({ type: 'shinsal', key: name, pillar: k });
    });
  });
  (r.hapchung.chung || []).forEach((c) => {
    const key = c.branches.join('') + '충';
    if (!within(c.pillars) || seen.has(key)) return;
    seen.add(key);
    out.push({ type: 'chung', key, branches: c.branches, pillars: c.pillars, weakened: !!c.weakened });
  });
  (r.hapchung.hyeong || []).forEach((h) => {
    const pillars = h.pillars.filter((p) => keys.includes(p));
    if (pillars.length < 2) return;
    const key = h.type === '자형' ? '자형' : '형';
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type: 'hyeong', key, name: h.name, branches: h.branches, pillars });
  });
  return out;
}

/** 성장 기록 — 지금 대운을 가운데 두고 5개. 원국에 없던 오행이 들어오는 대운은 표시한다. */
function growthOf(r, nowYear, ohaeng) {
  const list = (r.daewoon || []).filter((d) => d.ganZhi);
  if (!list.length) return [];
  // 원국에 없던 오행이 "처음" 들어오는 대운은 전체 대운 순서로 판정한다(보여주는 5개만 보면 틀린다).
  const seenNew = new Set();
  const firstNewAt = list.map((d) => {
    const fresh = [stemOh(d.stem), branchOh(d.branch)].filter((o) => o && ohaeng[o] === 0 && !seenNew.has(o));
    fresh.forEach((o) => seenNew.add(o));
    return fresh.length > 0;
  });
  let nowIdx = list.findIndex((d, i) => d.startYear <= nowYear && (!list[i + 1] || list[i + 1].startYear > nowYear));
  const start = Math.max(0, Math.min((nowIdx < 0 ? 0 : nowIdx) - 2, list.length - 5));
  return list.slice(start, start + 5).map((d, j) => {
    const i = start + j;
    const next = list[i + 1];
    const els = [stemOh(d.stem), branchOh(d.branch)];
    const newOhaeng = [...new Set(els.filter((o) => o && ohaeng[o] === 0))];
    const item = {
      startAge: d.startAge,
      endAge: next ? next.startAge - 1 : d.startAge + 9,
      startYear: d.startYear,
      ganZhi: d.ganZhi, ganZhiKo: ko(d.ganZhi),
      stemOhaeng: els[0], branchOhaeng: els[1],
      stemShipsinKo: d.stemShipsinKo, branchShipsinKo: d.branchShipsinKo,
      isNow: i === nowIdx,
      newOhaeng,
      firstNew: firstNewAt[i]
    };
    return Object.assign(item, R.growthLine(item));
  });
}

function seunOf(r, year) {
  for (const d of r.daewoon || []) {
    const y = (d.years || []).find((x) => x.year === year);
    if (y) return y;
  }
  return null;
}

function yearlyOf(r, nowYear, ctx) {
  let prevGroup = null;
  return [nowYear, nowYear + 1].map((year) => {
    const y = seunOf(r, year);
    if (!y) return null;
    const item = {
      year, ganZhi: y.ganZhi, ganZhiKo: ko(y.ganZhi),
      stemOhaeng: stemOh(y.ganZhi[0]), branchOhaeng: branchOh(y.ganZhi[1]),
      stemShipsinKo: y.stemShipsinKo, branchShipsinKo: y.branchShipsinKo,
      shinsals: (y.shinsals || []).map((s) => s.replace(/\(.*?\)/g, ''))
    };
    const card = R.yearCard(item, { ...ctx, prevGroup });
    prevGroup = card.group;
    return { ...item, ...card };
  }).filter(Boolean);
}

/**
 * @param {Object} r computeSaju() 결과
 * @param {Object} opts { name, now: Date }
 */
function buildFieldGuide(r, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowYear = now.getFullYear();
  const keys = pillarsOf(r);
  const hourKnown = keys.length === 4;
  const name = nameForms(opts.name);
  const day = r.palja.dayPillar;
  const ilju = day.stem + day.branch;
  const iljuText = ILJU[ilju];
  if (!iljuText) throw new Error('일주 문구가 없습니다: ' + ilju);

  const { ohaeng, groups } = countOf(r, keys);
  const total = keys.length * 2;
  const yong = (r.yongshin && r.yongshin.final && r.yongshin.final.main) || null;
  const current = growthOf(r, nowYear, ohaeng);
  const nowDw = current.find((g) => g.isNow) || null;
  const ctx = { ohaeng, groups, dayStem: day.stem, dayBranch: day.branch, yong, hourKnown };

  const pillars = ['year', 'month', 'day', 'hour'].map((k) => {
    if (!keys.includes(k)) return { key: k, ...PILLAR_META[k], unknown: true };
    const p = r.manse[k];
    return {
      key: k, ...PILLAR_META[k], unknown: false, isMe: k === 'day',
      stem: p.stem, branch: p.branch, stemKo: p.stemKo, branchKo: p.branchKo,
      stemOhaeng: p.stemOhaeng, branchOhaeng: p.branchOhaeng
    };
  });

  const no = sexagenaryNo(day.stem, day.branch);
  const ohTag = OH_ORDER.filter((o) => ohaeng[o] > 0).sort((a, b) => ohaeng[b] - ohaeng[a]).slice(0, 2)
    .map((o) => R.OH_META[o].name + ohaeng[o]).join('');

  return {
    version: 1,
    name,
    hourKnown,
    cover: {
      no, total: 60,
      ilju, iljuKo: ko(ilju) + '일주',
      alias: iljuText.alias,
      oneLine: iljuText.oneLine,
      facts: [
        { label: '서식', value: iljuText.habitat },
        { label: '체질', value: OH_ORDER.filter((o) => ohaeng[o] >= 2).sort((a, b) => ohaeng[b] - ohaeng[a]).map((o) => R.OH_META[o].name + ' ' + ohaeng[o]).join(' · ') || R.OH_META[r.ilgan.ohaeng].name + ' 중심' },
        nowDw ? { label: '지금', value: nowDw.ganZhiKo + ' 대운 (' + nowDw.startAge + '~' + nowDw.endAge + '세)' } : null
      ].filter(Boolean)
    },
    pillars,
    constitution: {
      total,
      items: OH_ORDER.map((o) => ({ ohaeng: o, ...R.OH_META[o], count: ohaeng[o], ...R.batteryLabel(ohaeng[o]) })),
      summary: R.ohaengSummary(ohaeng, yong),
      basis: total + '글자 속 나무·불·흙·쇠·물(오행) 개수'
    },
    habit: { ...R.habit(groups), groups, basis: '나와 다른 글자들의 관계(십성)를 다섯 묶음으로 센 것' },
    traits: { items: R.pickTraits(traitCandidates(r, keys), ctx), basis: '사주에 있는 특별한 표지(신살)와 부딪히는 글자(충·형)' },
    growth: { items: current, basis: '10년마다 바뀌는 큰 흐름(대운) · 나이는 태어난 해를 1살로 셈' },
    yearly: { items: yearlyOf(r, nowYear, ctx), basis: '그해에 들어오는 기운(세운)' },
    chemistry: { items: R.chemistry(day.branch), basis: '태어난 날 글자(' + BRANCH_KO[day.branch] + ')와 잘 맞고 부딪히는 띠' },
    approach: { items: iljuText.approach, basis: '태어난 날(' + ko(ilju) + '일주)의 성향' },
    favorites: yong ? { ohaeng: yong, ...R.favorites(yong), basis: '나에게 도움이 되는 기운(용신) · ' + R.OH_META[yong].name } : null,
    memo: { lines: iljuText.memo, hand: iljuText.hand },
    tags: ['#' + ko(ilju) + '일주', '#' + ohTag, nowDw ? '#지금은' + nowDw.ganZhiKo + '대운' : null, '#사주보는수달', '#사주도감', '#No' + no].filter(Boolean),
    note: hourKnown ? null : '태어난 시각을 몰라서 태어난 시의 두 글자는 빼고 계산했어요.'
  };
}

function readFieldGuide(birth, opts = {}) {
  return buildFieldGuide(computeSaju(birth), opts);
}

module.exports = { buildFieldGuide, readFieldGuide, sexagenaryNo, nameForms };

