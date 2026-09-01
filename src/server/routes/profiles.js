'use strict';
/* 저장된 인물 정보(나/배우자/자녀 등 여러 명) CRUD — 로그인한 본인 것만 조회/수정/삭제 가능. */
const express = require('express');
const savedProfiles = require('../../db/savedProfiles');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/profiles', requireAuth, (req, res) => {
  res.json({ profiles: savedProfiles.listMine(req.session.userId) });
});

router.post('/profiles', requireAuth, (req, res) => {
  try {
    if (!Number(req.body.birthYear) || !Number(req.body.birthMonth) || !Number(req.body.birthDay)) {
      return res.status(400).json({ error: '생년월일을 올바르게 입력해주세요.' });
    }
    const profile = savedProfiles.create(req.session.userId, req.body);
    res.json({ profile });
  } catch (e) {
    res.status(e.code === 'limit_exceeded' ? 409 : 400).json({ error: e.message });
  }
});

router.put('/profiles/:id', requireAuth, (req, res) => {
  try {
    if (!Number(req.body.birthYear) || !Number(req.body.birthMonth) || !Number(req.body.birthDay)) {
      return res.status(400).json({ error: '생년월일을 올바르게 입력해주세요.' });
    }
    const profile = savedProfiles.update(req.session.userId, Number(req.params.id), req.body);
    res.json({ profile });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/profiles/:id', requireAuth, (req, res) => {
  try {
    savedProfiles.remove(req.session.userId, Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
