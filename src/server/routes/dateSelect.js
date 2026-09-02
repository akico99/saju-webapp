'use strict';
/* 날짜 선택(택일) — 이사·개업·결혼처럼 "이미 있는 사람"에게 좋은 날을 찾아주는 것과,
   출산처럼 "아직 태어나지 않은 사람"에게 좋은 날을 찾아주는 것은 계산 방식이 다르다.

   - 이사/개업/결혼(사람 모드): 신청자 본인의 용신을 구하고, 후보 날짜의 오행이 그 용신과
     얼마나 잘 맞는지로 점수를 매긴다 — life-graph·오늘의 운세와 완전히 같은 계산
     (relationScore)을 재사용한다.
   - 출산(부모 모드): 아직 태어나지 않은 아이 자신의 사주이므로 "용신과 맞는지"를 따질
     기준이 없다 — 대신 그 순간 사주 8글자의 오행이 얼마나 골고루 있는지(balanceScoreOf)로
     보고, 부모와 부딪히는 날은 감점한다. 기존 출산택일(birth-timing)과 동일한 로직. */
const express = require('express');
const { computeSaju } = require('../../engine/index');
const { relationScore } = require('../../pdf/charts');
const { balanceScoreOf } = require('../../engine/timing');
const {
  STEM_KO, BRANCH_KO, STEM_OHAENG, BRANCH_MAIN_STEM, PRODUCES, CONTROLS,
  getShipsin, SHIPSIN_KO, SHIPSIN_GROUP
} = require('../../engine/constants');
const { classifyPair } = require('../../engine/compatibility');
const { generateDateSelectOverview } = require('../../llm/dateSelectReading');
const points = require('../../db/points');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const OCCASIONS = {
  moving: { label: '이사', question: '이사하기 좋은 날', mode: 'person' },
  opening: { label: '개업', question: '개업하기 좋은 날', mode: 'person' },
  wedding: { label: '결혼', question: '결혼하기 좋은 날', mode: 'person' },
  birth: { label: '출산', question: '출산하기 좋은 날', mode: 'parent' }
};

const DEFAULT_HOURS = [9, 10, 11, 13, 14, 15, 16];
const CHUNG_PAIRS = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
function isChung(b1, b2) {
  return CHUNG_PAIRS.some(([x, y]) => (x === b1 && y === b2) || (x === b2 && y === b1));
}

// 오행 한자는 일반 사용자에게 낯설어서 순우리말로 바꿔 보여준다.
const OHAENG_KO = { '木': '나무', '火': '불', '土': '흙', '金': '쇠', '水': '물' };

// relationScore와 같은 판정 기준(동일/생/극 등)을 "생조한다", "설기한다" 같은 전문용어 없이
// 일반인이 바로 이해할 쉬운 말로 바꿔준다. 점수 구간 3단계로만 나누면 후보마다 문구가 거의
// 똑같아지므로, 실제 오행 관계(6가지)별로 다른 표현을 써서 후보별 문장이 자연히 갈리게 한다.
function relationPhrase(ohaeng, yongshinMain) {
  if (!ohaeng || !yongshinMain) return '기운이 뚜렷하지 않은 편이에요';
  if (ohaeng === yongshinMain) return '당신에게 꼭 필요한 기운이 가득해요';
  if (PRODUCES[ohaeng] === yongshinMain) return '당신에게 필요한 기운을 든든하게 채워줘요';
  if (CONTROLS[ohaeng] === yongshinMain) return '당신에게 필요한 기운을 약하게 만들어요';
  if (CONTROLS[yongshinMain] === ohaeng) return '당신이 가볍게 이겨낼 수 있는 기운이라 크게 부담되지 않아요';
  if (PRODUCES[yongshinMain] === ohaeng) return '당신의 기운을 살짝 나눠 쓰게 만들어서 약간 힘이 빠질 수 있어요';
  return '특별히 좋지도 나쁘지도 않은 무난한 기운이에요';
}

// 점수를 한눈에 알 수 있는 짧은 결론 한 줄 — 뒤에 이어지는 상세 설명 없이 이 한 줄만 읽어도 되게 한다.
function verdictOf(score) {
  if (score >= 80) return '정말 좋은 날이에요!';
  if (score >= 65) return '좋은 날이에요.';
  if (score >= 50) return '무난한 날이에요.';
  if (score >= 35) return '조금 아쉬운 날이에요.';
  return '가급적 피하면 좋은 날이에요.';
}

// 이사·개업·결혼은 오행-용신 궁합 계산 방식은 같지만, 주제마다 "좋은 기운"의 의미가
// 다르다. 후보일의 천간이 신청자의 일간(본인) 기준으로 무슨 십신인지 봐서, 그 주제와
// 얼마나 잘 맞는 그룹인지 5단계로 순위를 매긴다 — 딱 1~2개 그룹만 다루던 이전 방식은
// 나머지 그룹에선 아무 언급이 없어서 주제를 바꿔도 문장이 똑같아 보이는 문제가 있었다.
// 이제는 5개 그룹 모두에 순위·문장이 있어서 항상 그 주제만의 해석이 붙고, 점수에도
// 절반 비중으로 반영되므로 같은 날짜라도 주제를 바꾸면 순위 자체가 달라진다.
const OCCASION_GROUP_ORDER = {
  moving: ['인성', '비겁', '식상', '재성', '관성'],
  opening: ['재성', '식상', '관성', '비겁', '인성'],
  wedding: ['관성', '재성', '인성', '식상', '비겁']
};
const OCCASION_GROUP_TEXT = {
  moving: {
    '인성': '안정적으로 자리 잡는 기운이 강해서 이사하기 특히 좋은 날이에요',
    '비겁': '내 힘으로 씩씩하게 밀고 나가는 기운이 있어서 이사하기 좋은 날이에요',
    '식상': '새로운 환경에 적응하는 활동적인 기운이 있는 날이에요',
    '재성': '이사 비용 등 돈 문제에 조금 신경 쓰이는 기운이 있는 날이에요',
    '관성': '이런저런 일과 부담이 늘어나기 쉬운 기운이라 이사는 신경 써서 준비하면 좋아요'
  },
  opening: {
    '재성': '돈이 들어오는 기운이 강해서 개업하기 특히 좋은 날이에요',
    '식상': '내 능력을 마음껏 펼칠 수 있는 기운이 있어서 개업하기 좋은 날이에요',
    '관성': '책임감 있게 사업을 이끌어가는 기운이 있는 날이에요',
    '비겁': '동업자나 경쟁자와 부딪히기 쉬운 기운이라 개업은 신경 써서 준비하면 좋아요',
    '인성': '크게 벌이기보단 차분히 다지기 좋은 기운이 있는 날이에요'
  },
  wedding: {
    '관성': '서로에 대한 책임감이 단단해지는 기운이 있어서 결혼하기 특히 좋은 날이에요',
    '재성': '인연이 안정적으로 자리 잡는 기운이 있어서 결혼하기 좋은 날이에요',
    '인성': '가족과 주변의 지지를 받는 기운이 있는 날이에요',
    '식상': '마음이 들뜨기 쉬운 기운이라 결혼 준비는 차분하게 챙기면 좋아요',
    '비겁': '주관이 강해지는 기운이라 배우자와 의견을 맞추는 데 신경 쓰면 좋아요'
  }
};
const OCCASION_GROUP_SCORE_TIERS = [90, 72, 55, 38, 20]; // 1~5순위
function occasionShipsinInfo(occasionKey, group) {
  const order = OCCASION_GROUP_ORDER[occasionKey];
  if (!order || !group) return { score: 55, phrase: '' };
  const idx = order.indexOf(group);
  const score = idx >= 0 ? OCCASION_GROUP_SCORE_TIERS[idx] : 55;
  const phrase = OCCASION_GROUP_TEXT[occasionKey]?.[group] || '';
  return { score, phrase };
}

// 실제 택일에서 많이 보는 기준 하나 더: 후보일의 지지가 신청자 본인의 일지(태어난 날의
// 지지, 그 사람을 상징하는 자리)와 합을 이루는지 충돌하는지. 오행-용신/십신 궁합과는
// 별개의 근거라서, 있을 때만 살짝 가감하고 문장에 덧붙인다(없으면 조용히 생략).
function dayBranchRelationInfo(personDayBranch, candidateDayBranch) {
  const rel = classifyPair(personDayBranch, candidateDayBranch);
  if (!rel) return { bonus: 0, phrase: '' };
  if (rel.type === 'yukhap') return { bonus: 6, phrase: '게다가 이 날은 당신 사주(태어난 날)와도 합을 이루어 조화롭게 흘러가요.' };
  if (rel.type === 'samhap') return { bonus: 4, phrase: '게다가 이 날은 당신 사주(태어난 날)와 흐름이 잘 통하는 날이에요.' };
  if (rel.type === 'chung') return { bonus: -10, phrase: '다만 이 날은 당신 사주(태어난 날)와 부딪히는 기운이 있어 조금 신경 쓰이는 날이에요.' };
  return { bonus: 0, phrase: '' };
}

function ganZhiOhaengScore(ganZhi, yongshinMain) {
  if (!ganZhi || !yongshinMain) return 50;
  const stemOhaeng = STEM_OHAENG[ganZhi[0]]?.ohaeng;
  const branchMainStem = BRANCH_MAIN_STEM[ganZhi[1]];
  const branchOhaeng = branchMainStem ? STEM_OHAENG[branchMainStem]?.ohaeng : null;
  const raw = Math.round(relationScore(stemOhaeng, yongshinMain) * 0.5 + relationScore(branchOhaeng, yongshinMain) * 0.5);
  return Math.max(5, Math.min(95, raw));
}

function parsePerson(body, prefix) {
  const f = (suffix) => (prefix ? prefix + suffix : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  const y = Number(body[f('Year')]), m = Number(body[f('Month')]), d = Number(body[f('Day')]);
  if (!y || !m || !d) return null;
  const hourGiven = body[f('HourUnknown')] !== 'true' && body[f('HourUnknown')] !== true;
  const hour = hourGiven && body[f('Hour')] !== '' && body[f('Hour')] != null ? Number(body[f('Hour')]) : null;
  const minute = hourGiven && body[f('Minute')] !== '' && body[f('Minute')] != null ? Number(body[f('Minute')]) : 0;
  const gender = body[f('Gender')] === '여' || body[f('Gender')] === '남' ? body[f('Gender')] : null;
  const isLunar = body[f('Calendar')] === '음력';
  const isLeap = !!body[f('IsLeap')];
  return { year: y, month: m, day: d, hour, minute, gender, isLunar, isLeap };
}

router.get('/date-select/occasions', (req, res) => {
  res.json({ occasions: OCCASIONS });
});

router.post('/date-select', requireAuth, async (req, res) => {
  const occasionKey = req.body.occasion;
  const occasion = OCCASIONS[occasionKey];
  if (!occasion) return res.status(400).json({ error: '알 수 없는 종류입니다.' });

  const { baseYear, baseMonth, baseDay } = req.body;
  const by = Number(baseYear), bm = Number(baseMonth), bd = Number(baseDay);
  if (!by || !bm || !bd) return res.status(400).json({ error: '기준 날짜를 올바르게 입력해주세요.' });
  const rangeDays = Math.min(10, Math.max(1, Number(req.body.rangeDays) || 5));
  const hours = Array.isArray(req.body.hours) && req.body.hours.length ? req.body.hours.map(Number) : DEFAULT_HOURS;
  // 결혼처럼 예식장·하객 사정상 사실상 주말(토·일)에만 여는 주제가 있다 — 평일 후보를
  // 아무리 점수 높게 뽑아줘도 실제로 쓸 수 없으면 무의미하므로, 신청자가 원하면
  // 애초에 후보군에서 평일을 제외한다.
  const weekendOnly = req.body.weekendOnly === true || req.body.weekendOnly === 'true';

  // 모드별로 필요한 사람 정보를 미리 계산해둔다 — 여기서 실패하면 포인트 차감 전에 걸러야 한다.
  let yongshinMain = null;
  let personDayStem = null;
  let personDayBranch = null;
  let personGanZhiKo = null;
  let personGender = null;
  let parentDayBranches = [];
  if (occasion.mode === 'person') {
    const personInput = parsePerson(req.body, '');
    if (!personInput) return res.status(400).json({ error: '본인 생년월일을 올바르게 입력해주세요.' });
    try {
      const personEngine = computeSaju(personInput);
      yongshinMain = personEngine.yongshin.final.main;
      personDayStem = personEngine.palja.dayPillar.stem;
      personDayBranch = personEngine.palja.dayPillar.branch;
      personGanZhiKo = (STEM_KO[personDayStem] || '') + (BRANCH_KO[personDayBranch] || '');
      personGender = personInput.gender;
    } catch (e) {
      return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
    }
  } else {
    try {
      ['a', 'b'].forEach((prefix) => {
        if (!req.body[`${prefix}Year`]) return;
        const parentInput = parsePerson(req.body, prefix);
        if (!parentInput) return;
        const parentEngine = computeSaju(parentInput);
        parentDayBranches.push(parentEngine.palja.dayPillar.branch);
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  try {
    points.chargeForProduct(req.session.userId, 'date_select');
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
    if (weekendOnly) {
      const weekday = d.getUTCDay(); // 0=일, 6=토
      if (weekday !== 0 && weekday !== 6) continue;
    }
    hours.forEach((hour) => {
      let engineResult;
      try {
        engineResult = computeSaju({ year: y, month: m, day, hour, minute: 0 });
      } catch (e) {
        return; // 계산 실패한 후보는 건너뜀(예: 범위 밖 날짜)
      }
      const dayStem = engineResult.palja.dayPillar.stem, dayBranch = engineResult.palja.dayPillar.branch;
      const ganZhi = dayStem + dayBranch;
      const ganZhiKo = (STEM_KO[dayStem] || '') + (BRANCH_KO[dayBranch] || '');
      const hourStem = engineResult.palja.hourPillar.stem, hourBranch = engineResult.palja.hourPillar.branch;
      const hourGanZhi = hourStem + hourBranch;
      const hourGanZhiKo = (STEM_KO[hourStem] || '') + (BRANCH_KO[hourBranch] || '');

      let score, reasonText;
      if (occasion.mode === 'person') {
        // 일진(날)이 큰 흐름, 시(시간)가 그 안의 세부 흐름 — 날 60% + 시 40%로 합산해야
        // 같은 날 다른 시간대끼리도 점수가 갈린다(일주만 보면 하루 내내 점수가 똑같아짐).
        const dayScore = ganZhiOhaengScore(ganZhi, yongshinMain);
        const hourScore = ganZhiOhaengScore(hourGanZhi, yongshinMain);
        const dayOhaeng = STEM_OHAENG[dayStem]?.ohaeng;
        const hourOhaeng = STEM_OHAENG[hourStem]?.ohaeng;
        const baseScore = Math.round(dayScore * 0.6 + hourScore * 0.4); // 나에게 맞는 기운인지(공통)

        // 이사·개업·결혼마다 "좋은 기운"의 의미가 다르므로, 후보일이 본인에게 무슨
        // 십신인지 봐서 그 주제와 얼마나 맞는지를 절반 비중으로 반영한다 — 이 비중을
        // 작게 두면 세 주제의 순위·문장이 사실상 똑같아 보이는 문제가 생긴다.
        const dayShipsinHanja = getShipsin(personDayStem, dayStem);
        const dayShipsinKo = dayShipsinHanja ? SHIPSIN_KO[dayShipsinHanja] : '비견';
        const shipsinGroup = SHIPSIN_GROUP[dayShipsinKo] || '비겁';
        const { score: occasionScore, phrase: occasionPhrase } = occasionShipsinInfo(occasionKey, shipsinGroup);

        // 세 번째 근거: 후보일이 신청자 본인의 일지(태어난 날)와 합/충을 이루는지.
        const { bonus: branchBonus, phrase: branchPhrase } = dayBranchRelationInfo(personDayBranch, dayBranch);

        score = Math.max(5, Math.min(95, Math.round(baseScore * 0.5 + occasionScore * 0.5) + branchBonus));

        const dayPhrase = relationPhrase(dayOhaeng, yongshinMain);
        const hourPhrase = relationPhrase(hourOhaeng, yongshinMain);
        const detailText = dayOhaeng === hourOhaeng
          ? `날과 시 모두 ${OHAENG_KO[dayOhaeng] || dayOhaeng} 기운이에요. ${dayPhrase}.`
          : `날의 기운(${OHAENG_KO[dayOhaeng] || dayOhaeng})은 ${dayPhrase}. 시의 기운(${OHAENG_KO[hourOhaeng] || hourOhaeng})은 ${hourPhrase}.`;
        reasonText = `${verdictOf(score)} ${detailText} ${occasionPhrase}${branchPhrase ? ' ' + branchPhrase : ''}`;
      } else {
        score = balanceScoreOf(engineResult.counts.ohaeng);
        const clashesWithParent = parentDayBranches.some((pb) => isChung(dayBranch, pb));
        const harmoniesWithParent = parentDayBranches.some((pb) => classifyPair(pb, dayBranch)?.type === 'yukhap');
        if (clashesWithParent) score -= 25;
        if (harmoniesWithParent) score += 8;
        score = Math.max(5, Math.min(95, score));
        const lackingCount = engineResult.counts.lacking.length;
        const detailText = lackingCount === 0
          ? '오행 다섯 가지가 골고루 있어서 한쪽으로 치우치지 않는 사주예요.'
          : `사주에 ${engineResult.counts.lacking.map((k) => OHAENG_KO[k] || k).join('·')} 기운이 비어있어서 조금 치우친 사주예요.`;
        reasonText = `${verdictOf(score)} ${detailText}`;
        if (clashesWithParent) reasonText += ' 다만 부모님 사주와 부딪히는 부분이 있어요.';
        if (harmoniesWithParent) reasonText += ' 게다가 부모님 사주와도 합을 이루는 날이에요.';
      }

      candidates.push({
        year: y, month: m, day, hour,
        ganZhi, ganZhiKo, hourGanZhiKo, ohaeng: engineResult.counts.ohaeng, lacking: engineResult.counts.lacking,
        score, reasonText
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, 8);

  // 결정론적 채점은 이미 끝났다 — 그 결과를 근거로 사람이 읽는 총평 한 단락을 AI로 붙인다.
  // 990원 빠른 리딩과 동일한 가치(개인화된 서술형 해설)를 여기서도 제공하는 부분.
  // 실패해도 핵심 상품(후보 목록)은 이미 완성돼 있으니 총평 없이 그대로 응답한다.
  let overview = null;
  try {
    overview = await generateDateSelectOverview({
      mode: occasion.mode,
      occasionLabel: occasion.label,
      question: occasion.question,
      gender: personGender,
      personGanZhiKo,
      yongshinOhaengKo: OHAENG_KO[yongshinMain] || yongshinMain,
      top: topCandidates.slice(0, 3)
    });
  } catch (e) {
    overview = null;
  }

  res.json({ occasion: occasionKey, occasionLabel: occasion.label, overview, candidates: topCandidates });
});

module.exports = router;
