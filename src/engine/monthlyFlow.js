'use strict';
/* 월별·연도별 흐름 점수 — 3,900원 리딩의 "앞으로 12개월", 궁합의 "두 사람의 앞으로 3년",
   신년운세의 "1~12월"이 같은 계산을 쓴다.

   점수 = 용신 점수(인생 그래프와 같은 기준) 60% + 주제 점수 40%.
   주제 점수는 그 달(해) 간지의 십신이 주제에 유리한 묶음인지로 정한다 — 예를 들어 재물운이면
   재성·식상이 들어오는 달이 높다. 그래서 같은 사람이라도 재물운과 애정운의 월별 그래프가
   달라지고, 무료 인생 그래프에는 없는 "유료 리딩 전용" 숫자가 된다.

   월은 절기 기준이다(양력 15일 정오의 월주). 1월 중순은 아직 전년도 축월(丑月)이다. */
const { computeSaju } = require('./index');
const { STEM_OHAENG, BRANCH_MAIN_STEM, STEM_KO, BRANCH_KO, getShipsin, SHIPSIN_KO, SHIPSIN_GROUP } = require('./constants');
const { relationScore } = require('../pdf/charts');

// 주제별 유리(+)·불리(-) 십신 묶음. 없는 묶음은 중립.
const TOPIC_GROUPS = {
  wealth: { plus: ['재성', '식상'], minus: ['비겁'] },
  career: { plus: ['관성', '인성', '식상'], minus: [] },
  relationship: { plus: ['인성', '비겁'], minus: ['관성'] },
  intro: { plus: [], minus: [] },
  health: { plus: [], minus: [] },
  newyear: { plus: [], minus: [] }
};
function loveGroups(gender) {
  return { plus: [gender === '남' ? '재성' : '관성', '식상'], minus: [] };
}

function clamp(v) { return Math.max(5, Math.min(95, Math.round(v))); }
const ko = (gz) => (gz && gz.length >= 2 ? (STEM_KO[gz[0]] || '') + (BRANCH_KO[gz[1]] || '') : '');

function yongshinScore(ganZhi, yongshinMain) {
  const stemO = STEM_OHAENG[ganZhi[0]] && STEM_OHAENG[ganZhi[0]].ohaeng;
  const bm = BRANCH_MAIN_STEM[ganZhi[1]];
  const branchO = bm && STEM_OHAENG[bm] && STEM_OHAENG[bm].ohaeng;
  return clamp(relationScore(stemO, yongshinMain) * 0.5 + relationScore(branchO, yongshinMain) * 0.5);
}

function groupOf(dayStem, stem) {
  const h = stem ? getShipsin(dayStem, stem) : null;
  const k = h ? SHIPSIN_KO[h] : null;
  return { shipsin: k, group: k ? SHIPSIN_GROUP[k] : null };
}

/** 한 간지의 점수와 근거. topic은 TOPIC_GROUPS 키 또는 'love'. */
function scoreGanZhi(engine, ganZhi, topic, gender) {
  const yongshinMain = engine.yongshin.final.main;
  const dayStem = engine.palja.dayPillar.stem;
  const base = yongshinScore(ganZhi, yongshinMain);
  const s = groupOf(dayStem, ganZhi[0]);
  const b = groupOf(dayStem, BRANCH_MAIN_STEM[ganZhi[1]]);
  const g = topic === 'love' ? loveGroups(gender) : (TOPIC_GROUPS[topic] || TOPIC_GROUPS.intro);
  const one = (x) => (!x.group ? 55 : g.plus.includes(x.group) ? 85 : g.minus.includes(x.group) ? 30 : 55);
  const hasTopic = g.plus.length || g.minus.length;
  const topicScore = (one(s) + one(b)) / 2;
  const score = hasTopic ? clamp(base * 0.6 + topicScore * 0.4) : base;
  return { ganZhi, ganZhiKo: ko(ganZhi), score, base, stemShipsin: s.shipsin, branchShipsin: b.shipsin, stemGroup: s.group, branchGroup: b.group };
}

/** from(연·월)부터 count개월. 반환: [{year, month, ganZhi, ganZhiKo, score, ...}] */
function monthlyFlow(engine, { fromYear, fromMonth, count = 12, topic = 'intro', gender = null }) {
  const out = [];
  let y = fromYear, m = fromMonth;
  for (let i = 0; i < count; i++) {
    const e = computeSaju({ year: y, month: m, day: 15, hour: 12, minute: 0 });
    const gz = e.palja.monthPillar.stem + e.palja.monthPillar.branch;
    out.push({ year: y, month: m, ...scoreGanZhi(engine, gz, topic, gender) });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** 연도별 점수(입춘 이후인 6월 15일의 연주 기준). years: [2026, 2027, ...] */
function yearlyFlow(engine, years, { topic = 'intro', gender = null } = {}) {
  return years.map((year) => {
    const e = computeSaju({ year, month: 6, day: 15, hour: 12, minute: 0 });
    const gz = e.palja.yearPillar.stem + e.palja.yearPillar.branch;
    return { year, ...scoreGanZhi(engine, gz, topic, gender) };
  });
}

module.exports = { monthlyFlow, yearlyFlow, scoreGanZhi, TOPIC_GROUPS };

