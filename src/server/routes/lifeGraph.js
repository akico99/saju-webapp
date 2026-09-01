'use strict';
/* 인생 그래프용 무료 프리뷰 — LLM/PDF 없이 엔진 계산만 돌리므로 포인트 차감 없음.
   100p 리포트의 "대운 흐름" 차트(src/pdf/charts.js)와 완전히 같은 점수 계산(relationScore)을
   그대로 재사용한다 — 대운(10년) 단위는 charts.js의 computeDaewoonScores 그대로, 세운(1년)
   단위는 같은 relationScore 공식을 대운 안의 개별 연도(years)에 적용해서 만든다. */
const express = require('express');
const { computeSaju } = require('../../engine/index');
const { computeDaewoonScores, relationScore } = require('../../pdf/charts');
const { STEM_OHAENG, BRANCH_MAIN_STEM, STEM_KO, BRANCH_KO } = require('../../engine/constants');

const router = express.Router();

function parseBody(body) {
  const year = Number(body.year), month = Number(body.month), day = Number(body.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');
  const hourGiven = body.hourUnknown !== 'true' && body.hourUnknown !== true;
  const hour = hourGiven && body.hour !== '' && body.hour != null ? Number(body.hour) : null;
  const minute = hourGiven && body.minute !== '' && body.minute != null ? Number(body.minute) : 0;
  const gender = body.gender === '여' || body.gender === '남' ? body.gender : null;
  const isLunar = body.calendar === '음력';
  const isLeap = !!body.isLeap;
  const city = body.city || null;
  return { year, month, day, hour, minute, gender, isLunar, isLeap, city };
}

function ganZhiKo(ganZhi) {
  if (!ganZhi || ganZhi.length < 2) return '';
  return (STEM_KO[ganZhi[0]] || '') + (BRANCH_KO[ganZhi[1]] || '');
}

// 바 차트 레이스용 — 타고난 사주(자연 8글자) 오행 개수에, 그 시기(대운/세운) 간지 2글자의
// 오행을 더한 스냅샷. 인생 그래프(용신 기준 점수)와는 다른 관점이라 별도로 계산한다.
function ohaengOf(ganZhi, base) {
  const frame = { ...base };
  if (!ganZhi) return frame;
  const stemO = STEM_OHAENG[ganZhi[0]]?.ohaeng;
  const branchMain = BRANCH_MAIN_STEM[ganZhi[1]];
  const branchO = branchMain ? STEM_OHAENG[branchMain]?.ohaeng : null;
  if (stemO) frame[stemO] = (frame[stemO] || 0) + 1;
  if (branchO) frame[branchO] = (frame[branchO] || 0) + 1;
  return frame;
}

function scoreOf(ganZhi, yongshinMain) {
  if (!ganZhi) return 50;
  const stemOhaeng = STEM_OHAENG[ganZhi[0]]?.ohaeng;
  const branchMainStem = BRANCH_MAIN_STEM[ganZhi[1]];
  const branchOhaeng = branchMainStem ? STEM_OHAENG[branchMainStem]?.ohaeng : null;
  const raw = Math.round(relationScore(stemOhaeng, yongshinMain) * 0.5 + relationScore(branchOhaeng, yongshinMain) * 0.5);
  return Math.max(5, Math.min(95, raw));
}

router.post('/life-graph', (req, res) => {
  let input;
  try {
    input = parseBody(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let engineResult;
  try {
    engineResult = computeSaju(input);
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }

  const yongshinMain = engineResult.yongshin.final.main;

  const natalOhaeng = engineResult.counts.ohaeng;

  const decadePoints = computeDaewoonScores(engineResult.daewoon, yongshinMain)
    .map((p) => ({ ...p, ganZhiKo: ganZhiKo(p.ganZhi), ohaeng: ohaengOf(p.ganZhi, natalOhaeng) }));

  const yearPoints = engineResult.daewoon
    .flatMap((d) => d.years)
    .filter((y) => y.ganZhi)
    .map((y) => ({
      age: y.age, year: y.year, ganZhi: y.ganZhi, ganZhiKo: ganZhiKo(y.ganZhi),
      score: scoreOf(y.ganZhi, yongshinMain), ohaeng: ohaengOf(y.ganZhi, natalOhaeng)
    }));

  const currentAge = new Date().getFullYear() - input.year + 1; // 한국식 나이

  res.json({
    ilgan: engineResult.ilgan,
    yongshinMain,
    currentAge,
    decadePoints,
    yearPoints
  });
});

module.exports = router;
