'use strict';
/* 관리자(=운영자 본인) 전용 — 포인트 충전 신청을 눈으로 확인하고 승인/거절하고, 회원을
   검색·조회하고, 포인트를 수동으로 조정하거나 계정을 정지시킨다.
   별도 로그인(ADMIN_PASSWORD)이며 일반 사용자 세션과는 완전히 분리되어 있다. */
const express = require('express');
const points = require('../../db/points');
const users = require('../../db/users');
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

module.exports = router;
