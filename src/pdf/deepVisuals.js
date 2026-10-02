'use strict';
/* 주제별 심층 리딩(3,900원) PDF의 시각 요소 데이터 — 엔진 결과와 리딩 본문에서 뽑는다.
   숫자는 모두 엔진 값(deepReading.buildTimingData와 인생 그래프가 쓰는 점수)이다. */
const { computeDaewoonScores } = require('./charts');
const V = require('./visuals');

/* 십신 묶음을 주제의 말로 옮긴 게이지. 설명은 명리 교과서적 의미만 쓰고 단정하지 않는다. */
const GROUP_GAUGES = {
  wealth: [
    ['재성', '돈을 쥐는 힘', '수입·자산을 다루고 관리하는 기운'],
    ['식상', '돈을 만드는 힘', '기술·아이디어로 수입을 만드는 기운'],
    ['비겁', '돈을 두고 겨루는 힘', '많으면 경쟁·지출, 없으면 지키는 힘이 약함'],
    ['관성', '안정된 틀', '조직·계약 안에서 들어오는 수입'],
    ['인성', '자격과 신용', '문서·자격·신뢰가 돈이 되는 기운'],
    null
  ],
  career: [
    ['관성', '조직과 책임', '직장·직급·규칙 안에서 인정받는 힘'],
    ['식상', '기술과 표현', '만들고 말하고 보여주는 재능'],
    ['인성', '자격과 학습', '공부·자격증·전문성을 쌓는 힘'],
    ['재성', '성과와 실리', '숫자로 결과를 내고 관리하는 힘'],
    ['비겁', '독립과 주도', '스스로 판을 짜고 이끄는 힘'],
    null
  ],
  relationship: [
    ['비겁', '동료·친구', '나와 어깨를 나란히 하는 사람'],
    ['인성', '돕는 윗사람', '가르치고 챙겨주는 사람'],
    ['관성', '윗사람·규칙', '나를 이끌거나 평가하는 사람'],
    ['식상', '후배·표현', '내가 챙기고 말을 건네는 사람'],
    ['재성', '실리 관계', '일과 이익으로 엮이는 사람'],
    null
  ],
  intro: [
    ['비겁', '나 자신의 힘', '주관·자존심·독립심'],
    ['식상', '표현하는 힘', '재능·말·창작'],
    ['재성', '다루는 힘', '현실감각·관리·돈'],
    ['관성', '지키는 힘', '책임감·규칙·명예'],
    ['인성', '받아들이는 힘', '학습·사색·보살핌'],
    null
  ]
};

const BADGE_DESC = {
  '도화살': '사람을 끄는 매력과 인기가 드러나는 기운',
  '역마살': '이동·변화·새로운 환경에서 힘을 얻는 기운',
  '화개살': '예술·학문·한 분야에 깊이 몰입하는 기운',
  '장성살': '앞에 서서 이끄는 리더십의 기운',
  '천을귀인': '어려울 때 도와주는 사람이 나타나는 기운',
  '문창귀인': '글·공부·시험에 강한 총명함의 기운',
  '반안살': '자리를 잡고 안정된 지위를 얻는 기운',
  '지살': '새 출발과 움직임이 시작되는 기운'
};
const TOPIC_BADGES = {
  wealth: ['천을귀인', '반안살', '역마살', '장성살'],
  career: ['역마살', '장성살', '화개살', '문창귀인', '반안살', '천을귀인', '지살'],
  love: ['도화살', '천을귀인', '역마살', '화개살'],
  relationship: ['천을귀인', '도화살', '장성살', '화개살'],
  intro: Object.keys(BADGE_DESC),
  health: []
};

function natalShinsals(engine) {
  const found = new Set();
  ['year', 'month', 'day', 'hour'].forEach((k) => {
    ((engine.manse && engine.manse[k] && engine.manse[k].shinsals) || []).forEach((s) => found.add(String(s).replace(/\(.*\)$/, '').trim()));
  });
  return found;
}

function topicBadges(engine, topicKey) {
  const have = natalShinsals(engine);
  return (TOPIC_BADGES[topicKey] || []).filter((n) => have.has(n)).map((n) => ({ name: n, desc: BADGE_DESC[n] }));
}

function topicGauges(engine, topicKey, gender) {
  const g = engine.counts.shipsinGroup || {}, grade = engine.counts.shipsinGroupGrade || {};
  let spec = GROUP_GAUGES[topicKey];
  if (topicKey === 'love') {
    const spouse = gender === '남' ? '재성' : '관성';
    spec = [
      [spouse, '배우자 별', (gender === '남' ? '재성' : '관성') + ' — 전통적으로 배우자·인연을 뜻하는 기운'],
      ['식상', '마음을 표현하는 힘', '애정 표현·다정함·말솜씨'],
      ['비겁', '자존심과 경쟁', '많으면 고집, 적당하면 당당함'],
      ['인성', '받아주는 마음', '이해심·배려·기다림']
    ];
  }
  if (topicKey === 'health') {
    const oc = engine.counts.ohaeng || {}, og = engine.counts.ohaengGrade || {};
    return V.OH.map((o) => ({ label: o + ' ' + V.OH_LABEL[o] + ' · ' + V.OH_MEANING[o], count: oc[o] || 0, grade: og[o] || '',
      sub: !oc[o] ? '비어 있는 기운 — 채우는 생활 습관이 필요' : og[o] === '강함' || og[o] === '과다' ? '넘치는 기운 — 과열·무리를 조심' : og[o] === '약함' ? '약한 기운 — 조금씩 보충' : '균형 범위' }));
  }
  if (!spec) return [];
  return spec.filter(Boolean).map(([key, label, sub]) => ({ label, sub, count: g[key] || 0, grade: (grade[key] || '') + ' · ' + key }));
}

/* 본문에서 결론 한 문장을 뽑는다 — "### 핵심 요약" 소주제의 첫 문장, 없으면 첫 문단 첫 문장. */
function verdictSentence(chapters) {
  for (const ch of chapters || []) {
    const m = /###\s*핵심 요약[^\n]*\n+([\s\S]*?)(?=\n###\s|$)/.exec(ch.text || '');
    if (m) return firstSentence(m[1]);
  }
  const first = ((chapters && chapters[0] && chapters[0].text) || '').split(/\n\n+/).find((b) => b.trim() && !/^###/.test(b.trim()));
  return first ? firstSentence(first) : '';
}
function firstSentence(s) {
  const t = String(s).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.{12,160}?[.!?](?=\s|$))/.exec(t);
  return m ? m[1] : t.slice(0, 140);
}

function buildDeepVisuals(engine, reading, gender) {
  const t = reading.timing.data;
  const years = t.years || [];
  const best = years.slice().sort((a, b) => b.score - a.score)[0];
  const worst = years.slice().sort((a, b) => a.score - b.score)[0];
  const thisYear = years[0];
  const months = t.months || [];
  const bestMonth = months.length ? months.reduce((a, b) => (b.score > a.score ? b : a)) : null;

  const decades = computeDaewoonScores(engine.daewoon, t.yongshinMain);
  let curIdx = -1;
  decades.forEach((d, i) => { if (t.currentAge >= d.age) curIdx = i; });
  const curvePoints = decades.map((d) => ({ label: d.age + '세', sub: String(d.year), score: d.score }));

  const yearRows = [];
  if (t.current) yearRows.push({ label: '지금 대운', sub: t.current.ganZhiKo + ' · ' + t.current.age + '세~', score: t.current.score, highlight: true });
  years.forEach((y) => yearRows.push({ label: y.year + '년', sub: y.ganZhiKo + ' · ' + (y.stemShipsin || '-'), score: y.score }));
  if (t.next) yearRows.push({ label: '다음 대운', sub: t.next.ganZhiKo + ' · ' + t.next.age + '세~', score: t.next.score });

  const careerRows = (t.careerTimeline || []).map((r) => ({ label: r.year + '년', sub: r.ganZhiKo + ' · ' + r.group, score: r.score, note: r.desc && r.desc.length <= 14 ? r.desc : undefined }));

  return {
    verdict: verdictSentence(reading.chapters),
    stats: [
      thisYear && { k: thisYear.year + '년 흐름', v: thisYear.score + '점', s: V.scoreTier(thisYear.score).label },
      best && { k: '3년 중 가장 좋은 해', v: best.year + '년', s: best.score + '점 · ' + V.scoreTier(best.score).label },
      bestMonth
        ? { k: '12개월 중 가장 좋은 달', v: bestMonth.year + '년 ' + bestMonth.month + '월', s: bestMonth.score + '점 · ' + V.scoreTier(bestMonth.score).label }
        : worst && worst !== best && { k: '가장 조심할 해', v: worst.year + '년', s: worst.score + '점 · ' + V.scoreTier(worst.score).label }
    ].filter(Boolean),
    radar: V.ohaengRadarSvg(engine.counts.ohaeng || {}),
    curve: V.lifeCurveSvg(curvePoints, curIdx),
    yearBars: V.scoreBarsHtml(yearRows),
    months: months.length ? V.monthFlowHtml(months) : '',
    careerBars: careerRows.length ? V.scoreBarsHtml(careerRows) : '',
    gauges: V.gaugesHtml(topicGauges(engine, reading.topicKey, gender)),
    badges: V.badgesHtml(topicBadges(engine, reading.topicKey)),
    gaugeTitle: { wealth: '내 재물 에너지 지도', career: '내 일 에너지 지도', love: '내 인연 에너지 지도', relationship: '내 관계 에너지 지도', intro: '내 에너지 지도 — 십신 다섯 묶음', health: '오행별 관리 포인트' }[reading.topicKey] || '에너지 지도'
  };
}

/* 웹 결과 화면용 — 결론 카드, 오행 레이더, 에너지 지도, 대운 곡선, 3년 막대를 한 덩어리로. */
function deepWebHtml(vz) {
  const panel = (title, sub, html) => html ? '<div class="vz-panel"><div class="ttl">' + V.esc(title) + (sub ? ' <small>' + V.esc(sub) + '</small>' : '') + '</div>' + html + '</div>' : '';
  return '<div class="vz-web">' +
    '<div class="vz-verdict"><div class="k">한눈에 보는 결론</div>' + (vz.verdict ? '<div class="h">' + V.esc(vz.verdict) + '</div>' : '') +
    '<div class="stats">' + vz.stats.map((st) => '<div class="stat"><small>' + V.esc(st.k) + '</small><b>' + V.esc(st.v) + '</b><span>' + V.esc(st.s) + '</span></div>').join('') + '</div></div>' +
    panel(vz.gaugeTitle, '사주 여덟 글자 속 기운의 개수', vz.gauges + vz.badges) +
    panel('오행 균형', '', vz.radar) +
    panel('10년 단위 인생 흐름', '금색 점선이 지금', vz.curve) +
    panel('지금 대운과 앞으로 3년', '용신과 이 주제의 십신을 함께 본 점수', vz.yearBars) +
    panel('앞으로 12개월', '용신과 이 주제의 십신을 함께 본 점수', vz.months) +
    panel('이직·승진 관점 5년 타임라인', '', vz.careerBars) +
    '</div>';
}

module.exports = { buildDeepVisuals, deepWebHtml, verdictSentence, topicGauges, topicBadges };

