'use strict';
/* 「다시, 우리」(재회) 공개 스위치. 운영 기본값은 꺼짐이다. 켜야 페이지·정적 파일·API·결제가 함께 열린다.
   옛 재회 점수표(990원)가 상품 키 'reunion'을 이미 썼으므로 새 상품은 'reunion_v2'를 쓴다.
   결제 상품 종류 이름(resolveProduct의 product)은 'reunion'이다. */
const enabled = /^(1|true|yes|on)$/i.test(String(process.env.REUNION_ENABLED || '').trim());

module.exports = { enabled, productKey: 'reunion_v2', product: 'reunion', priceKrw: 14900, label: '다시, 우리 — 재회 리포트', title: '다시, 우리', page: '/reunion.html' };
