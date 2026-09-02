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

// 이사·개업·결혼은 계산 방식(오행-용신 궁합)은 같지만, 주제마다 "좋은 기운"의 의미가 다르다.
// 후보일의 천간이 신청자의 일간(본인) 기준으로 무슨 십신인지 봐서, 그 주제와 잘 맞는
// 십신 그룹이면 가산점 + 주제에 맞는 해석 문장을, 안 맞으면 감점 + 주의 문장을 붙인다.
const OCCASION_SHIPSIN = {
  moving: {
    good: { '인성': '안정적으로 자리 잡는 기운이 있어서 이사하기 좋아요', '비겁': '내 힘으로 씩씩하게 밀고 나가는 기운이 있어서 이사하기 좋아요' },
    bad: { '관성': '이런저런 일과 부담이 늘어나기 쉬운 기운이라 이사엔 조금 신경 쓰이는 날이에요' }
  },
  opening: {
    good: { '재성': '돈이 들어오는 기운이 강해서 개업하기 좋아요', '식상': '내 능력을 마음껏 펼칠 수 있는 기운이 있어서 개업하기 좋아요' },
    bad: { '비겁': '동업자나 경쟁자와 부딪히기 쉬운 기운이라 개업엔 조금 신경 쓰이는 날이에요' }
  },
  wedding: {
    good: { '재성': '인연이 안정적으로 자리 잡는 기운이 있어서 결혼하기 좋아요', '관성': '서로에 대한 책임감이 단단해지는 기운이 있어서 결혼하기 좋아요' },
    bad: { '식상': '마음이 들뜨기 쉬운 기운이라 결혼 준비는 차분하게 챙기면 좋아요' }
  }
};
const OCCASION_GROUP_BONUS = 8;
const OCCASION_GROUP_PENALTY = -6;
function occasionShipsinInfo(occasionKey, group) {
  const table = OCCASION_SHIPSIN[occasionKey];
  if (!table || !group) return { bonus: 0, phrase: null };
  if (table.good[group]) return { bonus: OCCASION_GROUP_BONUS, phrase: table.good[group] };
  if (table.bad[group]) return { bonus: OCCASION_GROUP_PENALTY, phrase: table.bad[group] };
  return { bonus: 0, phrase: null };
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

router.post('/date-select', requireAuth, (req, res) => {
  const occasionKey = req.body.occasion;
  const occasion = OCCASIONS[occasionKey];
  if (!occasion) return res.status(400).json({ error: '알 수 없는 종류입니다.' });

  const { baseYear, baseMonth, baseDay } = req.body;
  const by = Number(baseYear), bm = Number(baseMonth), bd = Number(baseDay);
  if (!by || !bm || !bd) return res.status(400).json({ error: '기준 날짜를 올바르게 입력해주세요.' });
  const rangeDays = Math.min(10, Math.max(1, Number(req.body.rangeDays) || 5));
  const hours = Array.isArray(req.body.hours) && req.body.hours.length ? req.body.hours.map(Number) : DEFAULT_HOURS;

  // 모드별로 필요한 사람 정보를 미리 계산해둔다 — 여기서 실패하면 포인트 차감 전에 걸러야 한다.
  let yongshinMain = null;
  let personDayStem = null;
  let parentDayBranches = [];
  if (occasion.mode === 'person') {
    const personInput = parsePerson(req.body, '');
    if (!personInput) return res.status(400).json({ error: '본인 생년월일을 올바르게 입력해주세요.' });
    try {
      const personEngine = computeSaju(personInput);
      yongshinMain = personEngine.yongshin.final.main;
      personDayStem = personEngine.palja.dayPillar.stem;
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

        // 이사·개업·결혼마다 "좋은 기운"의 의미가 다르므로, 후보일이 본인에게 무슨
        // 십신인지 봐서 그 주제와 맞는지 별도로 가산·감산한다(주제별 해석의 핵심).
        const dayShipsinHanja = getShipsin(personDayStem, dayStem);
        const dayShipsinKo = dayShipsinHanja ? SHIPSIN_KO[dayShipsinHanja] : '비견';
        const shipsinGroup = SHIPSIN_GROUP[dayShipsinKo] || '비겁';
        const { bonus, phrase: occasionPhrase } = occasionShipsinInfo(occasionKey, shipsinGroup);

        score = Math.max(5, Math.min(95, Math.round(dayScore * 0.6 + hourScore * 0.4) + bonus));

        const dayPhrase = relationPhrase(dayOhaeng, yongshinMain);
        const hourPhrase = relationPhrase(hourOhaeng, yongshinMain);
        const detailText = dayOhaeng === hourOhaeng
          ? `날과 시 모두 ${OHAENG_KO[dayOhaeng] || dayOhaeng} 기운이에요. ${dayPhrase}.`
          : `날의 기운(${OHAENG_KO[dayOhaeng] || dayOhaeng})은 ${dayPhrase}. 시의 기운(${OHAENG_KO[hourOhaeng] || hourOhaeng})은 ${hourPhrase}.`;
        reasonText = `${verdictOf(score)} ${detailText}${occasionPhrase ? ' ' + occasionPhrase + '.' : ''}`;
      } else {
        score = balanceScoreOf(engineResult.counts.ohaeng);
        const clashesWithParent = parentDayBranches.some((pb) => isChung(dayBranch, pb));
        if (clashesWithParent) score -= 25;
        score = Math.max(5, Math.min(95, score));
        const lackingCount = engineResult.counts.lacking.length;
        const detailText = lackingCount === 0
          ? '오행 다섯 가지가 골고루 있어서 한쪽으로 치우치지 않는 사주예요.'
          : `사주에 ${engineResult.counts.lacking.map((k) => OHAENG_KO[k] || k).join('·')} 기운이 비어있어서 조금 치우친 사주예요.`;
        reasonText = `${verdictOf(score)} ${detailText}`;
        if (clashesWithParent) reasonText += ' 다만 부모님 사주와 부딪히는 부분이 있어요.';
      }

      candidates.push({
        year: y, month: m, day, hour,
        ganZhi, ganZhiKo, hourGanZhiKo, ohaeng: engineResult.counts.ohaeng, lacking: engineResult.counts.lacking,
        score, reasonText
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  res.json({ occasion: occasionKey, occasionLabel: occasion.label, candidates: candidates.slice(0, 8) });
});

module.exports = router;
