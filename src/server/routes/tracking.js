'use strict';
/* 공용 추적 스크립트(public/track.js)의 설정 — 픽셀 ID와 상품별 가격·이름.

   픽셀 ID는 Render 환경변수(META_PIXEL_ID, KAKAO_PIXEL_ID)로만 넣는다. 개인정보처리방침에
   광고 픽셀(행태정보 수집) 안내를 추가한 개정안의 시행일(PIXEL_START) 전에는 ID가 있어도 내려주지
   않는다 — 방침 13조의 "시행 7일 전 고지"를 코드로 지키기 위해서다. GA4는 기존 방침에 이미 있다. */
const express = require('express');
const points = require('../../db/points');
const { DEEP_TOPICS } = require('../../llm/deepReading');
const { OCCASIONS } = require('./dateSelect');
const { trackingOn } = require('../../config/tracking');

const router = express.Router();

function productCatalog() {
  const out = {};
  for (const key of points.SELLABLE) {
    let name = null;
    if (key === 'full') name = '평생사주 100p 정식 리포트';
    else if (key === 'compat') name = '궁합 리포트';
    else if (key.startsWith('deep_')) name = (DEEP_TOPICS[key.slice(5)] || {}).label && DEEP_TOPICS[key.slice(5)].label + ' 심층 리딩';
    else if (key.startsWith('date_select_')) { const occ = Object.values(OCCASIONS).find((o) => o.productKey === key); name = occ && occ.label + ' 리포트'; }
    if (name) out[key] = { name, price: points.PRICES[key] };
  }
  return out;
}

function pixelId(v) {
  const id = String(v || '').trim();
  return /^[A-Za-z0-9_-]{4,40}$/.test(id) ? id : null;
}

router.get('/tracking-config', (req, res) => {
  const pixelsOn = trackingOn();
  res.set('Cache-Control', 'public, max-age=300').json({
    metaPixelId: pixelsOn ? pixelId(process.env.META_PIXEL_ID) : null,
    kakaoPixelId: pixelsOn ? pixelId(process.env.KAKAO_PIXEL_ID) : null,
    products: productCatalog()
  });
});

module.exports = router;
module.exports.productCatalog = productCatalog;

