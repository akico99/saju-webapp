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
const { STEM_KO, BRANCH_KO, STEM_OHAENG, BRANCH_MAIN_STEM } = require('../../engine/constants');
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
  let parentDayBranches = [];
  if (occasion.mode === 'person') {
    const personInput = parsePerson(req.body, '');
    if (!personInput) return res.status(400).json({ error: '본인 생년월일을 올바르게 입력해주세요.' });
    try {
      const personEngine = computeSaju(personInput);
      yongshinMain = personEngine.yongshin.final.main;
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

      let score, reasonText;
      if (occasion.mode === 'person') {
        score = ganZhiOhaengScore(ganZhi, yongshinMain);
        const dayOhaeng = STEM_OHAENG[dayStem]?.ohaeng;
        score >= 65
          ? (reasonText = `이 날의 기운(${dayOhaeng})이 당신에게 필요한 기운과 잘 맞아서, ${occasion.label}에 힘을 보태주는 날이에요.`)
          : score <= 35
            ? (reasonText = `이 날의 기운(${dayOhaeng})이 당신에게 필요한 기운을 눌러버리는 편이라, ${occasion.label}엔 조금 조심하면 좋은 날이에요.`)
            : (reasonText = `이 날은 특별히 강하게 돕지도, 방해하지도 않는 무난한 날이에요.`);
      } else {
        score = balanceScoreOf(engineResult.counts.ohaeng);
        const clashesWithParent = parentDayBranches.some((pb) => isChung(dayBranch, pb));
        if (clashesWithParent) score -= 25;
        score = Math.max(5, Math.min(95, score));
        const lackingCount = engineResult.counts.lacking.length;
        reasonText = lackingCount === 0
          ? '오행 다섯 가지가 골고루 있어서 한쪽으로 치우치지 않는 사주예요.'
          : `사주에 ${engineResult.counts.lacking.join('·')} 기운이 비어있어서 조금 치우친 사주예요.`;
        if (clashesWithParent) reasonText += ' 다만 부모님 사주와 부딪히는 부분이 있어요.';
      }

      candidates.push({
        year: y, month: m, day, hour,
        ganZhi, ganZhiKo, ohaeng: engineResult.counts.ohaeng, lacking: engineResult.counts.lacking,
        score, reasonText
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  res.json({ occasion: occasionKey, occasionLabel: occasion.label, candidates: candidates.slice(0, 8) });
});

module.exports = router;
