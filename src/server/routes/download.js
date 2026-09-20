'use strict';
const express = require('express');
const fs = require('fs');
const orders = require('../../db/orders');

const router = express.Router();

const NAME_BY_PRODUCT = {
  full: '길잡이여울_평생사주.pdf',
  compat: '길잡이여울_궁합리포트.pdf',
  quick: '길잡이여울_빠른리딩.pdf',
  date_select_moving: '길잡이여울_이사리포트.pdf',
  date_select_opening: '길잡이여울_개업리포트.pdf',
  date_select_wedding: '길잡이여울_결혼리포트.pdf',
  date_select_birth: '길잡이여울_임신출산리포트.pdf',
  life_topic_compat: '길잡이여울_궁합운리포트.pdf',
  life_topic_wealth: '길잡이여울_재물운리포트.pdf',
  life_topic_health: '길잡이여울_건강운리포트.pdf'
};

router.get('/download/:jobId', (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order) return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  if (!req.session || !req.session.userId || req.session.userId !== order.user_id) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  if (order.status !== 'done' || !order.result_path) {
    return res.status(409).json({ error: '아직 PDF가 준비되지 않았습니다.' });
  }
  // status는 'done'인데 실제 파일이 없는 경우 — 생성이 안 끝난 게 아니라, 완료된 파일이
  // 서버에서 사라진 것(예: 영구 디스크 없이 배포될 때 파일시스템이 초기화됨). 완전히
  // 다른 상황이라 "준비 중" 메시지를 그대로 쓰면 사용자가 계속 기다리게 되므로 구분한다.
  if (!fs.existsSync(order.result_path)) {
    return res.status(410).json({ error: '이전에 완료된 파일을 서버에서 찾을 수 없습니다. 문의: sooky2001@gmail.com', code: 'file_missing' });
  }
  res.download(order.result_path, NAME_BY_PRODUCT[order.product_key] || '길잡이여울_리포트.pdf');
});

router.get('/download-card/:jobId', (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order) return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  if (!req.session || !req.session.userId || req.session.userId !== order.user_id) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  // 카드는 본편보다 먼저 만들어진다. 완료를 기다리지 않고 내려받게 한다 — 기다리는 동안
  // 볼 것을 주는 게 이 카드의 목적이다.
  if (!order.card_path) {
    return res.status(409).json({ error: '아직 요약 카드가 준비되지 않았습니다.' });
  }
  if (!fs.existsSync(order.card_path)) {
    return res.status(410).json({ error: '이전에 완료된 요약 카드를 서버에서 찾을 수 없습니다. 문의: sooky2001@gmail.com', code: 'file_missing' });
  }
  res.download(order.card_path, '길잡이여울_평생사주-요약카드.png');
});

module.exports = router;
