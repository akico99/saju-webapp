'use strict';
/* 마이크로 리딩(단일 주제) — generate.js/compat.js와 같은 job 패턴을 따른다. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../../engine/index');
const { createJob, updateJob } = require('../../jobs/jobManager');
const { generateQuickReading, QUICK_TOPICS } = require('../../llm/quickReading');
const { renderQuickHtml } = require('../../pdf/renderQuickHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const OUTPUT_ROOT = path.join(__dirname, '..', '..', '..', 'output');

function parseBody(body) {
  const year = Number(body.year), month = Number(body.month), day = Number(body.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');
  const hourGiven = body.hourUnknown !== 'true' && body.hourUnknown !== true;
  const hour = hourGiven && body.hour !== '' && body.hour != null ? Number(body.hour) : null;
  const minute = hourGiven && body.minute !== '' && body.minute != null ? Number(body.minute) : 0;
  const gender = body.gender === '여' || body.gender === '남' ? body.gender : null;
  const isLunar = body.calendar === '음력';
  const isLeap = !!body.isLeap;
  const name = (body.name || '').slice(0, 30);
  const topic = body.topic;
  if (!QUICK_TOPICS[topic]) throw new Error('주제를 선택해주세요.');
  return { input: { year, month, day, hour, minute, gender, isLunar, isLeap }, name, gender, topic };
}

router.post('/quick', requireAuth, async (req, res) => {
  let parsed;
  try {
    parsed = parseBody(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let engineResult;
  try {
    engineResult = computeSaju(parsed.input);
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }

  // 이미 생성 중인 같은 상품이 있으면 또 결제/생성하지 않는다 — 프론트에서 버튼을
  // 잠가도(setFormBusy) 여러 탭이나 직접 API 호출까지는 못 막으므로 서버에서 한 번 더 막는다.
  const pending = orders.findPendingByUserAndProduct(req.session.userId, 'quick');
  if (pending) {
    return res.status(409).json({
      error: '이미 생성 중인 빠른 리딩이 있어요. 완료될 때까지 잠시만 기다려주세요.',
      code: 'already_pending', jobId: pending.job_id
    });
  }

  let price;
  try {
    price = points.chargeForProduct(req.session.userId, 'quick');
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  const person = { name: parsed.name, gender: parsed.gender };
  const jobId = createJob();
  const jobDir = path.join(OUTPUT_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const topicLabel = QUICK_TOPICS[parsed.topic].label;
  orders.createOrder({
    userId: req.session.userId, productKey: 'quick',
    label: `${topicLabel} 빠른 리딩${person.name ? ` — ${person.name}` : ''}`, jobId
  });

  res.json({ jobId, topic: topicLabel });

  updateJob(jobId, { status: 'generating' });
  generateQuickReading(engineResult, person, parsed.topic)
    .then(async ({ title, text }) => {
      updateJob(jobId, { status: 'rendering' });
      const html = renderQuickHtml(engineResult, person, title, text);
      const pdfPath = path.join(jobDir, 'quick-report.pdf');
      await renderPdf(html, pdfPath, { name: person.name, label: title });
      updateJob(jobId, { status: 'done', resultPath: pdfPath });
      orders.markDone(jobId, { resultPath: pdfPath });
    })
    .catch((e) => {
      updateJob(jobId, { status: 'error', error: e.message });
      orders.markError(jobId, e.message);
      points.refund(req.session.userId, price, '생성 실패 환불: quick');
    });
});

module.exports = router;
