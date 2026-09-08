'use strict';
/* consult.html(카카오톡 상담 랜딩페이지) 정보입력 폼 접수 + 관리자 조회.
   결제·리포트 생성은 여기서 하지 않는다 — 카카오톡 채널에서 계좌이체로 결제받고,
   확인되면 관리자가 직접 평생사주 생성 폼으로 리포트를 만들어 전달하는 수동 흐름이다. */
const express = require('express');
const leads = require('../../db/leads');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/leads', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 50);
  const gender = b.gender === '여' ? '여' : b.gender === '남' ? '남' : null;
  const birthYear = Number(b.birthYear) || null;
  const birthMonth = Number(b.birthMonth) || null;
  const birthDay = Number(b.birthDay) || null;
  const hourUnknown = !!b.hourUnknown;
  const birthHour = hourUnknown ? null : (Number.isFinite(Number(b.birthHour)) && b.birthHour !== '' ? Number(b.birthHour) : null);
  const birthMinute = hourUnknown ? null : (Number.isFinite(Number(b.birthMinute)) && b.birthMinute !== '' ? Number(b.birthMinute) : null);
  const isLunar = !!b.isLunar;
  const concern = String(b.concern || '').trim().slice(0, 1000);
  const contact = String(b.contact || '').trim().slice(0, 100);

  if (!birthYear || !birthMonth || !birthDay) {
    return res.status(400).json({ error: '생년월일을 입력해주세요.' });
  }

  const id = leads.createLead({
    name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute,
    hourUnknown, isLunar, concern, contact
  });
  res.json({ ok: true, id });
});

router.get('/admin/leads', requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const offset = Number(req.query.offset) || 0;
  res.json({ leads: leads.listRecent({ limit, offset }) });
});

router.post('/admin/leads/:id/status', requireAdmin, (req, res) => {
  leads.setStatus(Number(req.params.id), String(req.body.status || 'new'));
  res.json({ ok: true });
});

module.exports = router;
