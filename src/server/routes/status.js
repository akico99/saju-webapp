'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');
const { publicJobError } = require('../publicJobError');
const { OUTPUT_ROOT } = require('../../config/outputDir');

const router = express.Router();

/* 평생사주는 완본 PDF가 나오기까지 몇 분이 걸린다. 그동안 진행률 막대만 보여주는 대신
   다 쓰인 챕터부터 읽게 한다. generateReport가 챕터마다 chapters.json에 증분 저장하므로
   그 파일을 읽으면 된다. 폴링 응답이 무거워지지 않도록 여기서는 제목만 주고, 본문은
   아래 별도 경로에서 한 챕터씩 가져간다. */
function readChapters(jobId) {
  try {
    const file = path.join(OUTPUT_ROOT, jobId, 'chapters.json');
    if (!fs.existsSync(file)) return [];
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return []; // 쓰는 중이라 반쯤 잘린 파일을 읽었을 수 있다. 다음 폴링에서 다시 본다.
  }
}

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
    report: order.result_text,
    hasCard: !!order.card_path,
    chaptersReady: readChapters(req.params.jobId)
      .map((c, i) => (c ? { index: i, id: c.id, title: c.title } : null))
      .filter(Boolean)
  });
});

// 완성된 챕터 한 편의 본문. 폴링과 분리해 두어야 진행률 요청이 무거워지지 않는다.
router.get('/status/:jobId/chapter/:index', requireAuth, (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || order.user_id !== req.session.userId) {
    return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  }
  const chapter = readChapters(req.params.jobId)[Number(req.params.index)];
  if (!chapter) return res.status(404).json({ error: '아직 완성되지 않은 챕터입니다.' });
  res.json({ id: chapter.id, title: chapter.title, text: chapter.text });
});

module.exports = router;
