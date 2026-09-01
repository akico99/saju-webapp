'use strict';
const express = require('express');
const points = require('../../db/points');
const users = require('../../db/users');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/points/deposit-info', requireAuth, (req, res) => {
  res.json({
    account: process.env.DEPOSIT_ACCOUNT_INFO || '[운영자가 .env의 DEPOSIT_ACCOUNT_INFO를 아직 설정하지 않았습니다]',
    pointRate: '1P = 1원',
    notice: '입금 후 신청하시면, 운영자가 입금을 직접 확인한 뒤 포인트를 지급합니다(자동 지급 아님).'
  });
});

router.post('/points/request', requireAuth, (req, res) => {
  const amountKrw = Number(req.body.amountKrw);
  const depositorName = (req.body.depositorName || '').slice(0, 30);
  if (!amountKrw || amountKrw < 1000) {
    return res.status(400).json({ error: '충전 금액은 1,000원 이상이어야 합니다.' });
  }
  const row = points.createRequest({ userId: req.session.userId, amountKrw, depositorName });
  res.json({ request: row });
});

router.get('/points/mine', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  res.json({
    balance: user.point_balance,
    requests: points.listMyRequests(req.session.userId),
    transactions: points.listMyTransactions(req.session.userId)
  });
});

module.exports = router;
