'use strict';
const express = require('express');
const users = require('../../db/users');
const { getTodayFortune } = require('../../engine/todayFortune');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/today-fortune', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  if (!user.birth_year) {
    return res.status(400).json({ error: '생년월일 정보가 없습니다. 프로필에서 먼저 등록해주세요.' });
  }
  try {
    const fortune = getTodayFortune({
      year: user.birth_year, month: user.birth_month, day: user.birth_day,
      hour: user.birth_hour, minute: user.birth_minute,
      gender: user.gender, isLunar: !!user.is_lunar, isLeap: !!user.is_leap, city: user.city
    });
    res.json({ fortune });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 무로그인 미리보기 — 로그인/저장 없이 그 자리에서 입력한 생년월일로 오늘의 운세만 보여준다.
// (외부 링크로 막 들어온 사람이 로그인 장벽 없이 "일단 체험"할 수 있게 하기 위한 전용 엔드포인트)
router.post('/today-fortune-preview', (req, res) => {
  const { year, month, day } = req.body;
  if (!Number(year) || !Number(month) || !Number(day)) {
    return res.status(400).json({ error: '생년월일을 올바르게 입력해주세요.' });
  }
  const hourGiven = req.body.hourUnknown !== 'true' && req.body.hourUnknown !== true;
  try {
    const fortune = getTodayFortune({
      year: Number(year), month: Number(month), day: Number(day),
      hour: hourGiven && req.body.hour !== '' && req.body.hour != null ? Number(req.body.hour) : null,
      minute: hourGiven && req.body.minute !== '' && req.body.minute != null ? Number(req.body.minute) : 0,
      gender: req.body.gender === '여' || req.body.gender === '남' ? req.body.gender : null,
      isLunar: req.body.calendar === '음력', isLeap: !!req.body.isLeap, city: req.body.city || null
    });
    res.json({ fortune });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
