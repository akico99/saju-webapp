'use strict';
/* 챕터 도입부에 보여줄 "핵심 키워드" 칩 — 완독 피로도를 낮추기 위해 각 장이 근거로 삼는
   엔진 데이터 중 가장 눈에 띄는 사실 몇 개만 짧게 뽑아 보여준다. chapters.js의
   engineFieldPaths와 같은 값만 쓰고 새로 지어내는 문구는 없다. */

function buildKeywordBank(engine) {
  const ilganLabel = `${engine.ilgan.char}(${engine.ilgan.ko}) 일간`;
  const kyukgukLabel = engine.kyukguk.name;
  const yongshinLabel = `용신 ${engine.yongshin.final.main}`;
  const strengthLabel = engine.strength.verdict;
  const lackingLabel = engine.counts.lacking.length ? `${engine.counts.lacking.join('·')} 부족` : null;
  const missingShipsinLabel = engine.counts.missingShipsin.length ? `무(無)${engine.counts.missingShipsin[0]}` : null;
  const abundantOhaeng = Object.entries(engine.counts.ohaengGrade).find(([, g]) => g === '과다');
  const abundantOhaengLabel = abundantOhaeng ? `${abundantOhaeng[0]} 과다` : null;
  const dominantGroupEntry = Object.entries(engine.counts.shipsinGroup).sort((a, b) => b[1] - a[1])[0];
  const dominantGroupLabel = dominantGroupEntry ? `${dominantGroupEntry[0]} 강세` : null;
  const gradeOf = (group) => engine.counts.shipsinGroupGrade[group] ? `${group} ${engine.counts.shipsinGroupGrade[group]}` : null;
  const firstDaewoon = engine.daewoon.find((d) => d.ganZhi);
  const allShinsals = ['year', 'month', 'day', 'hour'].flatMap((p) => engine.manse[p]?.shinsals || []);

  return {
    ilganLabel, kyukgukLabel, yongshinLabel, strengthLabel, lackingLabel, missingShipsinLabel,
    abundantOhaengLabel, dominantGroupLabel, gradeOf, firstDaewoon, allShinsals
  };
}

function getChapterKeywords(chapterId, engine) {
  const b = buildKeywordBank(engine);
  const MAP = {
    1: [b.ilganLabel, b.kyukgukLabel, b.yongshinLabel, b.strengthLabel],
    2: [b.ilganLabel, `${engine.manse.day.branchKo}(${engine.manse.day.branchOhaeng}) 일지`],
    3: [b.abundantOhaengLabel, b.lackingLabel],
    4: [b.dominantGroupLabel, b.missingShipsinLabel],
    5: [b.kyukgukLabel, b.strengthLabel],
    6: [b.yongshinLabel],
    7: [b.yongshinLabel, b.firstDaewoon ? `${b.firstDaewoon.startAge}세부터 대운` : null],
    8: [b.gradeOf('재성'), b.strengthLabel],
    9: [b.kyukgukLabel, b.dominantGroupLabel],
    10: [b.gradeOf('인성')],
    11: [b.gradeOf('관성'), b.gradeOf('식상')],
    12: [b.lackingLabel, b.abundantOhaengLabel],
    13: [b.gradeOf('비겁')],
    14: [b.ilganLabel, b.dominantGroupLabel],
    15: b.allShinsals.length ? b.allShinsals.slice(0, 3) : [b.ilganLabel],
    16: [b.yongshinLabel],
    17: [b.lackingLabel, b.yongshinLabel],
    18: [b.ilganLabel, b.kyukgukLabel, b.yongshinLabel, b.strengthLabel]
  };
  return (MAP[chapterId] || []).filter(Boolean).slice(0, 4);
}

module.exports = { getChapterKeywords };
