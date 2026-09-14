'use strict';
const express = require('express');
const { getJob } = require('../../jobs/jobManager');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// jobId는 무작위 UUID라 추측은 어렵지만, 로그인 없이 조회 가능했던 건 그 자체로
// 방어 원칙(추측 불가능성에만 의존)에 어긋난다 — jobId가 로그·화면공유 등으로 새어나가면
// 그걸 본 아무나 남의 생성 진행률·에러 메시지를 볼 수 있었다. 주문 소유자만 보게 한다.
router.get('/status/:jobId', requireAuth, (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (order && order.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  }
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  res.json({
    status: job.status,
    progress: job.progress,
    error: job.error
  });
});

module.exports = router;
