'use strict';
/* 관리자(=운영자 본인) 전용 — 포인트 충전 신청을 눈으로 확인하고 승인/거절한다.
   별도 로그인(ADMIN_PASSWORD)이며 일반 사용자 세션과는 완전히 분리되어 있다. */
const express = require('express');
const points = require('../../db/points');
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

module.exports = router;
