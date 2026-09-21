'use strict';
const express = require('express');
const points = require('../../db/points');
const users = require('../../db/users');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/* 예전의 "포인트 충전"(입금 안내 + 충전 신청) API는 없앴다. 사이트 안에 잔액을 사고파는 흐름이 있으면
   PG 심사에서 선불 전자지급수단으로 읽힌다. 결제는 상품 페이지에서 리포트 1건마다 카드로 하고(pay.js),
   여기는 예전 입금 잔여금 조회만 남긴다. 잔여금은 다음 결제 때 자동으로 먼저 차감된다. */

router.get('/points/mine', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  res.json({
    balance: user.point_balance,
    requests: points.listMyRequests(req.session.userId),
    transactions: points.listMyTransactions(req.session.userId)
  });
});

module.exports = router;
