'use strict';
/* 궁합 리포트 골격 — 관계 유형별로 다뤄야 할 소주제와 분량.

   왜 필요한가: 예전 compatPromptBuilder는 "5~6문단으로 써라"고만 했고, 어느 근거를 고를지는
   모델에게 맡겼다("눈에 띄는 것 1~2개만"). 같은 두 사람을 두 번 돌리면 다른 근거가 나오고,
   신혼부부에게도 "다시 만난다면" 문단이 고정으로 붙었다. 관계 유형에 따라 볼 자리가 실제로
   다르므로(연애는 끌림·다툼, 부부는 살림·역할, 재회는 어긋난 구조) 무엇을 말할지는 코드가
   정하고 모델은 문장만 맡는다. chapterOutlines.js와 같은 원칙이다.

   원칙:
   - heading은 독자가 읽는 소제목. 명리 용어가 아니라 "그래서 우리한테 무슨 뜻인지"로 쓴다.
   - hint는 모델용. 그 소주제가 compat 엔진의 어느 필드에 기대야 하는지, 무엇을 다루고
     무엇을 다루지 말아야 하는지(다른 소주제와의 경계)를 적는다.
   - words 합은 TARGET_WORDS(실제 결과물 기준). promptBuilder처럼 요청 시엔 ASK_RATIO로 키운다.
   - 앞 두 소주제(상호 십신, 배우자궁)와 뒤 두 소주제(점수 총평, 요약·실천)는 모든 관계에 공통.
     가운데 둘만 관계 유형에 따라 바뀐다.
   - 마지막 소주제는 항상 "핵심 요약과 실천 포인트". */

const TARGET_WORDS = 3000;

const RELATIONS = {
  dating: { label: '연애 중', short: '연인' },
  married: { label: '결혼·부부', short: '부부' },
  crush: { label: '썸·시작 전', short: '시작 전' },
  ex: { label: '헤어짐·재회 고민', short: '재회' }
};
const DEFAULT_RELATION = 'dating';

const HEAD = [
  { heading: '서로에게 어떤 존재로 다가오는지', words: 600, hint: 'shipsinAtoBKo(상대가 나에게)·shipsinBtoAKo(내가 상대에게) 두 십신을 각각 풀어, 상대가 나를 어떻게 느끼고 내가 상대를 어떻게 느끼는지. 두 방향이 비대칭이면 그 차이가 관계에서 어떻게 드러나는지. 합·충은 여기서 다루지 않는다.' },
  { heading: '배우자궁이 말하는 것', words: 600, hint: 'dayRelation(일지-일지) 하나만 깊게. 육합·삼합이면 정서적 친밀감·자연스러운 끌림을, 충이면 초반 긴장·자극과 그것이 성장 동력이 될 수 있다는 균형 잡힌 톤으로, null이면 "특별한 합충이 없다는 것"이 뜻하는 담백함을. 다른 기둥의 합충은 다음 소주제 몫.' }
];

const TAIL = [
  { heading: '점수가 말하는 것과 말하지 않는 것', words: 300, hint: 'score를 정수 그대로 인용하되, 합·충 개수를 더하고 뺀 참고 수치임을 밝히고, 두 사람의 선택과 노력으로 얼마든지 달라질 수 있다는 점을 분명히. 운명론적 단정 금지.' },
  { heading: '핵심 요약과 두 사람을 위한 실천 포인트', words: 400, hint: '위에서 실제로 다룬 내용만 압축한 요약 1~2문장. 실천 2개는 앞에서 나온 근거(특정 충의 위치, 십신 방향, 용신 상보 등)에 실제로 대응하는 행동. "서로 배려하세요" 같은 뻔한 말 금지.' }
];

const MIDDLE = {
  dating: [
    { heading: '끌리는 지점과 부딪히는 지점', words: 600, hint: 'crossYukhap·crossSamhap 중 1개와 crossChung 중 1개를 골라 어느 기둥끼리인지(연지-월지 등 궁 이름으로) 짚고, 연애 장면(데이트·연락·취향)에서 어떻게 나타나는지. 일지-일지는 이미 다뤘으니 제외. 전부 나열하지 않는다.' },
    { heading: '다툼이 생기는 방식과 푸는 법', words: 500, hint: '두 사람의 일간 성정과 신강신약 차이에서 싸움이 어떤 패턴으로 시작되는지, 용신이 서로 보완되는지(한쪽 용신 오행을 다른 쪽이 많이 가졌는지)로 푸는 실마리를. 결혼·미래 얘기는 하지 않는다.' }
  ],
  married: [
    { heading: '살림을 함께 꾸릴 때', words: 600, hint: 'crossYukhap·crossSamhap·crossChung 중 눈에 띄는 것 1~2개를 궁 이름으로 짚되, 연애 감정이 아니라 돈·집안일·역할 분담·양가 관계 같은 생활 장면으로 해석. 격국 조합에서 누가 어떤 역할을 자연스럽게 맡게 되는지.' },
    { heading: '오래 가는 힘과 닳는 지점', words: 500, hint: '용신 상보(서로의 부족을 채우는지)가 긴 세월에 어떤 힘이 되는지, 반대로 충 구조가 반복되면 어디가 먼저 닳는지. 신강신약 차이에서 오는 주도권·의존 문제. 이혼·파국 단정 금지.' }
  ],
  crush: [
    { heading: '먼저 다가가도 될까', words: 600, hint: 'shipsinAtoBKo/BtoAKo 방향(누가 누구를 더 끌어당기는 구조인지)과 crossYukhap·crossSamhap 중 1개를 근거로, 시작 단계에서 누가 움직이는 게 자연스러운지. 앞 소주제와 겹치지 않게 "행동"에 초점. 확답 대신 가능성으로.' },
    { heading: '가까워질수록 드러날 것', words: 500, hint: 'crossChung 중 1개와 두 일간의 성정·격국 차이에서, 지금은 안 보이지만 가까워지면 부딪힐 지점을 미리. 그것이 결정적 결함이 아니라 알고 시작하면 다룰 수 있는 차이임을.' }
  ],
  ex: [
    { heading: '그때 왜 어긋났는지', words: 600, hint: 'crossChung과 dayRelation(충이면 다시 언급)을 근거로, 헤어짐이 성격 탓이 아니라 어떤 구조에서 반복됐는지 궁 이름으로 짚는다. 신강신약·격국 차이에서 오는 기대 불일치. 누구 잘못인지 가리지 않는다.' },
    { heading: '다시 만난다면 달라질 수 있는 지점', words: 500, hint: 'crossYukhap·crossSamhap과 용신 상보에서 이번엔 달라질 수 있는 지점 1개, 앞 소주제의 충 구조에서 다시 부딪힐 지점 1개를 각각 구체적으로. 재회를 권하거나 말리는 단정은 하지 않는다.' }
  ]
};

/** 관계 유형에 맞는 골격. 모르는 값이면 기본(연애 중). */
function getCompatOutline(relation) {
  const key = RELATIONS[relation] ? relation : DEFAULT_RELATION;
  return [...HEAD, ...MIDDLE[key], ...TAIL];
}

function normalizeRelation(relation) {
  return RELATIONS[relation] ? relation : DEFAULT_RELATION;
}

module.exports = { RELATIONS, DEFAULT_RELATION, TARGET_WORDS, getCompatOutline, normalizeRelation };
