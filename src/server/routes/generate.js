'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../../engine/index');
const { createJob, updateJob } = require('../../jobs/jobManager');
const { generateReport } = require('../../llm/generateReport');
const { renderHtml } = require('../../pdf/renderHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const { renderCardHtml, renderCardImage } = require('../../pdf/renderCard');
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
  const lonOff = !!body.noLonCorrection;
  const city = body.city || null;
  const lon = body.lon ? Number(body.lon) : null;
  const name = (body.name || '').slice(0, 30);
  return { year, month, day, hour, minute, gender, isLunar, isLeap, lonOff, city, lon, name };
}

router.post('/generate', requireAuth, async (req, res) => {
  let input;
  try {
    input = parseBody(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  let engineResult;
  try {
    engineResult = computeSaju(input);
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }

  // 이미 생성 중인 같은 상품이 있으면 또 결제/생성하지 않는다.
  const pending = orders.findPendingByUserAndProduct(req.session.userId, 'full');
  if (pending) {
    return res.status(409).json({
      error: '이미 생성 중인 평생사주 리포트가 있어요. 완료될 때까지 잠시만 기다려주세요.',
      code: 'already_pending', jobId: pending.job_id
    });
  }

  let price;
  try {
    price = points.chargeForProduct(req.session.userId, 'full');
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(400).json({ error: e.message });
  }

  const jobId = createJob();
  const jobDir = path.join(OUTPUT_ROOT, jobId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(path.join(jobDir, 'engine.json'), JSON.stringify(engineResult, null, 2));

  const person = { name: input.name, gender: engineResult.meta.genderGiven ? input.gender : null };
  orders.createOrder({
    userId: req.session.userId, productKey: 'full',
    label: `평생사주 100p 정식 리포트${person.name ? ` — ${person.name}` : ''}`, jobId
  });

  res.json({
    jobId,
    engineSummary: {
      palja: engineResult.palja,
      ilgan: engineResult.ilgan,
      strength: engineResult.strength.verdict,
      kyukguk: engineResult.kyukguk.name,
      yongshin: engineResult.yongshin.final.main,
      warnings: engineResult.meta.warnings
    }
  });

  // 이후 LLM 생성 + PDF 렌더는 비동기로 진행 (응답은 이미 보냄)
  updateJob(jobId, { status: 'generating' });
  generateReport(engineResult, person, jobDir, (progress) => {
    updateJob(jobId, { progress });
  })
    .then(async (chapters) => {
      updateJob(jobId, { status: 'rendering' });
      const html = renderHtml(engineResult, chapters, person);
      const pdfPath = path.join(jobDir, 'report.pdf');
      await renderPdf(html, pdfPath, person);

      // 3초 요약 카드 — 본편 PDF를 보내기 전에 당근마켓/카톡으로 먼저 공유할 미리보기 이미지
      const cardPath = path.join(jobDir, 'summary-card.png');
      const cardHtml = renderCardHtml(engineResult, person);
      await renderCardImage(cardHtml, cardPath);

      updateJob(jobId, { status: 'done', resultPath: pdfPath, cardPath });
      orders.markDone(jobId, { resultPath: pdfPath, cardPath });
    })
    .catch((e) => {
      updateJob(jobId, { status: 'error', error: e.message });
      orders.markError(jobId, e.message);
      points.refund(req.session.userId, price, '생성 실패 환불: full');
    });
});

module.exports = router;
