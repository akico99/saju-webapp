'use strict';
const express = require('express');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');
const { publicJobError } = require('../publicJobError');

const router = express.Router();

// jobId는 무작위 UUID라 추측은 어렵지만, 로그인 없이 조회 가능했던 건 그 자체로
// 방어 원칙(추측 불가능성에만 의존)에 어긋난다 — jobId가 로그·화면공유 등으로 새어나가면
// 그걸 본 아무나 남의 생성 진행률·에러 메시지를 볼 수 있었다. 주문 소유자만 보게 한다.
//
// 상태는 orders 테이블에서 직접 읽는다(예전엔 메모리 jobManager를 따로 봤는데, 서버가
// 재시작되면 그 값이 사라져서 주문은 남아있는데도 "job을 찾을 수 없습니다"가 떴다).
router.get('/status/:jobId', requireAuth, (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || order.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  }
  res.json({
    status: order.status,
    progress: { current: order.progress_current, total: order.progress_total },
    error: order.status === 'error' ? publicJobError(order.error, order.product_key) : null,
    report: order.result_text
  });
});

module.exports = router;
