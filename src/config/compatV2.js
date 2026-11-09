'use strict';
/* 두 사람의 궁합(새 궁합 상품, 14,900원) 공개 스위치. 기존 /compat.html(4,900원 PDF)과는 별개 상품이다.
   환경변수 COMPAT_V2_ENABLED를 켰을 때만 페이지·API·결제가 열린다(운영 기본값은 꺼짐). */
const enabled = /^(1|true|yes|on)$/i.test(String(process.env.COMPAT_V2_ENABLED || '').trim());

// 관계 — 입력 첫 질문. 장의 초점과 행동 제안의 결이 여기서 갈린다.
const RELATIONS = Object.freeze({
  some: { label: '썸', guide: '두 사람은 지금 썸을 타는 단계입니다. 관계를 확정하지 않은 사이이므로 서로의 의사를 확인하는 속도와 방식에 초점을 맞추세요. 상대가 나를 어떻게 생각하는지는 단정하지 마세요.' },
  dating: { label: '연애 중', guide: '두 사람은 지금 연애 중입니다. 데이트·연락·갈등 조율·함께 세우는 계획 같은 연인의 장면으로 풀어 주세요. 새 사람을 찾으라는 말은 하지 마세요.' },
  married: { label: '부부·예비부부', guide: '두 사람은 부부이거나 결혼을 앞둔 사이입니다. 연애 감정보다 돈·집안일·역할 분담·양가 관계·큰 결정 같은 생활의 장면으로 풀어 주세요. 이혼·파국을 단정하지 마세요.' },
  crush: { label: '짝사랑', guide: '읽는 사람이 그 사람을 혼자 좋아하는 단계입니다. 그 사람은 아직 마음을 모를 수 있습니다. 상대의 마음을 단정하지 말고, 부담을 주지 않는 다가감, 상대의 반응과 거리를 존중하는 기준, 거절도 하나의 답이라는 점을 분명히 하세요. 몰래 살피기·반복 연락·집착을 부추기지 마세요.' }
});

module.exports = { enabled, productKey: 'compat_v2', priceKrw: 14900, label: '두 사람의 궁합', page: '/couple.html', RELATIONS };
