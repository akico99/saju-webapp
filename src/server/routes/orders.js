'use strict';
const express = require('express');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const STATUS_LABEL = { pending: '생성 중', done: '완료', error: '실패' };

router.get('/orders/count', (req, res) => {
  res.json({ count: orders.countDone() });
});

router.get('/orders/mine', requireAuth, (req, res) => {
  const rows = orders.listByUser(req.session.userId).map((o) => ({
    jobId: o.job_id,
    productKey: o.product_key,
    label: o.label,
    status: o.status,
    statusLabel: STATUS_LABEL[o.status] || o.status,
    createdAt: o.created_at,
    hasCard: !!o.card_path
  }));
  res.json({ orders: rows });
});

module.exports = router;
