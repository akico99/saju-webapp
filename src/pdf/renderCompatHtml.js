'use strict';
/* 궁합 리포트 HTML — report.ejs와 같은 CSS(report.css)를 그대로 재사용해
   본 리포트와 동일한 천문성좌 다크 테마로 만든다. */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { renderMarkup, renderBody } = require('./textMarkup');
const { RELATIONS, normalizeRelation, splitCompatText } = require('../llm/compatOutlines');
const { buildCompatTiming } = require('../llm/compatTiming');
const { getReportCss } = require('./reportCss');
const { safeName } = require('./personName');
const V = require('./visuals');

const TEMPLATE_PATH = path.join(__dirname, 'templates', 'compat.ejs');

/**
 * @param {Object} engineA computeSaju() 결과 (본인)
 * @param {Object} engineB computeSaju() 결과 (상대)
 * @param {{name?:string}} personA
 * @param {{name?:string}} personB
 * @param {Object} compat analyzeCompatibility() 결과
 * @param {string} text LLM이 생성한 궁합 서술 본문
 * @param {string} [relation] compatOutlines.RELATIONS 키
 * @param {Object|null} [timing] compatTiming.buildCompatTiming() 결과(undefined면 여기서 계산, null이면 시기 그래프 생략)
 */
/* 궁합 그래프 — 두 사람 오행 레이더, 합·충 카드, 서로의 용신을 채워 주는 정도. 엔진 값만 쓴다. */
/* timing: compatTiming.buildCompatTiming 결과 또는 null. 있으면 "두 사람의 앞으로 3년"(재회는 6개월) 패널이 붙는다. */
function buildCompatVisuals(engineA, engineB, personA, personB, compat, timing) {
  const nameA = safeName(personA.name, '본인'), nameB = safeName(personB.name, '상대방');
  const yA = engineA.yongshin.final.main, yB = engineB.yongshin.final.main;
  const hasB = (engineB.counts.ohaeng || {})[yA] || 0, hasA = (engineA.counts.ohaeng || {})[yB] || 0;
  const grade = (n) => (n >= 3 ? '넉넉히 채움' : n >= 1 ? '조금 채움' : '채우지 못함');
  let timingPanel = '';
  if (timing && timing.periods && timing.periods.length) {
    const isMonth = timing.mode === 'month';
    const unit = isMonth ? '달' : '해';
    const best = timing.periods[timing.bestIndex];
    // 첫 구간은 "직전"이 없어 함께 오르는지 알 수 없다. 실제로 둘 다 오른 때만 "함께 올라가는"이라 부른다.
    const tag = best.bothRise ? '함께 올라가는 ' + unit : '평균 최고인 ' + unit;
    const cap = '<b>' + V.esc(best.label) + '</b>이 두 사람 평균 ' + best.combined + '점으로 가장 높아요' +
      (best.bothRise ? '. 두 사람 모두 직전보다 오르는 ' + unit + '입니다.' : '.') +
      ' 점수는 용신 60%와 연애 십신 40%를 합친 참고값이며, 일어날 일을 예언하는 수치가 아닙니다.';
    timingPanel = '<div class="vz-panel"><div class="ttl">' + (isMonth ? '두 사람의 앞으로 6개월' : '두 사람의 앞으로 3년') +
      ' <small>두 사람 평균이 가장 높은 ' + unit + '에 표시</small></div>' +
      V.pairBarsHtml(timing.periods, { nameA, nameB, bestIndex: timing.bestIndex, bestTag: tag }) +
      '<p class="cap">' + cap + '</p></div>';
  }
  return {
    timingPanel,
    cards: V.infoCardsHtml([
      { icon: '01', title: '관계 참고 점수', value: compat.score + ' / 100', note: '합·충 개수를 환산한 참고 수치' },
      { icon: '02', title: '맞물리는 지점', value: (compat.crossYukhap.length + compat.crossSamhap.length) + '곳', note: '서로 자연스럽게 통하는 자리(육합·삼합)' },
      { icon: '03', title: '부딪히는 지점', value: compat.crossChung.length + '곳', note: '의견을 맞추는 노력이 필요한 자리(충)' }
    ]),
    radarA: V.ohaengRadarSvg(engineA.counts.ohaeng || {}, { size: 190 }),
    radarB: V.ohaengRadarSvg(engineB.counts.ohaeng || {}, { size: 190 }),
    fill: V.gaugesHtml([
      { label: nameB + ' → ' + nameA, sub: nameA + '님의 용신 기운(' + yA + ')이 ' + nameB + '님 사주에 ' + hasB + '개', count: hasB, grade: grade(hasB) },
      { label: nameA + ' → ' + nameB, sub: nameB + '님의 용신 기운(' + yB + ')이 ' + nameA + '님 사주에 ' + hasA + '개', count: hasA, grade: grade(hasA) }
    ])
  };
}

function renderCompatHtml(engineA, engineB, personA, personB, compat, text, relation, timing) {
  const reportCss = getReportCss();
  const rel = normalizeRelation(relation);
  const relationLabel = RELATIONS[rel].label;
  const timingData = timing === undefined ? buildCompatTiming(engineA, engineB, rel) : timing;
  // 모델이 맨 끝에 붙인 "지금 할 것/피할 것"은 본문에서 떼어 두 카드로 그린다(없거나 깨져도 본문만 나온다).
  const parts = splitCompatText(text);
  const ddHtml = V.ddCardsHtml(parts.dos, parts.donts, { rich: renderMarkup });
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { engineA, engineB, personA, personB, compat, text: parts.prose, ddHtml, relationLabel, reportCss, renderMarkup, renderBody, safeName,
      vz: buildCompatVisuals(engineA, engineB, personA, personB, compat, timingData), visualCss: V.VISUAL_CSS },
    { filename: TEMPLATE_PATH }
  );
}

/* 웹 결과 화면용 — PDF와 같은 엔진 숫자로 만든 카드·시기 막대·오행·용신 채움을 한 덩어리로.
   할 것/피할 것 카드는 본문 글과 함께 클라이언트(public/compat-app.js)가 그린다. */
function compatWebHtml(vz) {
  const panel = (title, sub, html) => '<div class="vz-panel"><div class="ttl">' + V.esc(title) + (sub ? ' <small>' + V.esc(sub) + '</small>' : '') + '</div>' + html + '</div>';
  return '<div class="vz-web">' + vz.cards +
    (vz.timingPanel ? '<div style="margin-top:5mm;">' + vz.timingPanel + '</div>' : '') +
    '<div style="margin-top:5mm;">' +
    panel('두 사람의 오행', '', '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">' + vz.radarA + vz.radarB + '</div>') +
    '</div><div style="margin-top:5mm;">' + panel('서로의 용신을 채워 주는 정도', '용신 = 균형을 잡아 주는 기운', vz.fill) + '</div></div>';
}

module.exports = { renderCompatHtml, buildCompatVisuals, compatWebHtml };
