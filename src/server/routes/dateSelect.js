'use strict';
/* 날짜 선택(택일) — 세 가지 입력 방식이 있다.

   1) 날짜 범위 모드(이사/개업): 기준일 앞뒤 며칠 안에서 날짜·시간 후보를 점수순으로 뽑는다.
   2) 연도 모드(결혼/임신 시도): "몇 년도"만 받아서 그 해 전체를 훑고, 좋은 "몇 월 몇째 주"를
      찾아준다 — 결혼·임신 시도는 애초에 "그날 아침에 정하는" 게 아니라 미리 달·주 단위로
      계획하는 일이라, 날짜 하나를 콕 찍어주는 것보다 이 방식이 실제로 더 쓸모 있다.
   3) 부모 모드(출산): 아직 태어나지 않은 아이 자신의 사주이므로 "용신과 맞는지"를 따질 기준이
      없다 — 그 순간 사주 8글자의 오행이 얼마나 골고루 있는지(balanceScoreOf)로 보고, 부모와
      부딪히는 날은 감점한다.

   점수 계산 공통 원칙(사람 모드): ①오행-용신 궁합(날 60%+시 40%) ②주제별 십신 궁합(주제마다
   "좋은 기운"의 의미가 다름) ③본인 일지와의 합충 — 세 근거를 절반씩 섞어서 매긴다. */
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
  moving: { label: '이사', question: '이사하기 좋은 날', mode: 'person', productKey: 'date_select_moving' },
  opening: { label: '개업', question: '개업하기 좋은 날', mode: 'person', productKey: 'date_select_opening' },
  wedding: {
    label: '결혼', question: '결혼하기 좋은 날', mode: 'person', productKey: 'date_select_wedding',
    yearMode: true, weekendOnly: true
  },
  conception: {
    label: '임신 시도', question: '임신 시도하기 좋은 날', mode: 'person', productKey: 'date_select_conception',
    yearMode: true, weekendOnly: false, genderAware: true
  },
  birth: { label: '출산', question: '출산하기 좋은 날', mode: 'parent', productKey: 'date_select_birth' }
};

// 이사에서만 쓰는 오행-방위 매핑 — 18장 리포트 개운법과 같은 기준(interpretation.md §보충법)을
// 그대로 재사용한다: 木=동쪽, 火=남쪽, 土=중앙(가까운 곳), 金=서쪽, 水=북쪽.
const OHAENG_DIRECTION = {
  '木': { direction: '동쪽', note: '성장과 새로운 시작의 기운을 북돋아주는 방향이에요' },
  '火': { direction: '남쪽', note: '활력과 밝은 기운을 채워주는 방향이에요' },
  '土': { direction: '지금 사는 곳과 가까운 동네', note: '멀리 옮기기보다 익숙한 생활권 안에서 안정을 찾는 편이 잘 맞아요' },
  '金': { direction: '서쪽', note: '결단력과 재물운을 도와주는 방향이에요' },
  '水': { direction: '북쪽', note: '차분함과 지혜의 기운을 채워주는 방향이에요' }
};

// 개업에서만 쓰는 오행-업종 키워드 매핑 — interpretation.md §오행별 키워드(木=성장·기획·인정욕
// / 火=표현·열정·명예 / 土=안정·신뢰·중재 / 金=결단·규율·재물 / 水=지혜·유연·욕망)를 그대로
// 재사용해 "구체적인 업종 하나"가 아니라 방향성(키워드)만 제시한다 — 특정 사업 성패를
// 단정하지 않기 위해서다.
const OHAENG_BUSINESS = {
  '木': { field: '교육·기획·미디어·콘텐츠 계열', note: '새로운 걸 키우고 알리는 일에 특히 힘이 실려요' },
  '火': { field: '요식업·엔터테인먼트·마케팅 계열', note: '사람을 모으고 표현하는 일에 특히 힘이 실려요' },
  '土': { field: '부동산·중개·상담·안정적인 자영업 계열', note: '신뢰를 쌓아가는 꾸준한 일에 특히 힘이 실려요' },
  '金': { field: '금융·제조·기술·재무 계열', note: '숫자와 규율을 다루는 일에 특히 힘이 실려요' },
  '水': { field: '유통·무역·서비스·물류 계열', note: '흐름을 만들고 사람을 연결하는 일에 특히 힘이 실려요' }
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

// 이사·개업·결혼·임신 시도는 오행-용신 궁합 계산 방식은 같지만, 주제마다 "좋은 기운"의
// 의미가 다르다. 후보일의 천간이 신청자의 일간(본인) 기준으로 무슨 십신인지 봐서, 그
// 주제와 얼마나 잘 맞는 그룹인지 5단계로 순위를 매긴다 — 5개 그룹 모두에 순위·문장이
// 있어야 후보마다, 주제마다 문장이 자연히 갈린다.
// 임신 시도는 전통 명리학에서 자녀를 상징하는 십신이 성별에 따라 다르다고 보므로
// (여성=식상, 남성=관성) 성별별로 순서를 따로 둔다.
const OCCASION_GROUP_ORDER = {
  moving: ['인성', '비겁', '식상', '재성', '관성'],
  opening: ['재성', '식상', '관성', '비겁', '인성'],
  wedding: ['관성', '재성', '인성', '식상', '비겁'],
  conception: {
    여: ['식상', '인성', '재성', '비겁', '관성'],
    남: ['관성', '재성', '인성', '식상', '비겁']
  }
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
  },
  conception: {
    '식상': '새 생명을 품고 표현하는 기운이 강해서 임신 시도에 특히 좋은 흐름이에요',
    '관성': '책임감과 인연이 맺어지는 기운이 있어서 임신 시도에 특히 좋은 흐름이에요',
    '인성': '몸과 마음이 안정되고 받아들이는 기운이 있는 시기예요',
    '재성': '결실을 맺는 기운이 있는 시기예요',
    '비겁': '내 컨디션에 집중하는 기운이라 무리하지 않고 몸을 챙기면 좋아요'
  }
};
const OCCASION_GROUP_SCORE_TIERS = [90, 72, 55, 38, 20]; // 1~5순위
function occasionShipsinInfo(occasionKey, group, gender) {
  let order = OCCASION_GROUP_ORDER[occasionKey];
  if (order && !Array.isArray(order)) order = order[gender] || order['남']; // 성별 모르면 남 기준
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

// 사람 모드(이사/개업/결혼/임신 시도) 공통 채점 — 날짜 범위 모드와 연도 모드 둘 다 여기를 쓴다.
// includeHour=false면 일주(날)만으로 채점한다(연도 모드에서 그 해 모든 날을 훑을 때, 시간까지
// 계산하면 7배 느려지므로 날짜 단위로 먼저 추리고 상위 후보만 시간까지 본다).
function scorePersonCandidate({ engineResult, occasionKey, yongshinMain, personDayStem, personDayBranch, gender, includeHour }) {
  const dayStem = engineResult.palja.dayPillar.stem, dayBranch = engineResult.palja.dayPillar.branch;
  const ganZhi = dayStem + dayBranch;
  const ganZhiKo = (STEM_KO[dayStem] || '') + (BRANCH_KO[dayBranch] || '');
  const dayOhaeng = STEM_OHAENG[dayStem]?.ohaeng;
  const dayScore = ganZhiOhaengScore(ganZhi, yongshinMain);

  let hourGanZhiKo = null, baseScore = dayScore, hourOhaeng = null;
  if (includeHour) {
    const hourStem = engineResult.palja.hourPillar.stem, hourBranch = engineResult.palja.hourPillar.branch;
    const hourGanZhi = hourStem + hourBranch;
    hourGanZhiKo = (STEM_KO[hourStem] || '') + (BRANCH_KO[hourBranch] || '');
    hourOhaeng = STEM_OHAENG[hourStem]?.ohaeng;
    const hourScore = ganZhiOhaengScore(hourGanZhi, yongshinMain);
    baseScore = Math.round(dayScore * 0.6 + hourScore * 0.4); // 일진(날) 60% + 시 40%
  }

  const dayShipsinHanja = getShipsin(personDayStem, dayStem);
  const dayShipsinKo = dayShipsinHanja ? SHIPSIN_KO[dayShipsinHanja] : '비견';
  const shipsinGroup = SHIPSIN_GROUP[dayShipsinKo] || '비겁';
  const { score: occasionScore, phrase: occasionPhrase } = occasionShipsinInfo(occasionKey, shipsinGroup, gender);

  const { bonus: branchBonus, phrase: branchPhrase } = dayBranchRelationInfo(personDayBranch, dayBranch);

  const score = Math.max(5, Math.min(95, Math.round(baseScore * 0.5 + occasionScore * 0.5) + branchBonus));

  const dayPhrase = relationPhrase(dayOhaeng, yongshinMain);
  let detailText;
  if (includeHour) {
    const hourPhrase = relationPhrase(hourOhaeng, yongshinMain);
    detailText = dayOhaeng === hourOhaeng
      ? `날과 시 모두 ${OHAENG_KO[dayOhaeng] || dayOhaeng} 기운이에요. ${dayPhrase}.`
      : `날의 기운(${OHAENG_KO[dayOhaeng] || dayOhaeng})은 ${dayPhrase}. 시의 기운(${OHAENG_KO[hourOhaeng] || hourOhaeng})은 ${hourPhrase}.`;
  } else {
    detailText = `이 날은 ${OHAENG_KO[dayOhaeng] || dayOhaeng} 기운이에요. ${dayPhrase}.`;
  }
  const reasonText = `${verdictOf(score)} ${detailText} ${occasionPhrase}${branchPhrase ? ' ' + branchPhrase : ''}`;

  return { score, ganZhi, ganZhiKo, hourGanZhiKo, dayOhaeng, reasonText };
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

function computePersonBasics(req) {
  const personInput = parsePerson(req.body, '');
  if (!personInput) return { error: '본인 생년월일을 올바르게 입력해주세요.' };
  try {
    const personEngine = computeSaju(personInput);
    const personDayStem = personEngine.palja.dayPillar.stem;
    const personDayBranch = personEngine.palja.dayPillar.branch;
    return {
      yongshinMain: personEngine.yongshin.final.main,
      personDayStem, personDayBranch,
      personGanZhiKo: (STEM_KO[personDayStem] || '') + (BRANCH_KO[personDayBranch] || ''),
      personGender: personInput.gender
    };
  } catch (e) {
    return { error: '명식 계산 실패: ' + e.message };
  }
}

router.get('/date-select/occasions', (req, res) => {
  res.json({ occasions: OCCASIONS });
});

router.post('/date-select', requireAuth, async (req, res) => {
  const occasionKey = req.body.occasion;
  const occasion = OCCASIONS[occasionKey];
  if (!occasion) return res.status(400).json({ error: '알 수 없는 종류입니다.' });

  if (occasion.yearMode) return runYearSearch(req, res, occasionKey, occasion);
  return runDateRangeSearch(req, res, occasionKey, occasion);
});

// 날짜 범위 모드 — 이사/개업(그리고 부모 모드인 출산). 기준일 앞뒤 며칠 안에서 후보를 뽑는다.
async function runDateRangeSearch(req, res, occasionKey, occasion) {
  const { baseYear, baseMonth, baseDay } = req.body;
  const by = Number(baseYear), bm = Number(baseMonth), bd = Number(baseDay);
  if (!by || !bm || !bd) return res.status(400).json({ error: '기준 날짜를 올바르게 입력해주세요.' });
  const rangeDays = Math.min(10, Math.max(1, Number(req.body.rangeDays) || 5));
  const hours = Array.isArray(req.body.hours) && req.body.hours.length ? req.body.hours.map(Number) : DEFAULT_HOURS;

  let yongshinMain = null, personDayStem = null, personDayBranch = null, personGanZhiKo = null, personGender = null;
  let parentDayBranches = [];
  if (occasion.mode === 'person') {
    const basics = computePersonBasics(req);
    if (basics.error) return res.status(400).json({ error: basics.error });
    ({ yongshinMain, personDayStem, personDayBranch, personGanZhiKo, personGender } = basics);
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
    points.chargeForProduct(req.session.userId, occasion.productKey);
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
        return;
      }
      const dayBranch = engineResult.palja.dayPillar.branch;

      let score, reasonText, ganZhi, ganZhiKo, hourGanZhiKo;
      if (occasion.mode === 'person') {
        ({ score, reasonText, ganZhi, ganZhiKo, hourGanZhiKo } = scorePersonCandidate({
          engineResult, occasionKey, yongshinMain, personDayStem, personDayBranch, gender: personGender, includeHour: true
        }));
      } else {
        ganZhi = engineResult.palja.dayPillar.stem + dayBranch;
        ganZhiKo = (STEM_KO[engineResult.palja.dayPillar.stem] || '') + (BRANCH_KO[dayBranch] || '');
        const hourStem = engineResult.palja.hourPillar.stem, hourBranch = engineResult.palja.hourPillar.branch;
        hourGanZhiKo = (STEM_KO[hourStem] || '') + (BRANCH_KO[hourBranch] || '');
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

  // 이사만 해당 — 이사 갈 방향까지 알려달라는 요청 반영. 용신 오행을 방위로 환산한다
  // (18장 리포트 개운법과 같은 기준). 지어낼 수 없는 "구체적 지역"이 아니라, 명리학에서
  // 실제로 쓰는 개운법 범위(방위)까지만 다룬다.
  let recommendedDirection = null;
  if (occasionKey === 'moving' && yongshinMain && OHAENG_DIRECTION[yongshinMain]) {
    recommendedDirection = { ohaeng: OHAENG_KO[yongshinMain], ...OHAENG_DIRECTION[yongshinMain] };
  }
  // 개업만 해당 — 용신 오행을 어울리는 업종 "키워드"로 환산한다(특정 사업 성패는 단정하지 않음).
  let recommendedBusiness = null;
  if (occasionKey === 'opening' && yongshinMain && OHAENG_BUSINESS[yongshinMain]) {
    recommendedBusiness = { ohaeng: OHAENG_KO[yongshinMain], ...OHAENG_BUSINESS[yongshinMain] };
  }

  let overview = null;
  try {
    overview = await generateDateSelectOverview({
      mode: occasion.mode,
      occasionLabel: occasion.label,
      question: occasion.question,
      gender: personGender,
      personGanZhiKo,
      yongshinOhaengKo: OHAENG_KO[yongshinMain] || yongshinMain,
      recommendedDirection,
      recommendedBusiness,
      top: topCandidates.slice(0, 3)
    });
  } catch (e) {
    overview = null;
  }

  res.json({
    occasion: occasionKey, occasionLabel: occasion.label, mode: 'range', overview,
    recommendedDirection, recommendedBusiness,
    candidates: topCandidates
  });
}

const WEEK_LABELS = ['첫째', '둘째', '셋째', '넷째', '다섯째'];
function weekOfMonthLabel(day) {
  return WEEK_LABELS[Math.min(4, Math.floor((day - 1) / 7))];
}

// 연도 모드 — 결혼/임신 시도. 특정 날짜 하나가 아니라 "몇 월 몇째 주가 좋은지"를 찾는다.
// 결혼은 예식장·하객 사정상 주말만, 임신 시도는 요일 제한이 의미 없어 매일을 훑는다.
async function runYearSearch(req, res, occasionKey, occasion) {
  const year = Number(req.body.targetYear);
  const nowYear = new Date().getFullYear();
  if (!year || year < nowYear || year > nowYear + 5) {
    return res.status(400).json({ error: `연도는 ${nowYear}~${nowYear + 5} 사이로 입력해주세요.` });
  }

  const basics = computePersonBasics(req);
  if (basics.error) return res.status(400).json({ error: basics.error });
  const { yongshinMain, personDayStem, personDayBranch, personGanZhiKo, personGender } = basics;

  try {
    points.chargeForProduct(req.session.userId, occasion.productKey);
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  // 1단계: 그 해의 (필요하면 주말만) 모든 날을 일주 기준으로만 빠르게 채점한다 — 시간까지
  // 다 돌리면 365일×7시간이라 너무 느려서, 날짜 단위로 먼저 추려낸다.
  const dayResults = [];
  const cursor = new Date(Date.UTC(year, 0, 1));
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  while (cursor <= endOfYear) {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth() + 1, day = cursor.getUTCDate();
    const weekday = cursor.getUTCDay();
    if (!occasion.weekendOnly || weekday === 0 || weekday === 6) {
      try {
        const engineResult = computeSaju({ year: y, month: m, day, hour: 12, minute: 0 });
        const { score } = scorePersonCandidate({
          engineResult, occasionKey, yongshinMain, personDayStem, personDayBranch,
          gender: personGender, includeHour: false
        });
        dayResults.push({ year: y, month: m, day, score });
      } catch (e) { /* 계산 실패한 날은 건너뜀 */ }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // 2단계: 월+몇째 주로 묶어서, 그 주 안에서 가장 점수 높은 날을 대표로 삼는다.
  const weekGroups = {};
  dayResults.forEach((r) => {
    const key = `${r.month}-${weekOfMonthLabel(r.day)}`;
    if (!weekGroups[key]) weekGroups[key] = { month: r.month, weekLabel: weekOfMonthLabel(r.day), days: [] };
    weekGroups[key].days.push(r);
  });
  let weeks = Object.values(weekGroups).map((w) => {
    const best = w.days.reduce((a, b) => (b.score > a.score ? b : a));
    const dayNums = w.days.map((d) => d.day).sort((a, b) => a - b);
    return {
      month: w.month, weekLabel: w.weekLabel,
      dateRangeLabel: `${w.month}월 ${w.weekLabel}주 (${dayNums.map((d) => `${w.month}/${d}`).join(', ')})`,
      score: best.score, bestDate: { year: best.year, month: w.month, day: best.day }
    };
  });
  weeks.sort((a, b) => b.score - a.score);
  weeks = weeks.slice(0, 8);

  // 3단계: 상위 몇 개 주만 그 대표일의 시간대까지 세부 계산해서, 실제로 쓸 문장·시간을 채운다.
  weeks = weeks.map((w) => {
    const hourCandidates = DEFAULT_HOURS.map((hour) => {
      let engineResult;
      try {
        engineResult = computeSaju({ year: w.bestDate.year, month: w.bestDate.month, day: w.bestDate.day, hour, minute: 0 });
      } catch (e) {
        return null;
      }
      const { score, ganZhiKo, hourGanZhiKo, reasonText } = scorePersonCandidate({
        engineResult, occasionKey, yongshinMain, personDayStem, personDayBranch,
        gender: personGender, includeHour: true
      });
      return { hour, ganZhiKo, hourGanZhiKo, score, reasonText };
    }).filter(Boolean);
    hourCandidates.sort((a, b) => b.score - a.score);
    const top = hourCandidates[0] || null;
    return {
      month: w.month, weekLabel: w.weekLabel, dateRangeLabel: w.dateRangeLabel,
      bestDate: w.bestDate, score: top ? top.score : w.score,
      ganZhiKo: top ? top.ganZhiKo : null, bestHour: top ? top.hour : null,
      bestHourGanZhiKo: top ? top.hourGanZhiKo : null,
      reasonText: top ? top.reasonText : '',
      topTimes: hourCandidates.slice(0, 3)
    };
  });
  weeks.sort((a, b) => b.score - a.score);

  let overview = null;
  try {
    overview = await generateDateSelectOverview({
      mode: 'personYear',
      occasionLabel: occasion.label,
      question: occasion.question,
      gender: personGender,
      personGanZhiKo,
      yongshinOhaengKo: OHAENG_KO[yongshinMain] || yongshinMain,
      year,
      weeks: weeks.slice(0, 3)
    });
  } catch (e) {
    overview = null;
  }

  res.json({ occasion: occasionKey, occasionLabel: occasion.label, mode: 'year', year, overview, weeks });
}

module.exports = router;
