'use strict';
/* 연애 시기 리포트 — 무료 첫 장(/api/love/preview)과 유료 생성(/api/love). 결제 승인 뒤에는
   pay.js가 resolveProduct('love')로 start()를 부른다. */
const express = require('express');
const { HttpError } = require('../httpError');

const router = express.Router();

async function startLove() {
  throw new HttpError(503, { error: '준비 중인 상품입니다.' });
}

module.exports = router;
module.exports.start = startLove;
