'use strict';
/* 궁합 리포트 HTML — report.ejs와 같은 CSS(report.css)를 그대로 재사용해
   본 리포트와 동일한 천문성좌 다크 테마로 만든다. */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { renderMarkup, renderBody } = require('./textMarkup');
const { RELATIONS, normalizeRelation } = require('../llm/compatOutlines');
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
 */
/* 궁합 그래프 — 두 사람 오행 레이더, 합·충 카드, 서로의 용신을 채워 주는 정도. 엔진 값만 쓴다. */
function buildCompatVisuals(engineA, engineB, personA, personB, compat) {
  const nameA = safeName(personA.name, '본인'), nameB = safeName(personB.name, '상대방');
  const yA = engineA.yongshin.final.main, yB = engineB.yongshin.final.main;
  const hasB = (engineB.counts.ohaeng || {})[yA] || 0, hasA = (engineA.counts.ohaeng || {})[yB] || 0;
  const grade = (n) => (n >= 3 ? '넉넉히 채움' : n >= 1 ? '조금 채움' : '채우지 못함');
  return {
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

function renderCompatHtml(engineA, engineB, personA, personB, compat, text, relation) {
  const reportCss = getReportCss();
  const relationLabel = RELATIONS[normalizeRelation(relation)].label;
  return ejs.render(
    fs.readFileSync(TEMPLATE_PATH, 'utf8'),
    { engineA, engineB, personA, personB, compat, text, relationLabel, reportCss, renderMarkup, renderBody, safeName,
      vz: buildCompatVisuals(engineA, engineB, personA, personB, compat), visualCss: V.VISUAL_CSS },
    { filename: TEMPLATE_PATH }
  );
}

module.exports = { renderCompatHtml, buildCompatVisuals };
