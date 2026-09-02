'use strict';
/* 신규 저가 상품 3종 — 이직 시기 / 재회 가능성 / 출산택일.
   전부 LLM 없이 순수 계산이라 동기 응답으로 바로 결과를 준다(작업 폴링 불필요).
   결제는 기존 포인트 시스템(points.chargeForProduct) 그대로 쓴다. */
const express = require('express');
const { computeSaju } = require('../../engine/index');
const { analyzeCompatibility, classifyPair, PILLAR_KO } = require('../../engine/compatibility');
const { computeCareerTimeline, balanceScoreOf } = require('../../engine/timing');
const { STEM_KO, BRANCH_KO } = require('../../engine/constants');
const points = require('../../db/points');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// 십신 용어를 그대로 노출하지 않고, 관계 맥락의 쉬운 문장으로 바로 바꿔서 응답에 담는다
// (사주 지식이 전혀 없는 사람도 읽을 수 있어야 한다는 요구사항 — 프론트에서 다시 풀지 않도록
// 서버에서 완성 문장으로 내려준다).
const SHIPSIN_RELATION_TEXT = {
  '비견': '친구처럼 편안하게 느껴지는 상대예요',
  '겁재': '라이벌처럼 자꾸 신경 쓰이고 자극이 되는 상대예요',
  '식신': '같이 있으면 마음이 편안해지는 상대예요',
  '상관': '나를 표현하고 싶게 만드는, 자극이 되는 상대예요',
  '편재': '설레게 하지만 종잡기 어려운 매력의 상대예요',
  '정재': '안정적으로 챙겨주고 싶어지는 상대예요',
  '편관': '강하게 끌리지만 부담스러울 수도 있는 상대예요',
  '정관': '믿고 기대고 싶어지는 상대예요',
  '편인': '신비롭고 낯선 매력이 있는 상대예요',
  '정인': '나를 보살펴주는 든든한 상대예요'
};
const DAY_RELATION_TEXT = {
  yukhap: '두 사람의 가장 중요한 자리(일지)끼리 합이 있어요 — 자연스럽게 끌리는 조합이에요.',
  chung: '두 사람의 가장 중요한 자리(일지)끼리 부딪히는 관계예요 — 서로 안 맞는 부분이 있을 수 있어요.',
  samhap: '두 사람의 가장 중요한 자리(일지)가 강하게 묶여요 — 인연이 깊게 이어지는 조합이에요.'
};
const THIS_YEAR_SIGNAL_TEXT = {
  yukhap: '다시 이어질 만한 흐름이 있는 해예요.',
  samhap: '인연이 강하게 다시 엮일 수 있는 해예요.',
  chung: '아직 어긋나는 기운이 있어요 — 서두르기보다 시간을 두는 게 나을 수 있어요.'
};
// 일지(day) 외 같은 자리끼리(연지-연지, 월지-월지, 시지-시지)의 합/충 — 그 자리가 뜻하는
// 인생의 맥락에 맞춰 문장을 따로 둔다. 일지는 배우자궁이라 이미 dayRelationText로 다룬다.
const PILLAR_CONTEXT_TEXT = {
  year: {
    yukhap: '두 사람의 뿌리(연지)까지 잘 맞닿아 있어요 — 태생적으로 인연이 있는 조합이에요.',
    samhap: '두 사람의 뿌리(연지)가 강하게 묶여요 — 처음부터 깊게 이어질 인연이었을 수 있어요.',
    chung: '뿌리(연지)에서부터 서로 다른 환경이라, 배경이나 가치관이 안 맞을 수 있어요.'
  },
  month: {
    yukhap: '지금 이 시기(월지)의 기운이 잘 맞아서, 주변 상황도 자연스럽게 다시 얽힐 수 있어요.',
    samhap: '지금 이 시기(월지)의 기운이 강하게 묶여서, 사회적으로도 다시 만날 계기가 잘 만들어질 수 있어요.',
    chung: '지금 이 시기(월지)의 기운은 서로 부딪혀서, 주변 상황이 쉽게 맞아떨어지진 않을 수 있어요.'
  },
  hour: {
    yukhap: '미래를 그리는 자리(시지)까지 맞아서, 함께하는 그림이 자연스럽게 그려지는 조합이에요.',
    samhap: '미래를 그리는 자리(시지)가 강하게 묶여서, 장기적으로 함께할 그림이 잘 맞는 편이에요.',
    chung: '미래를 그리는 자리(시지)가 부딪혀서, 그리는 방향이 서로 다를 수 있어요.'
  }
};

function fieldKey(prefix, suffix) {
  return prefix ? prefix + suffix : suffix.charAt(0).toLowerCase() + suffix.slice(1);
}

function parsePerson(body, prefix) {
  const f = (suffix) => fieldKey(prefix, suffix);
  const y = Number(body[f('Year')]), m = Number(body[f('Month')]), d = Number(body[f('Day')]);
  if (!y || !m || !d) throw new Error(`${prefix ? '상대방' : '본인'} 생년월일을 올바르게 입력해주세요.`);
  const hourGiven = body[f('HourUnknown')] !== 'true' && body[f('HourUnknown')] !== true;
  const hour = hourGiven && body[f('Hour')] !== '' && body[f('Hour')] != null ? Number(body[f('Hour')]) : null;
  const minute = hourGiven && body[f('Minute')] !== '' && body[f('Minute')] != null ? Number(body[f('Minute')]) : 0;
  const gender = body[f('Gender')] === '여' || body[f('Gender')] === '남' ? body[f('Gender')] : null;
  const isLunar = body[f('Calendar')] === '음력';
  const isLeap = !!body[f('IsLeap')];
  return { year: y, month: m, day: d, hour, minute, gender, isLunar, isLeap };
}

/* ---------- 1. 이직 시기 (990원) ---------- */
router.post('/career-timing', requireAuth, (req, res) => {
  let input;
  try {
    input = parsePerson(req.body, '');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let engineResult;
  try {
    engineResult = computeSaju(input);
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }

  try {
    points.chargeForProduct(req.session.userId, 'career_timing');
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  const thisYear = new Date().getFullYear();
  const timeline = computeCareerTimeline(engineResult, thisYear, 5)
    .map((t) => ({ ...t, ganZhiKo: (STEM_KO[t.ganZhi[0]] || '') + (BRANCH_KO[t.ganZhi[1]] || '') }));
  const best = timeline.slice().sort((a, b) => b.score - a.score)[0] || null;

  res.json({ ilgan: engineResult.ilgan, timeline, best });
});

/* ---------- 2. 재회 가능성 (990원) ---------- */
router.post('/reunion-check', requireAuth, (req, res) => {
  let inputA, inputB;
  try {
    inputA = parsePerson(req.body, 'a');
    inputB = parsePerson(req.body, 'b');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let engineA, engineB;
  try {
    engineA = computeSaju(inputA);
    engineB = computeSaju(inputB);
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }

  try {
    points.chargeForProduct(req.session.userId, 'reunion');
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  const compat = analyzeCompatibility(engineA, engineB);

  // 앞으로 3년(올해 포함) 흐름 — 본인의 그 해 세운 지지가 상대방 일지와 합/충인지로
  // "언제가 다시 이어지기 좋은 시기인지"를 한 해만이 아니라 흐름으로 보여준다.
  const thisYear = new Date().getFullYear();
  const yearEntries = engineA.daewoon.flatMap((d) => d.years);
  const partnerDayBranch = engineB.palja.dayPillar.branch;
  const yearSignals = [];
  for (let y = thisYear; y < thisYear + 3; y++) {
    const entry = yearEntries.find((yy) => yy.year === y && yy.ganZhi);
    if (!entry) continue;
    const rel = classifyPair(entry.ganZhi[1], partnerDayBranch);
    const relationType = rel ? rel.type : null;
    yearSignals.push({
      year: y, ganZhi: entry.ganZhi, relationType,
      text: THIS_YEAR_SIGNAL_TEXT[relationType] || '특별히 강한 신호 없이 평범하게 흘러가는 해예요.'
    });
  }
  const thisYearSignal = yearSignals[0] || null;
  const bestYearSignal = yearSignals.slice().sort((a, b) => {
    const rank = { samhap: 2, yukhap: 1 };
    return (rank[b.relationType] || 0) - (rank[a.relationType] || 0);
  })[0] || null;

  // 일지 외 같은 자리끼리(연지-연지, 월지-월지, 시지-시지)의 합/충 중 눈에 띄는 것 최대 2개
  // — 일지(day)는 이미 dayRelationText로 다루니 제외한다.
  const notablePillarMatches = [...compat.crossSamhap, ...compat.crossYukhap, ...compat.crossChung]
    .filter((m) => m.pillarA === m.pillarB && m.pillarA !== 'day')
    .reduce((acc, m) => {
      if (acc.some((x) => x.pillarA === m.pillarA)) return acc; // 자리당 하나만
      const type = compat.crossSamhap.includes(m) ? 'samhap' : compat.crossYukhap.includes(m) ? 'yukhap' : 'chung';
      const text = PILLAR_CONTEXT_TEXT[m.pillarA] && PILLAR_CONTEXT_TEXT[m.pillarA][type];
      if (text) acc.push({ pillar: m.pillarA, pillarKo: PILLAR_KO[m.pillarA], type, text });
      return acc;
    }, [])
    .slice(0, 2);

  const totalGoodLinks = compat.crossYukhap.length + compat.crossSamhap.length;
  const totalClashes = compat.crossChung.length;
  const overallText = totalGoodLinks === 0 && totalClashes === 0
    ? '전체 여덟 자리 사이에 두드러진 합이나 충은 없어요 — 강한 인연도, 강한 마찰도 아닌 무난한 조합이에요.'
    : totalGoodLinks > totalClashes * 1.5
      ? `사주 전체 여덟 자리를 비교했을 때 합이 ${totalGoodLinks}번, 충돌이 ${totalClashes}번 나타나요. 전체적으로 합이 더 많아서 인연이 이어질 여지가 있는 조합이에요.`
      : totalClashes > totalGoodLinks
        ? `사주 전체 여덟 자리를 비교했을 때 합이 ${totalGoodLinks}번, 충돌이 ${totalClashes}번 나타나요. 충돌이 더 많아서 다시 만나더라도 서로 맞춰가는 노력이 필요한 조합이에요.`
        : `사주 전체 여덟 자리를 비교했을 때 합이 ${totalGoodLinks}번, 충돌이 ${totalClashes}번 나타나요. 좋을 때와 부딪힐 때가 뚜렷하게 갈리는 조합이에요.`;

  const plain = {
    dayRelationText: DAY_RELATION_TEXT[compat.dayRelation && compat.dayRelation.type]
      || '두 사람의 가장 중요한 자리(일지)끼리 직접적인 합·충은 없어요 — 무난하게 흘러가는 조합이에요.',
    partnerToMeText: compat.shipsinAtoBKo ? SHIPSIN_RELATION_TEXT[compat.shipsinAtoBKo] : null,
    meToPartnerText: compat.shipsinBtoAKo ? SHIPSIN_RELATION_TEXT[compat.shipsinBtoAKo] : null,
    scoreText: compat.score >= 75 ? '전체적으로 잘 맞는 편이에요'
      : compat.score >= 50 ? '무난하게 맞는 편이에요'
      : '서로 다른 점이 꽤 있는 편이에요',
    overallText
  };

  res.json({ compat, thisYearSignal, yearSignals, bestYearSignal, notablePillarMatches, plain });
});

/* ---------- 3. 출산택일 (2,900원) ---------- */
const DEFAULT_HOURS = [9, 10, 11, 13, 14, 15, 16];
const CHUNG_PAIRS = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
function isChung(b1, b2) {
  return CHUNG_PAIRS.some(([x, y]) => (x === b1 && y === b2) || (x === b2 && y === b1));
}

router.post('/birth-timing', requireAuth, (req, res) => {
  const { baseYear, baseMonth, baseDay } = req.body;
  const by = Number(baseYear), bm = Number(baseMonth), bd = Number(baseDay);
  if (!by || !bm || !bd) return res.status(400).json({ error: '출산 예정일을 올바르게 입력해주세요.' });

  const rangeDays = Math.min(10, Math.max(1, Number(req.body.rangeDays) || 5));
  const hours = Array.isArray(req.body.hours) && req.body.hours.length ? req.body.hours.map(Number) : DEFAULT_HOURS;

  let parentDayBranches = [];
  try {
    ['a', 'b'].forEach((prefix) => {
      const hasAny = req.body[`${prefix}Year`];
      if (!hasAny) return;
      const parentInput = parsePerson(req.body, prefix);
      const parentEngine = computeSaju(parentInput);
      parentDayBranches.push(parentEngine.palja.dayPillar.branch);
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    points.chargeForProduct(req.session.userId, 'birth_timing');
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  const base = new Date(Date.UTC(by, bm - 1, bd));
  const candidates = [];
  for (let offset = -rangeDays; offset <= rangeDays; offset++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
    hours.forEach((hour) => {
      let engineResult;
      try {
        engineResult = computeSaju({ year: y, month: m, day, hour, minute: 0 });
      } catch (e) {
        return; // 계산 실패한 후보는 그냥 건너뜀(예: 범위 밖 날짜)
      }
      let score = balanceScoreOf(engineResult.counts.ohaeng);
      const dayStem = engineResult.palja.dayPillar.stem, dayBranch = engineResult.palja.dayPillar.branch;
      const clashesWithParent = parentDayBranches.some((pb) => isChung(dayBranch, pb));
      if (clashesWithParent) score -= 25;
      score = Math.max(5, Math.min(95, score));

      const lackingCount = engineResult.counts.lacking.length;
      let reasonText = lackingCount === 0
        ? '오행 다섯 가지가 골고루 있어서 한쪽으로 치우치지 않는 사주예요.'
        : `사주에 ${engineResult.counts.lacking.join('·')} 기운이 비어있어서 조금 치우친 사주예요.`;
      if (clashesWithParent) reasonText += ' 다만 부모님 사주와 부딪히는 부분이 있어요.';

      candidates.push({
        year: y, month: m, day, hour,
        ganZhi: dayStem + dayBranch, ganZhiKo: (STEM_KO[dayStem] || '') + (BRANCH_KO[dayBranch] || ''),
        ohaeng: engineResult.counts.ohaeng, lacking: engineResult.counts.lacking,
        clashesWithParent, score, reasonText
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  res.json({ candidates: candidates.slice(0, 8) });
});

module.exports = router;
