'use strict';
/* 연애 시기 리포트 공개 스위치 — 구조 개편의 첫 대표 상품. 현대카드 심사가 끝나고 판매 전환을
   결정하기 전까지는 운영에서 보이지 않는다. 환경변수로 켰을 때만 페이지·정적 파일·API·결제가 함께
   열린다(app.js 게이트, points.SELLABLE, products.resolveProduct). */
const enabled = /^(1|true|yes|on)$/i.test(String(process.env.LOVE_TIMING_ENABLED || '').trim());

const brand = require('../../public/love-brand');
module.exports = { enabled, productKey: 'love_timing', priceKrw: brand.product.priceKrw, label: '연애 시기 리포트', page: '/love.html' };
