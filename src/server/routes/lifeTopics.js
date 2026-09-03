'use strict';
/* 궁합운·재물운·건강운 — "궁금한 사주, 골라보기"를 대체하는 3개의 개인화 리포트 상품.
   이사·개업·결혼과 똑같은 원칙을 따른다: 엔진이 실제로 아는 사실(오행·십성·용신·날짜)만
   근거로 삼고, 고정 매핑표(오행→색/맛/자연물/방향/운동/장소/장부)로 "근거 있는 구체성"을
   만든다. 리포트는 PDF로 저장되어 마이페이지 "다시보기"에도 뜬다(orders 테이블 재사용).

   - 궁합운: 상대방 있으면 두 일간의 자연물 상성 + 실제 궁합 계산, 솔로면 현재 대운의
     십성으로 인연 성향을 본다. "관계 진전 길일"은 앞으로 몇 달 안에서 식상/재관성이
     힘을 받는 날을 찾는 월 단위 스캔(이사/개업과 같은 방식, 그룹만 다름).
   - 재물운: 정재/편재 개수로 재물 그릇 유형을, 재성/비겁 그룹 스캔으로 길일/흉일을 찾는다.
   - 건강운: 태과/불급 오행으로 취약 장부를, 식상/인성 그룹 스캔으로 습관 시작 길일을 찾는다. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeSaju } = require('../../engine/index');
const { relationScore } = require('../../pdf/charts');
const {
  STEM_KO, BRANCH_KO, STEM_OHAENG, BRANCH_MAIN_STEM, PRODUCES, CONTROLS,
  getShipsin, SHIPSIN_KO, SHIPSIN_GROUP
} = require('../../engine/constants');
const { classifyPair, analyzeCompatibility } = require('../../engine/compatibility');
const { bananSalBranch, BRANCH_DIRECTION_KO } = require('../../engine/shinsal');
const { generateLifeTopicReport } = require('../../llm/lifeTopicsReading');
const { costUsd } = require('../../llm/client');
const { renderDateSelectHtml } = require('../../pdf/renderDateSelectHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const orders = require('../../db/orders');
const points = require('../../db/points');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const OUTPUT_ROOT = path.join(__dirname, '..', '..', '..', 'output');
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const HOUR_BRANCH_LABEL = [
  [23, 1, '자시(밤 11시~새벽 1시)'], [1, 3, '축시(새벽 1~3시)'], [3, 5, '인시(새벽 3~5시)'],
  [5, 7, '묘시(아침 5~7시)'], [7, 9, '진시(아침 7~9시)'], [9, 11, '사시(오전 9~11시)'],
  [11, 13, '오시(낮 11시~오후 1시)'], [13, 15, '미시(오후 1~3시)'], [15, 17, '신시(오후 3~5시)'],
  [17, 19, '유시(오후 5~7시)'], [19, 21, '술시(저녁 7~9시)'], [21, 23, '해시(밤 9~11시)']
];
function hourLabel(hour) {
  const found = HOUR_BRANCH_LABEL.find(([a, b]) => (a < b ? hour >= a && hour < b : hour >= a || hour < b));
  return found ? found[2] : `${hour}시`;
}

const TOPICS = {
  compat: { label: '궁합운', productKey: 'life_topic_compat' },
  wealth: { label: '재물운', productKey: 'life_topic_wealth' },
  health: { label: '건강운', productKey: 'life_topic_health' }
};

const OHAENG_KO = { '木': '나무', '火': '불', '土': '흙', '金': '쇠', '水': '물' };
const OHAENG_COLOR = { '木': '청록색', '火': '빨강', '土': '노랑이나 황토색', '金': '흰색', '水': '검정이나 남색' };
const OHAENG_TASTE = { '木': '신맛', '火': '쓴맛', '土': '단맛', '金': '매운맛', '水': '짠맛' };
const OHAENG_ORGAN = {
  '木': '간과 담(쓸개)', '火': '심장과 소장', '土': '비장과 위',
  '金': '폐와 대장', '水': '신장과 방광'
};
const OHAENG_SYMPTOM = {
  '木': '근육이 뻣뻣해지거나 눈이 쉽게 피로해지는 편', '火': '심장이 두근거리거나 체온·혈액순환 조절이 흔들리는 편',
  '土': '소화가 더디거나 생각이 많아 위가 쉽게 상하는 편', '金': '호흡기가 예민하거나 피부·대장이 약해지는 편',
  '水': '몸이 쉽게 붓거나 허리·무릎이 시큰거리는 편'
};
const OHAENG_EXERCISE = {
  '木': '스트레칭이나 요가처럼 몸을 늘려주는 운동', '火': '땀을 시원하게 빼는 유산소 운동이나 춤',
  '土': '걷기나 등산처럼 꾸준히 지속하는 운동', '金': '웨이트 트레이닝처럼 근력을 다지는 운동',
  '水': '수영이나 물속 운동처럼 유연하게 흐르는 운동'
};
const OHAENG_NATURE = {
  '木': '장작(혹은 곧게 뻗은 나무)', '火': '타오르는 불꽃', '土': '든든한 큰 산',
  '金': '잘 벼려진 칼(혹은 보석)', '水': '흐르는 계곡물(혹은 넓은 바다)'
};
const OHAENG_DATE_SPOT = {
  '木': '수목원이나 식물원처럼 초록이 많은 공간', '火': '조명이 예쁘고 활기찬 팝업스토어나 공연장',
  '土': '오래된 골목의 조용하고 편안한 카페', '金': '화려하고 세련된 도심의 전망 좋은 곳',
  '水': '강이나 바다가 보이는, 탁 트인 공간'
};
function relationPhrase(ohaeng, yongshinMain) {
  if (!ohaeng || !yongshinMain) return '기운이 뚜렷하지 않은 편이에요';
  if (ohaeng === yongshinMain) return '당신에게 꼭 필요한 기운이 가득해요';
  if (PRODUCES[ohaeng] === yongshinMain) return '당신에게 필요한 기운을 든든하게 채워줘요';
  if (CONTROLS[ohaeng] === yongshinMain) return '당신에게 필요한 기운을 약하게 만들어요';
  if (CONTROLS[yongshinMain] === ohaeng) return '당신이 가볍게 이겨낼 수 있는 기운이라 크게 부담되지 않아요';
  if (PRODUCES[yongshinMain] === ohaeng) return '당신의 기운을 살짝 나눠 쓰게 만들어서 약간 힘이 빠질 수 있어요';
  return '특별히 좋지도 나쁘지도 않은 무난한 기운이에요';
}
function ganZhiOhaengScore(ganZhi, yongshinMain) {
  if (!ganZhi || !yongshinMain) return 50;
  const stemOhaeng = STEM_OHAENG[ganZhi[0]]?.ohaeng;
  const branchMainStem = BRANCH_MAIN_STEM[ganZhi[1]];
  const branchOhaeng = branchMainStem ? STEM_OHAENG[branchMainStem]?.ohaeng : null;
  const raw = Math.round(relationScore(stemOhaeng, yongshinMain) * 0.5 + relationScore(branchOhaeng, yongshinMain) * 0.5);
  return Math.max(5, Math.min(95, raw));
}
function dayBranchRelationInfo(personDayBranch, candidateDayBranch) {
  const rel = classifyPair(personDayBranch, candidateDayBranch);
  if (!rel) return { bonus: 0, phrase: '' };
  if (rel.type === 'yukhap') return { bonus: 6, phrase: '이 날은 태어난 날과도 잘 어울려서 흐름이 조화로워요.' };
  if (rel.type === 'samhap') return { bonus: 4, phrase: '이 날은 태어난 날과 기운이 잘 통해요.' };
  if (rel.type === 'chung') return { bonus: -10, phrase: '다만 이 날은 태어난 날과 살짝 부딪히는 기운이 있어요.' };
  return { bonus: 0, phrase: '' };
}

// 주제별로 "좋은 십성 그룹"이 다르다 — 그 그룹에 속하는 후보일이 좋은 날이다.
const TOPIC_GROUP_ORDER = {
  compat: ['식상', '관성', '재성', '인성', '비겁'],  // 매력 표현(식상) + 인연(재/관성) 우선
  wealth_good: ['재성', '식상', '인성', '관성', '비겁'], // 투자/계약 길일
  wealth_bad: ['비겁'],                                  // 겁재운(지출 주의)
  health: ['식상', '인성', '재성', '관성', '비겁']       // 새 습관 시작 길일
};
function shipsinGroupOf(personDayStem, dayStem) {
  const hanja = getShipsin(personDayStem, dayStem);
  const ko = hanja ? SHIPSIN_KO[hanja] : '비견';
  return SHIPSIN_GROUP[ko] || '비겁';
}
function groupScore(group, order) {
  const idx = order.indexOf(group);
  const tiers = [90, 72, 55, 38, 20];
  return idx >= 0 ? tiers[idx] : 55;
}

function scorePersonCandidate({ engineResult, groupOrder, yongshinMain, personDayStem, personDayBranch, includeHour }) {
  const dayStem = engineResult.palja.dayPillar.stem, dayBranch = engineResult.palja.dayPillar.branch;
  const ganZhi = dayStem + dayBranch;
  const ganZhiKo = (STEM_KO[dayStem] || '') + (BRANCH_KO[dayBranch] || '');
  const dayScore = ganZhiOhaengScore(ganZhi, yongshinMain);

  let hourGanZhiKo = null, baseScore = dayScore;
  if (includeHour) {
    const hourStem = engineResult.palja.hourPillar.stem, hourBranch = engineResult.palja.hourPillar.branch;
    hourGanZhiKo = (STEM_KO[hourStem] || '') + (BRANCH_KO[hourBranch] || '');
    const hourScore = ganZhiOhaengScore(hourStem + hourBranch, yongshinMain);
    baseScore = Math.round(dayScore * 0.6 + hourScore * 0.4);
  }

  const group = shipsinGroupOf(personDayStem, dayStem);
  const gScore = groupScore(group, groupOrder);
  const { bonus: branchBonus } = dayBranchRelationInfo(personDayBranch, dayBranch);
  const score = Math.max(5, Math.min(95, Math.round(baseScore * 0.5 + gScore * 0.5) + branchBonus));

  return { score, ganZhiKo, hourGanZhiKo };
}

function daysInRangeMonths(startYear, startMonth, months) {
  const list = [];
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const end = new Date(cursor);
  end.setUTCMonth(end.getUTCMonth() + months);
  while (cursor < end) {
    list.push({ year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate() });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return list;
}

// 향후 months개월 안에서 groupOrder 기준 가장 좋은(또는 order 반영해 가장 나쁜) 날짜 하나를 찾는다.
const DEFAULT_HOURS = [9, 10, 11, 13, 14, 15, 16];
function findBestDate({ groupOrder, yongshinMain, personDayStem, personDayBranch, months = 2, worst = false }) {
  const now = new Date();
  const dayList = daysInRangeMonths(now.getUTCFullYear(), now.getUTCMonth() + 1, months);
  const scored = dayList.map(({ year, month, day }) => {
    try {
      const engineResult = computeSaju({ year, month, day, hour: 12, minute: 0 });
      const r = scorePersonCandidate({ engineResult, groupOrder, yongshinMain, personDayStem, personDayBranch, includeHour: false });
      return { year, month, day, score: r.score };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
  scored.sort((a, b) => worst ? a.score - b.score : b.score - a.score);
  const bestDay = scored[0];
  if (!bestDay) return null;

  const hourCandidates = DEFAULT_HOURS.map((hour) => {
    try {
      const engineResult = computeSaju({ year: bestDay.year, month: bestDay.month, day: bestDay.day, hour, minute: 0 });
      return { hour, ...scorePersonCandidate({ engineResult, groupOrder, yongshinMain, personDayStem, personDayBranch, includeHour: true }) };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
  hourCandidates.sort((a, b) => worst ? a.score - b.score : b.score - a.score);
  const best = hourCandidates[0];
  if (!best) return { ...bestDay, hourLabelText: null };

  return {
    year: bestDay.year, month: bestDay.month, day: bestDay.day, hour: best.hour,
    ganZhiKo: best.ganZhiKo, hourGanZhiKo: best.hourGanZhiKo, score: best.score,
    hourLabelText: hourLabel(best.hour)
  };
}

function formatDateValue(d) {
  if (!d) return null;
  const dt = new Date(d.year, d.month - 1, d.day);
  const weekday = WEEKDAY_KO[dt.getDay()];
  return `${d.year}.${String(d.month).padStart(2, '0')}.${String(d.day).padStart(2, '0')} (${weekday}) ${d.hour}시`;
}

function sanitizeText(s, maxLen) {
  return String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function parsePerson(body, prefix) {
  const f = (suffix) => (prefix ? prefix + suffix : suffix.charAt(0).toLowerCase() + suffix.slice(1));
  const y = Number(body[f('Year')]), m = Number(body[f('Month')]), d = Number(body[f('Day')]);
  if (!y || !m || !d || y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const hourGiven = body[f('HourUnknown')] !== 'true' && body[f('HourUnknown')] !== true;
  const hour = hourGiven && body[f('Hour')] !== '' && body[f('Hour')] != null ? Number(body[f('Hour')]) : null;
  const minute = hourGiven && body[f('Minute')] !== '' && body[f('Minute')] != null ? Number(body[f('Minute')]) : 0;
  const gender = body[f('Gender')] === '여' || body[f('Gender')] === '남' ? body[f('Gender')] : null;
  const isLunar = body[f('Calendar')] === '음력';
  const isLeap = !!body[f('IsLeap')];
  const name = sanitizeText(body[f('Name')], 20);
  return { year: y, month: m, day: d, hour, minute, gender, isLunar, isLeap, name };
}

function computePersonBasics(body, prefix) {
  const personInput = parsePerson(body, prefix);
  if (!personInput) return { error: '생년월일을 올바르게 입력해주세요.' };
  try {
    const engine = computeSaju(personInput);
    const dayStem = engine.palja.dayPillar.stem, dayBranch = engine.palja.dayPillar.branch;
    return {
      engine,
      yongshinMain: engine.yongshin.final.main,
      personDayStem: dayStem, personDayBranch: dayBranch,
      personGanZhiKo: (STEM_KO[dayStem] || '') + (BRANCH_KO[dayBranch] || ''),
      personGender: personInput.gender, personName: personInput.name,
      yearBranch: engine.palja.yearPillar.branch
    };
  } catch (e) {
    return { error: '명식 계산 실패: ' + e.message };
  }
}

function currentDaewoon(engine) {
  const thisYear = new Date().getFullYear();
  let current = engine.daewoon[0];
  for (const d of engine.daewoon) {
    if (d.startYear <= thisYear) current = d; else break;
  }
  return current;
}

async function savePdfAndOrder({ userId, productKey, label, name, title, eyebrow, metaLine, bestLabel, bestValue, text, usage }) {
  if (!text) return null;
  const jobId = crypto.randomUUID();
  orders.createOrder({ userId, productKey, label: `${label}${name ? ' — ' + name : ''}`, jobId });
  try {
    const html = renderDateSelectHtml({ title, eyebrow, metaLine, bestLabel, bestValue, text });
    const jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    const pdfPath = path.join(jobDir, 'life-topic-report.pdf');
    await renderPdf(html, pdfPath, { name, label });
    orders.markDone(jobId, { resultPath: pdfPath, llmCostUsd: costUsd(usage) });
    return jobId;
  } catch (e) {
    orders.markError(jobId, e.message || String(e));
    return null;
  }
}

router.get('/life-topics/topics', (req, res) => res.json({ topics: TOPICS }));

router.post('/life-topics', requireAuth, async (req, res) => {
  const topicKey = req.body.topic;
  const topic = TOPICS[topicKey];
  if (!topic) return res.status(400).json({ error: '알 수 없는 주제입니다.' });

  if (topicKey === 'compat') return runCompat(req, res, topic);
  if (topicKey === 'wealth') return runWealth(req, res, topic);
  return runHealth(req, res, topic);
});

// ── 궁합운 ──────────────────────────────────────────────────────────────
async function runCompat(req, res, topic) {
  const status = req.body.relationshipStatus; // solo|seeing|dating|breaking
  if (!['solo', 'seeing', 'dating', 'breaking'].includes(status)) {
    return res.status(400).json({ error: '현재 관계 상태를 선택해주세요.' });
  }
  const basics = computePersonBasics(req.body, '');
  if (basics.error) return res.status(400).json({ error: basics.error });

  const isSolo = status === 'solo';
  let spouseBasics = null;
  if (!isSolo) {
    spouseBasics = computePersonBasics(req.body, 'p');
    if (spouseBasics.error) return res.status(400).json({ error: '상대방 정보: ' + spouseBasics.error });
  }

  try {
    points.chargeForProduct(req.session.userId, topic.productKey);
  } catch (e) {
    if (e.code === 'insufficient_points') return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    return res.status(400).json({ error: e.message });
  }

  const yongshinKo = OHAENG_KO[basics.yongshinMain] || basics.yongshinMain;
  const dayOhaeng = STEM_OHAENG[basics.personDayStem]?.ohaeng;

  let compat = null, spouseNature = null, spouseYongshinKo = null;
  let elementRelation = null;
  if (!isSolo) {
    compat = analyzeCompatibility(basics.engine, spouseBasics.engine);
    const spouseOhaeng = STEM_OHAENG[spouseBasics.personDayStem]?.ohaeng;
    spouseNature = OHAENG_NATURE[spouseOhaeng];
    spouseYongshinKo = OHAENG_KO[spouseBasics.yongshinMain] || spouseBasics.yongshinMain;
    if (dayOhaeng === spouseOhaeng) elementRelation = '같은 기운이라 서로를 잘 이해하는';
    else if (PRODUCES[dayOhaeng] === spouseOhaeng) elementRelation = '내가 상대를 북돋아주는';
    else if (PRODUCES[spouseOhaeng] === dayOhaeng) elementRelation = '상대가 나를 북돋아주는';
    else if (CONTROLS[dayOhaeng] === spouseOhaeng) elementRelation = '내가 상대를 다잡아주는';
    else elementRelation = '상대가 나를 다잡아주는';
  }

  let soloDaewoonGroup = null;
  if (isSolo) {
    const dw = currentDaewoon(basics.engine);
    if (dw) soloDaewoonGroup = shipsinGroupOf(basics.personDayStem, dw.stem);
  }

  const best = findBestDate({
    groupOrder: TOPIC_GROUP_ORDER.compat, yongshinMain: basics.yongshinMain,
    personDayStem: basics.personDayStem, personDayBranch: basics.personDayBranch, months: 2
  });

  const compatResult = await safeReport(() => generateLifeTopicReport({
    topic: 'compat',
    name: basics.personName, gender: basics.personGender, personGanZhiKo: basics.personGanZhiKo,
    dayNature: OHAENG_NATURE[dayOhaeng], yongshinOhaengKo: yongshinKo,
    status, spouseName: spouseBasics?.personName, spouseNature, spouseYongshinOhaengKo: spouseYongshinKo,
    elementRelation, compat: compat ? { score: compat.score, yukhapCount: compat.crossYukhap.length, chungCount: compat.crossChung.length, dayRelationType: compat.dayRelation?.type || null } : null,
    soloDaewoonGroup,
    best: best ? { ...best, dateValue: formatDateValue(best) } : null,
    dateColor: OHAENG_COLOR[basics.yongshinMain], dateSpot: OHAENG_DATE_SPOT[basics.yongshinMain]
  }));
  const report = compatResult ? compatResult.text : null;

  const displayName = isSolo ? basics.personName : [basics.personName, spouseBasics?.personName].filter(Boolean).join(' · ');
  const jobId = await savePdfAndOrder({
    userId: req.session.userId, productKey: topic.productKey, label: `${topic.label} 리포트`,
    name: displayName,
    title: `${displayName || '고객'} 님의 ${topic.label} 리포트`,
    eyebrow: `命 式 關 係 圖 · ${topic.label} 리포트`,
    metaLine: isSolo ? '현재 상태: 솔로' : `현재 상태: ${{ seeing: '썸', dating: '연애 중', breaking: '이별 중' }[status]}`,
    bestLabel: '관계 진전에 좋은 때', bestValue: best ? formatDateValue(best) : null,
    text: report, usage: compatResult ? compatResult.usage : null
  });

  res.json({ topic: 'compat', topicLabel: topic.label, name: basics.personName, spouseName: spouseBasics?.personName || null, report, jobId, best: best ? { ...best, dateValue: formatDateValue(best) } : null, compatScore: compat?.score || null });
}

// ── 재물운 ──────────────────────────────────────────────────────────────
async function runWealth(req, res, topic) {
  const income = sanitizeText(req.body.incomeSource, 20);
  const interest = sanitizeText(req.body.interestArea, 20);
  const basics = computePersonBasics(req.body, '');
  if (basics.error) return res.status(400).json({ error: basics.error });

  try {
    points.chargeForProduct(req.session.userId, topic.productKey);
  } catch (e) {
    if (e.code === 'insufficient_points') return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    return res.status(400).json({ error: e.message });
  }

  const jeongjae = basics.engine.counts.shipsinDetail['정재'] || 0;
  const pyeonjae = basics.engine.counts.shipsinDetail['편재'] || 0;
  const bigyeopGrade = basics.engine.counts.shipsinGroupGrade['비겁'];
  const siksangGrade = basics.engine.counts.shipsinGroupGrade['식상'];
  const yongshinKo = OHAENG_KO[basics.yongshinMain] || basics.yongshinMain;

  const goodDay = findBestDate({ groupOrder: TOPIC_GROUP_ORDER.wealth_good, yongshinMain: basics.yongshinMain, personDayStem: basics.personDayStem, personDayBranch: basics.personDayBranch, months: 2 });
  const badDay = findBestDate({ groupOrder: TOPIC_GROUP_ORDER.wealth_bad, yongshinMain: basics.yongshinMain, personDayStem: basics.personDayStem, personDayBranch: basics.personDayBranch, months: 2, worst: false });

  const banansal = bananSalBranch(basics.yearBranch);
  const direction = banansal ? BRANCH_DIRECTION_KO[banansal] : null;

  const wealthResult = await safeReport(() => generateLifeTopicReport({
    topic: 'wealth',
    name: basics.personName, gender: basics.personGender, personGanZhiKo: basics.personGanZhiKo,
    yongshinOhaengKo: yongshinKo, incomeSource: income, interestArea: interest,
    jeongjae, pyeonjae, bigyeopGrade, siksangGrade,
    goodDay: goodDay ? { ...goodDay, dateValue: formatDateValue(goodDay) } : null,
    badDay: badDay ? { ...badDay, dateValue: formatDateValue(badDay) } : null,
    walletColor: OHAENG_COLOR[basics.yongshinMain], direction
  }));
  const report = wealthResult ? wealthResult.text : null;

  const jobId = await savePdfAndOrder({
    userId: req.session.userId, productKey: topic.productKey, label: `${topic.label} 리포트`,
    name: basics.personName,
    title: `${basics.personName || '고객'} 님의 ${topic.label} 리포트`,
    eyebrow: `命 式 關 係 圖 · ${topic.label} 리포트`,
    metaLine: `주수입원 <b>${income || '미입력'}</b> · 관심 분야 <b>${interest || '미입력'}</b>`,
    bestLabel: '투자·계약에 좋은 때', bestValue: goodDay ? formatDateValue(goodDay) : null,
    text: report, usage: wealthResult ? wealthResult.usage : null
  });

  res.json({ topic: 'wealth', topicLabel: topic.label, name: basics.personName, report, jobId, best: goodDay ? { ...goodDay, dateValue: formatDateValue(goodDay) } : null });
}

// ── 건강운 ──────────────────────────────────────────────────────────────
async function runHealth(req, res, topic) {
  const concern = sanitizeText(req.body.concern, 20);
  const basics = computePersonBasics(req.body, '');
  if (basics.error) return res.status(400).json({ error: basics.error });

  try {
    points.chargeForProduct(req.session.userId, topic.productKey);
  } catch (e) {
    if (e.code === 'insufficient_points') return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    return res.status(400).json({ error: e.message });
  }

  const grades = basics.engine.counts.ohaengGrade;
  const overOhaeng = Object.keys(grades).find((k) => grades[k] === '과다');
  const underOhaeng = basics.engine.counts.lacking[0] || Object.keys(grades).find((k) => grades[k] === '약함');
  const weakOhaeng = underOhaeng || overOhaeng;
  const yongshinKo = OHAENG_KO[basics.yongshinMain] || basics.yongshinMain;

  const goodDay = findBestDate({ groupOrder: TOPIC_GROUP_ORDER.health, yongshinMain: basics.yongshinMain, personDayStem: basics.personDayStem, personDayBranch: basics.personDayBranch, months: 2 });

  const banansal = bananSalBranch(basics.yearBranch);
  const direction = banansal ? BRANCH_DIRECTION_KO[banansal] : null;

  const healthResult = await safeReport(() => generateLifeTopicReport({
    topic: 'health',
    name: basics.personName, gender: basics.personGender, personGanZhiKo: basics.personGanZhiKo,
    yongshinOhaengKo: yongshinKo, concern,
    weakOhaengKo: OHAENG_KO[weakOhaeng] || null, organ: OHAENG_ORGAN[weakOhaeng] || null, symptom: OHAENG_SYMPTOM[weakOhaeng] || null,
    exercise: OHAENG_EXERCISE[basics.yongshinMain], taste: OHAENG_TASTE[basics.yongshinMain],
    goodDay: goodDay ? { ...goodDay, dateValue: formatDateValue(goodDay) } : null,
    pillowDirection: direction, colorTone: OHAENG_COLOR[basics.yongshinMain]
  }));
  const report = healthResult ? healthResult.text : null;

  const jobId = await savePdfAndOrder({
    userId: req.session.userId, productKey: topic.productKey, label: `${topic.label} 리포트`,
    name: basics.personName,
    title: `${basics.personName || '고객'} 님의 ${topic.label} 리포트`,
    eyebrow: `命 式 關 係 圖 · ${topic.label} 리포트`,
    metaLine: `요즘 고민 <b>${concern || '미입력'}</b>`,
    bestLabel: '새 건강 습관 시작하기 좋은 때', bestValue: goodDay ? formatDateValue(goodDay) : null,
    text: report, usage: healthResult ? healthResult.usage : null
  });

  res.json({ topic: 'health', topicLabel: topic.label, name: basics.personName, report, jobId, best: goodDay ? { ...goodDay, dateValue: formatDateValue(goodDay) } : null });
}

async function safeReport(fn) {
  try {
    return await fn();
  } catch (e) {
    return null;
  }
}

module.exports = router;
