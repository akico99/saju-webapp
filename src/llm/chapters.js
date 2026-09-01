'use strict';
/* 18장 레지스트리 — 각 챕터가 엔진 JSON의 어느 필드를 볼 수 있는지(engineFieldPaths),
   interpretation.md의 어느 섹션을 참고하는지(interpretationRefs), 목표 분량을 정의한다.
   promptBuilder.js가 이 레지스트리를 읽어 프롬프트를 조립한다. */

const CHAPTERS = [
  {
    id: 1, title: '총평',
    engineFieldPaths: [
      'ilgan', 'kyukguk', 'yongshin.final', 'counts.lacking', 'counts.missingShipsin',
      'strength.deukryeong', 'strength.deukji', 'strength.deukse', 'strength.tongkeun', 'strength.verdict'
    ],
    interpretationRefs: [0],
    targetWords: 3800
  },
  {
    id: 2, title: '타고난 성격과 기질',
    engineFieldPaths: ['ilgan', 'palja.dayPillar', 'manse.day'],
    interpretationRefs: [1],
    targetWords: 5500
  },
  {
    id: 3, title: '오행 밸런스',
    engineFieldPaths: ['counts.ohaeng', 'counts.ohaengGrade', 'counts.lacking'],
    interpretationRefs: [2],
    targetWords: 5500
  },
  {
    id: 4, title: '십신 구조 — 내 에너지 지도',
    engineFieldPaths: ['counts.shipsinGroup', 'counts.shipsinGroupGrade', 'counts.shipsinDetail', 'counts.missingShipsin', 'manse'],
    interpretationRefs: [3],
    targetWords: 6000
  },
  {
    id: 5, title: '격국과 그릇',
    engineFieldPaths: ['kyukguk', 'hapchung.monthBranchChungFlag'],
    interpretationRefs: [4, 10],
    targetWords: 4900
  },
  {
    id: 6, title: '용신 — 평생 나를 살리는 기운',
    engineFieldPaths: [
      'ilgan.ohaeng',
      'yongshin.eokbu.mode', 'yongshin.eokbu.primary',
      'yongshin.johu.element', 'yongshin.johu.ruleMatched',
      'yongshin.tonggwan.element', 'yongshin.tonggwan.ruleMatched',
      'yongshin.byeongyak.element', 'yongshin.byeongyak.ruleMatched',
      'yongshin.final'
    ],
    interpretationRefs: [4, 9],
    targetWords: 5500
  },
  {
    id: 7, title: '대운 흐름 — 10년 단위 인생 그래프',
    engineFieldPaths: ['daewoon', 'yongshin.final', 'ilgan'],
    interpretationRefs: [5],
    targetWords: 6500
  },
  {
    id: 8, title: '재물운',
    engineFieldPaths: ['counts.shipsinDetail', 'counts.shipsinGroup', 'strength.verdict', 'yongshin.final', 'manse'],
    interpretationRefs: [3, 11],
    targetWords: 5500
  },
  {
    id: 9, title: '직업·적성운',
    engineFieldPaths: ['counts.shipsinGroup', 'kyukguk', 'strength.verdict', 'manse.month'],
    interpretationRefs: [3, 4],
    targetWords: 5500
  },
  {
    id: 10, title: '학업·시험·자격운',
    engineFieldPaths: ['counts.shipsinGroup.인성', 'counts.shipsinDetail', 'manse'],
    interpretationRefs: [3, 7],
    targetWords: 4300
  },
  {
    id: 11, title: '애정·결혼운',
    engineFieldPaths: ['manse.day', 'counts.shipsinGroup', 'hapchung', 'manse'],
    interpretationRefs: [3, 8, 11],
    targetWords: 6000
  },
  {
    id: 12, title: '건강운',
    engineFieldPaths: ['counts.ohaeng', 'counts.ohaengGrade', 'counts.lacking'],
    interpretationRefs: [2],
    targetWords: 4900
  },
  {
    id: 13, title: '대인관계·인복',
    engineFieldPaths: ['counts.shipsinGroup.비겁', 'manse'],
    interpretationRefs: [3, 7],
    targetWords: 4300
  },
  {
    id: 14, title: '가족운',
    engineFieldPaths: ['manse.year', 'manse.hour', 'counts.shipsinGroup', 'ilgan'],
    interpretationRefs: [11],
    targetWords: 4900
  },
  {
    id: 15, title: '신살 풀이',
    engineFieldPaths: ['manse'],
    interpretationRefs: [6, 7],
    targetWords: 5500
  },
  {
    id: 16, title: '평생 길흉 캘린더',
    engineFieldPaths: ['daewoon', 'yongshin.final', 'hapchung'],
    interpretationRefs: [5],
    targetWords: 5500
  },
  {
    id: 17, title: '개운법',
    engineFieldPaths: ['counts.lacking', 'yongshin.final'],
    interpretationRefs: [2, 9],
    targetWords: 4300
  },
  {
    id: 18, title: '마무리 — 인생 총조언',
    engineFieldPaths: ['ilgan', 'strength.verdict', 'kyukguk.name', 'yongshin.final'],
    interpretationRefs: [0, 12],
    targetWords: 3200
  }
];

module.exports = { CHAPTERS };
