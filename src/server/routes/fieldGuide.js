'use strict';

const express = require('express');
const { readFieldGuide } = require('../../engine/fieldGuide');

const router = express.Router();

function parseBirth(body) {
  const input = body && typeof body === 'object' ? body : {};
  const year = Number(input.year);
  const month = Number(input.month);
  const day = Number(input.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');

  const hourGiven = input.hourUnknown !== 'true' && input.hourUnknown !== true && input.hourUnknown !== 'on';
  const hour = hourGiven && input.hour !== '' && input.hour != null ? Number(input.hour) : null;
  const minute = hourGiven && input.minute !== '' && input.minute != null ? Number(input.minute) : 0;
  return {
    year,
    month,
    day,
    hour,
    minute,
    gender: input.gender === '여' || input.gender === '남' ? input.gender : null,
    isLunar: input.calendar === '음력',
    isLeap: !!input.isLeap,
    city: input.city || null,
  };
}

router.post('/field-guide', (req, res) => {
  let birth;
  try {
    birth = parseBirth(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 10) : '';
  try {
    return res.json({ guide: readFieldGuide(birth, { name }) });
  } catch (error) {
    return res.status(400).json({ error: `명식 계산 실패: ${error.message}` });
  }
});

module.exports = router;
