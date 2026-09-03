'use strict';
/* 궁합 리포트 — generate.js와 같은 job 패턴(비동기 생성 + jobManager)을 그대로 따른다.
   /api/download/:jobId 라우트는 jobManager의 resultPath만 보므로 그대로 재사용 가능. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../../engine/index');
const { analyzeCompatibility } = require('../../engine/compatibility');
const { createJob, updateJob } = require('../../jobs/jobManager');
const { generateCompatReport } = require('../../llm/generateCompatReport');
const { renderCompatHtml } = require('../../pdf/renderCompatHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const { safeName } = require('../../pdf/personName');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const OUTPUT_ROOT = path.join(__dirname, '..', '..', '..', 'output');

function parsePerson(body, prefix) {
  const year = Number(body[`${prefix}Year`]), month = Number(body[`${prefix}Month`]), day = Number(body[`${prefix}Day`]);
  if (!year || !month || !day) throw new Error(`${prefix === 'a' ? '본인' : '상대방'} 생년월일을 올바르게 입력해주세요.`);
  const hourGiven = body[`${prefix}HourUnknown`] !== 'true' && body[`${prefix}HourUnknown`] !== true;
  const hour = hourGiven && body[`${prefix}Hour`] !== '' && body[`${prefix}Hour`] != null ? Number(body[`${prefix}Hour`]) : null;
  const minute = hourGiven && body[`${prefix}Minute`] !== '' && body[`${prefix}Minute`] != null ? Number(body[`${prefix}Minute`]) : 0;
  const gender = body[`${prefix}Gender`] === '여' || body[`${prefix}Gender`] === '남' ? body[`${prefix}Gender`] : null;
  const isLunar = body[`${prefix}Calendar`] === '음력';
  const isLeap = !!body[`${prefix}IsLeap`];
  const name = (body[`${prefix}Name`] || '').slice(0, 30);
  return { input: { year, month, day, hour, minute, gender, isLunar, isLeap }, name };
}

router.post('/compat', requireAuth, async (req, res) => {
  let personAInput, personBInput;
  try {
    personAInput = parsePerson(req.body, 'a');
    personBInput = parsePerson(req.body, 'b');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let engineA, engineB;
  try {
    engineA = computeSaju(personAInput.input);
    engineB = computeSaju(personBInput.input);
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }

  // 이미 생성 중인 같은 상품이 있으면 또 결제/생성하지 않는다.
  const pending = orders.findPendingByUserAndProduct(req.session.userId, 'compat');
  if (pending) {
    return res.status(409).json({
      error: '이미 생성 중인 궁합 리포트가 있어요. 완료될 때까지 잠시만 기다려주세요.',
      code: 'already_pending', jobId: pending.job_id
    });
  }

  let price;
  try {
    price = points.chargeForProduct(req.session.userId, 'compat');
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  const personA = { name: personAInput.name };
  const personB = { name: personBInput.name };
  const compat = analyzeCompatibility(engineA, engineB);

  const jobId = createJob();
  const jobDir = path.join(OUTPUT_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  orders.createOrder({
    userId: req.session.userId, productKey: 'compat',
    label: `궁합 리포트 — ${personA.name || '본인'} · ${personB.name || '상대방'}`, jobId
  });

  res.json({ jobId, compatSummary: { score: compat.score } });

  updateJob(jobId, { status: 'generating' });
  generateCompatReport(engineA, engineB, personA, personB, compat)
    .then(async ({ text }) => {
      updateJob(jobId, { status: 'rendering' });
      const html = renderCompatHtml(engineA, engineB, personA, personB, compat, text);
      const pdfPath = path.join(jobDir, 'compat-report.pdf');
      await renderPdf(html, pdfPath, { name: `${safeName(personA.name, '본인')} · ${safeName(personB.name, '상대방')}` });
      updateJob(jobId, { status: 'done', resultPath: pdfPath });
      orders.markDone(jobId, { resultPath: pdfPath });
    })
    .catch((e) => {
      updateJob(jobId, { status: 'error', error: e.message });
      orders.markError(jobId, e.message);
      points.refund(req.session.userId, price, '생성 실패 환불: compat');
    });
});

module.exports = router;
