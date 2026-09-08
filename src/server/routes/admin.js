'use strict';
/* 관리자(=운영자 본인) 전용 — 포인트 충전 신청을 눈으로 확인하고 승인/거절하고, 회원을
   검색·조회하고, 포인트를 수동으로 조정하거나 계정을 정지시킨다.
   별도 로그인(ADMIN_PASSWORD)이며 일반 사용자 세션과는 완전히 분리되어 있다. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const points = require('../../db/points');
const users = require('../../db/users');
const orders = require('../../db/orders');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/admin/login', (req, res) => {
  const password = req.body.password || '';
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: '.env에 ADMIN_PASSWORD가 설정되어 있지 않습니다.' });
  }
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

router.get('/admin/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

router.get('/admin/points/pending', requireAdmin, (req, res) => {
  res.json({ requests: points.listPendingRequests() });
});

router.get('/admin/points/all', requireAdmin, (req, res) => {
  res.json({ requests: points.listAllRequests() });
});

router.post('/admin/points/:id/approve', requireAdmin, (req, res) => {
  try {
    const row = points.approveRequest(Number(req.params.id), req.body.note);
    res.json({ request: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/admin/points/:id/reject', requireAdmin, (req, res) => {
  try {
    const row = points.rejectRequest(Number(req.params.id), req.body.note);
    res.json({ request: row });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------- 회원관리 ---------- */
router.get('/admin/stats', requireAdmin, (req, res) => {
  res.json(users.adminStats());
});

router.get('/admin/users', requireAdmin, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = 30;
  const search = (req.query.search || '').trim();
  const list = users.listAll({ search, limit, offset: (page - 1) * limit });
  const total = users.countAll({ search });
  res.json({ users: list, total, page, pageCount: Math.max(1, Math.ceil(total / limit)) });
});

router.post('/admin/users/:id/points', requireAdmin, (req, res) => {
  try {
    const delta = Number(req.body.delta);
    const balance = points.adminAdjust(Number(req.params.id), delta, req.body.reason);
    res.json({ pointBalance: balance });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/admin/users/:id/status', requireAdmin, (req, res) => {
  try {
    const user = users.setStatus(Number(req.params.id), req.body.status);
    res.json({ user });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* 완료된 주문 최근 내역 — 건별 실제 LLM 원가(llm_cost_usd)를 판매가(PRICES)와 함께
   보여줘서 상품별 마진을 한눈에 확인하는 용도. result_path가 실제로 디스크(영구
   디스크)에 남아있는지도 같이 알려줘서 — "이 파일 사라졌나?"를 대표님이 직접
   추측하지 않고 바로 확인할 수 있게 한다. */
router.get('/admin/orders', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const rows = orders.listRecentDone({ limit, offset }).map((o) => {
    let fileExists = false, fileSizeBytes = null;
    if (o.result_path) {
      try {
        const stat = fs.statSync(o.result_path);
        fileExists = true;
        fileSizeBytes = stat.size;
      } catch (e) { /* 파일 없음 — fileExists: false로 둔다 */ }
    }
    return {
      id: o.id, jobId: o.job_id, productKey: o.product_key, label: o.label,
      userEmail: o.user_email, priceKrw: points.PRICES[o.product_key] || null,
      llmCostUsd: o.llm_cost_usd, createdAt: o.created_at, finishedAt: o.finished_at,
      fileExists, fileSizeBytes
    };
  });
  res.json({ orders: rows });
});

/* 관리자가 아무 주문의 결과 파일이나 직접 받아볼 수 있게(고객 지원·확인용) —
   일반 다운로드(/api/download/:jobId)는 그 주문의 소유자만 받을 수 있어 관리자도
   막힌다. */
router.get('/admin/download/:jobId', requireAdmin, (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || !order.result_path) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  if (!fs.existsSync(order.result_path)) return res.status(410).json({ error: '파일이 서버에 없습니다.' });
  res.download(order.result_path);
});

/* 디스크 용량 관리용 — 특정 주문의 결과 파일(디렉터리 전체)만 지운다. DB의 orders
   행 자체는 건드리지 않는다(주문 이력은 남기고 실제 파일만 정리하는 용도). */
router.delete('/admin/orders/:jobId/file', requireAdmin, (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  if (!order.result_path) return res.json({ ok: true });
  try {
    fs.rmSync(path.dirname(order.result_path), { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '파일 삭제 실패: ' + e.message });
  }
});

/* 상품별 원가 요약 — 건수/평균/합계. 판매가(PRICES)를 같이 내려줘서 마진율 계산은
   프론트에서 한다. /admin/orders/:jobId보다 먼저 등록해야 "cost-summary"가 jobId로
   잘못 매칭되지 않는다. */
router.get('/admin/orders/cost-summary', requireAdmin, (req, res) => {
  const rows = orders.costSummaryByProduct().map((r) => ({
    productKey: r.product_key, count: r.count,
    totalCostUsd: r.total_cost_usd, avgCostUsd: r.avg_cost_usd,
    priceKrw: points.PRICES[r.product_key] || null
  }));
  res.json({ summary: rows });
});

/* 주문 하나의 전체 상세(에러 메시지 포함)를 본다 — PDF 생성 실패 원인을 눈으로
   확인할 때 쓴다. /api/orders/mine은 statusLabel만 주고 원본 error는 안 준다. */
router.get('/admin/orders/:jobId', requireAdmin, (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  res.json({ order });
});

module.exports = router;
