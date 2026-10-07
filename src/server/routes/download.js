'use strict';
const express = require('express');
const fs = require('fs');
const orders = require('../../db/orders');
const { DEEP_TOPICS } = require('../../llm/deepReading');
const newYearConfig = require('../../config/newYear');

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
  life_topic_health: '길잡이여울_건강운리포트.pdf',
  new_year_2027: '사주보는수달_2027년신년운세.pdf'
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

/* 요약 카드 파일명 — 평생사주는 기존 이름 그대로, 심층 리딩(deep_<주제>)은 주제 이름을 넣는다. */
function cardFileName(productKey) {
  if (productKey === newYearConfig.productKey) return '사주보는수달_2027년신년운세-공유카드.png';
  const m = /^deep_(.+)$/.exec(productKey || '');
  const topic = m && DEEP_TOPICS[m[1]];
  return topic ? '사주보는수달_' + topic.label + '-공유카드.png' : '길잡이여울_평생사주-요약카드.png';
}

router.get('/download-card/:jobId', (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order) return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  if (!req.session || !req.session.userId || req.session.userId !== order.user_id) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  // 예전 주문이거나 카드 렌더링이 실패한 경우에는 PDF만 제공한다.
  if (!order.card_path) {
    return res.status(409).json({ error: '아직 요약 카드가 준비되지 않았습니다.' });
  }
  if (!fs.existsSync(order.card_path)) {
    return res.status(410).json({ error: '이전에 완료된 요약 카드를 서버에서 찾을 수 없습니다. 문의: sooky2001@gmail.com', code: 'file_missing' });
  }
  res.download(order.card_path, cardFileName(order.product_key));
});

module.exports = router;
