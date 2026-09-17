'use strict';
/* 무료 미니 리딩 API — 로그인·포인트 없이, LLM 없이 즉시 응답한다.
   오늘의 운세 미리보기(fortune.js)와 같은 입력 규칙을 쓴다. */
const express = require('express');
const { readFree, KINDS } = require('../../engine/freeReadings');

const router = express.Router();

function parseBirth(body) {
  const year = Number(body.year), month = Number(body.month), day = Number(body.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');
  const hourGiven = body.hourUnknown !== 'true' && body.hourUnknown !== true && body.hourUnknown !== 'on';
  const hour = hourGiven && body.hour !== '' && body.hour != null ? Number(body.hour) : null;
  const minute = hourGiven && body.minute !== '' && body.minute != null ? Number(body.minute) : 0;
  return {
    year, month, day, hour, minute,
    gender: body.gender === '여' || body.gender === '남' ? body.gender : null,
    isLunar: body.calendar === '음력', isLeap: !!body.isLeap, city: body.city || null
  };
}

router.post('/free/:kind', (req, res) => {
  const { kind } = req.params;
  if (!KINDS.includes(kind)) return res.status(404).json({ error: '없는 리딩입니다.' });
  let birth;
  try { birth = parseBirth(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    res.json({ reading: readFree(kind, birth) });
  } catch (e) {
    res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }
});

module.exports = router;
