'use strict';
/* 용신(用神) 판정 — 억부(주력) + 조후 + 통관 + 병약을 각각 계산하고,
   서로 불일치하면 "억부용신은 A, 조후상 보완 오행은 B"처럼 구조화된 채로 병기한다.
   기존 엔진은 신강→식상오행 / 신약→인성오행 이분법 하나뿐이었음(전문가들이 가장 많이
   지적하는 "용신 하나로 퉁치기" 오류의 원인). */

const { productOf, controlsOf, whoProduces, whoControls, CONTROLS } = require('./constants');

const WINTER = new Set(['亥', '子', '丑']);
const SUMMER = new Set(['巳', '午', '未']);

function analyzeEokbu(ilganOhaeng, verdict, score) {
  const isStrongLean = verdict === '신강' || (verdict === '중화' && score > 0);
  if (isStrongLean) {
    // 신강 — 설기(식상) > 재성 > 관성 순
    const siksang = productOf(ilganOhaeng);
    const jaeseong = controlsOf(ilganOhaeng);
    const gwanseong = whoControls(ilganOhaeng);
    return { mode: '신강-설기', candidates: [siksang, jaeseong, gwanseong], primary: siksang };
  }
  // 신약 — 인성 > 비겁 순
  const inseong = whoProduces(ilganOhaeng);
  return { mode: '신약-부조', candidates: [inseong, ilganOhaeng], primary: inseong };
}

function analyzeJohu(monthBranch, counts) {
  if (WINTER.has(monthBranch) && counts.ohaeng['水'] >= 3) {
    return { element: '火', ruleMatched: '겨울생(亥子丑월) + 水 과다 → 한랭 해소용 火 필요' };
  }
  if (SUMMER.has(monthBranch) && counts.ohaeng['火'] >= 3) {
    return { element: '水', ruleMatched: '여름생(巳午未월) + 火 과다 → 조열 해소용 水 필요' };
  }
  return { element: null, ruleMatched: null };
}

function analyzeTonggwan(counts) {
  for (const [a, b] of Object.entries(CONTROLS)) {
    if (counts.ohaeng[a] >= 2 && counts.ohaeng[b] >= 2) {
      const bridge = productOf(a);
      if (counts.ohaeng[bridge] === 0) {
        return { element: bridge, ruleMatched: `${a}克${b} 대치 상태 → 통관 오행 ${bridge} 필요` };
      }
    }
  }
  return { element: null, ruleMatched: null };
}

function analyzeByeongyak(hapchung, counts) {
  const groups = [...hapchung.samhap.complete, ...hapchung.banghap.complete];
  for (const g of groups) {
    const victim = CONTROLS[g.element];
    if (victim && counts.ohaeng[victim] <= 1) {
      const cure = whoControls(g.element);
      return { element: cure, ruleMatched: `${g.element}국(삼합/방합)이 ${victim}을 극함 → 병약용신 ${cure}로 국 제어` };
    }
  }
  return { element: null, ruleMatched: null };
}

/**
 * @param {Object} core manse-core.analyze()
 * @param {Object} strength strength.analyzeStrength()
 * @param {Object} hapchung hapchung.analyzeHapchung()
 * @param {Object} counts counts.buildCounts()
 */
function analyzeYongshin(core, strength, hapchung, counts) {
  const ilganOhaeng = core.ilgan.ohaeng;
  const monthBranch = core.palja.monthPillar.branch;

  const eokbu = analyzeEokbu(ilganOhaeng, strength.verdict, strength.score);
  const johu = analyzeJohu(monthBranch, counts);
  const tonggwan = analyzeTonggwan(counts);
  const byeongyak = analyzeByeongyak(hapchung, counts);

  let note;
  const extras = [];
  if (johu.element && johu.element !== eokbu.primary) extras.push(`조후상 보완 오행은 ${johu.element}(${johu.ruleMatched})`);
  if (byeongyak.element && byeongyak.element !== eokbu.primary) extras.push(`병약 관점에서는 ${byeongyak.element}(${byeongyak.ruleMatched})`);
  if (tonggwan.element && tonggwan.element !== eokbu.primary) extras.push(`통관 관점에서는 ${tonggwan.element}(${tonggwan.ruleMatched})`);

  if (extras.length === 0) {
    note = `억부용신 ${eokbu.primary}과 조후·통관·병약 판단이 특별히 상충하지 않음`;
  } else {
    note = `억부용신은 ${eokbu.primary}, ` + extras.join(', ');
  }

  return {
    eokbu, johu, tonggwan, byeongyak,
    final: { main: eokbu.primary, note }
  };
}

module.exports = { analyzeYongshin };
