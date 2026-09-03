'use strict';
/* PDF 100페이지를 열기 전에 먼저 보내는 "3초 요약 카드" 데이터 빌더.
   점수(현재 시기 대운 점수) + 키워드 3개 + 미니 라인차트로 구성 —
   당근마켓/카톡으로 결과물을 미리 보여줘 구매 결정을 돕는 용도. */

const { computeDaewoonScores } = require('./charts');

// interpretation.md §1 "일간 10종" 표와 동일한 소스 — 물상·핵심기질 키워드
const STEM_KEYWORD = {
  '甲': {물상: '큰 나무', 기질: '곧고 진취적' },
  '乙': {물상: '화초·덩굴', 기질: '유연하고 현실적' },
  '丙': {물상: '태양', 기질: '밝고 화통함' },
  '丁': {물상: '촛불·등불', 기질: '섬세하고 헌신적' },
  '戊': {물상: '산·대지', 기질: '듬직하고 포용력 있음' },
  '己': {물상: '논밭·정원', 기질: '실속 있고 섬세함' },
  '庚': {물상: '원석·도끼', 기질: '강직하고 결단력 있음' },
  '辛': {물상: '보석·칼', 기질: '예리하고 세련됨' },
  '壬': {물상: '바다·강', 기질: '그릇이 크고 지혜로움' },
  '癸': {물상: '비·이슬', 기질: '총명하고 섬세함' }
};

function findCurrentAgeScore(daewoonScores, birthYear) {
  const nowYear = new Date().getFullYear();
  const currentAge = nowYear - birthYear; // 만 나이 기준
  let current = null;
  for (let i = 0; i < daewoonScores.length; i++) {
    const seg = daewoonScores[i];
    const next = daewoonScores[i + 1];
    if (currentAge >= seg.age && (!next || currentAge < next.age)) { current = seg; break; }
  }
  if (!current) current = daewoonScores[0];
  return { ...current, ageRangeEnd: current.age + 9 };
}

/**
 * @param {Object} engine computeSaju() 결과
 * @param {{name?:string}} person
 */
function buildSummaryCardData(engine, person) {
  const daewoonScores = computeDaewoonScores(engine.daewoon, engine.yongshin.final.main);
  const birthYear = engine.meta.input.year;
  const currentSeg = findCurrentAgeScore(daewoonScores, birthYear);
  const avgScore = Math.round(daewoonScores.reduce((s, d) => s + d.score, 0) / daewoonScores.length);

  const stemInfo = STEM_KEYWORD[engine.ilgan.char] || { 물상: engine.ilgan.ko, 기질: '' };

  const keywords = [
    `${engine.ilgan.char}(${engine.ilgan.ko}) · ${stemInfo.물상}`,
    engine.kyukguk.name,
    `용신 ${engine.yongshin.final.main}`
  ];

  return {
    name: person.name,
    score: currentSeg.score,
    scoreAge: currentSeg.age,
    scoreAgeRangeEnd: currentSeg.ageRangeEnd,
    scoreYear: currentSeg.year,
    avgScore,
    keywords,
    tagline: stemInfo.기질,
    daewoonScores
  };
}

module.exports = { buildSummaryCardData };
