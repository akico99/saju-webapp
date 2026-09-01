'use strict';
const express = require('express');
const users = require('../../db/users');
const savedProfiles = require('../../db/savedProfiles');
const { getTodayFortune } = require('../../engine/todayFortune');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// "오늘의 운세"는 저장된 인물 중 "내 정보"(primary)로 지정된 한 명을 기준으로 계산한다.
// 예전엔 마이페이지에 별도 "생년월일시 저장" 필드(users 테이블)가 있었는데, 그 값이 있고
// 아직 저장된 인물이 하나도 없는 계정은 여기서 한 번 자동으로 이관해서 데이터를 잃지 않는다.
router.get('/today-fortune', requireAuth, (req, res) => {
  const primary = savedProfiles.migrateLegacyBirthIfNeeded(req.session.userId, users.findById(req.session.userId));
  if (!primary) {
    return res.status(400).json({ error: '내 정보가 아직 등록되지 않았어요. "저장된 인물"에서 먼저 등록해주세요.' });
  }
  try {
    const fortune = getTodayFortune({
      year: primary.birthYear, month: primary.birthMonth, day: primary.birthDay,
      hour: primary.birthHour, minute: primary.birthMinute,
      gender: primary.gender, isLunar: primary.isLunar, isLeap: primary.isLeap, city: primary.city
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
