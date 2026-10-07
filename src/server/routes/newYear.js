'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeSaju } = require('../../engine');
const { generateNewYearReading, toPlainText } = require('../../llm/newYearReading');
const { costUsd } = require('../../llm/client');
const { renderNewYearHtml } = require('../../pdf/renderNewYearHtml');
const { newYearWebHtml } = require('../../pdf/newYearVisuals');
const { renderNewYearCard } = require('../../pdf/renderNewYearCard');
const { renderPdf } = require('../../pdf/renderPdf');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { refundPurchase } = require('../refundPurchase');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');
const config = require('../../config/newYear');
const { OUTPUT_ROOT } = require('../../config/outputDir');

const router = express.Router();

router.get('/newyear/config', (req, res) => {
  if (!config.enabled) return res.sendStatus(404);
  res.set('Cache-Control', 'private, no-store').json({ year: config.year, priceKrw: config.priceKrw });
});

function parseBody(body = {}) {
  const year = Number(body.year), month = Number(body.month), day = Number(body.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || !year || !month || !day) {
    throw new Error('생년월일을 올바르게 입력해주세요.');
  }
  const hourGiven = body.hourUnknown !== true && body.hourUnknown !== 'true' && body.hourUnknown !== 'on';
  const hour = hourGiven && body.hour !== '' && body.hour != null ? Number(body.hour) : null;
  const minute = hourGiven && body.minute !== '' && body.minute != null ? Number(body.minute) : 0;
  const gender = body.gender === '남' || body.gender === '여' ? body.gender : null;
  return {
    input: {
      year, month, day, hour, minute, gender,
      isLunar: body.calendar === '음력',
      isLeap: body.isLeap === true || body.isLeap === 'true' || body.isLeap === 'on'
    },
    name: String(body.name || '').slice(0, 30), gender
  };
}

function validateReading(reading) {
  const missing = [];
  if (!reading.overall) missing.push('총운');
  if ((reading.monthNotes || []).length !== 12) missing.push('월별 풀이');
  for (const key of ['wealth', 'career', 'love', 'health']) if (!reading.topics || !reading.topics[key]) missing.push(key);
  if ((reading.quarterDos || []).length !== 4) missing.push('분기별 할 것');
  if ((reading.quarterDonts || []).length !== 4) missing.push('분기별 피할 것');
  if (missing.length) throw new Error('필수 풀이 항목이 완성되지 않았습니다: ' + missing.join(', '));
}

async function startNewYear(userId, body) {
  if (!config.enabled) throw new HttpError(404, { error: '상품을 준비 중입니다.' });

  let parsed;
  try { parsed = parseBody(body); }
  catch (e) { throw new HttpError(400, { error: e.message }); }

  let engine;
  try { engine = computeSaju(parsed.input); }
  catch (e) { throw new HttpError(400, { error: '명식 계산 실패: ' + e.message }); }

  const productKey = config.productKey;
  const pending = orders.findPendingByUserAndProduct(userId, productKey);
  if (pending) {
    throw new HttpError(409, {
      error: '2027년 신년운세를 이미 생성 중이에요. 완료될 때까지 기다려주세요.',
      code: 'already_pending', jobId: pending.job_id
    });
  }

  const person = { name: parsed.name, gender: parsed.gender };
  const jobId = crypto.randomUUID();
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, productKey, {
      label: '2027년 신년운세' + (person.name ? ' — ' + person.name : ''), jobId
    });
  } catch (e) {
    if (e.code === 'insufficient_points') {
      throw new HttpError(402, { error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    throw new HttpError(500, { error: '주문을 만드는 중 오류가 발생했습니다.' });
  }

  let jobDir;
  try {
    jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (e) {
    orders.markError(jobId, e.message || String(e));
    refundPurchase(userId, price, '신년운세 생성 준비 실패 환불', jobId);
    throw new HttpError(500, { error: '생성 준비 중 오류가 발생했습니다.' });
  }

  orders.updateStatus(jobId, 'generating');
  generateNewYearReading(engine, person)
    .then(async (reading) => {
      validateReading(reading);
      orders.updateStatus(jobId, 'rendering');
      const html = renderNewYearHtml(engine, person, reading);
      const pdfPath = path.join(jobDir, 'new-year-report.pdf');
      await renderPdf(html, pdfPath, { name: person.name, label: '2027년 신년운세' });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 파일 생성 확인 실패');

      let cardPath = null;
      try {
        const candidate = path.join(jobDir, 'new-year-card.png');
        await renderNewYearCard(person, reading, candidate);
        if (fs.existsSync(candidate)) cardPath = candidate;
      } catch (e) {
        console.error('[newYear] 공유 카드 생성 실패(주문은 계속):', e.message);
      }

      const resultVisual = newYearWebHtml(reading);
      orders.markDone(jobId, {
        resultPath: pdfPath, cardPath, llmCostUsd: costUsd(reading.usage),
        resultText: toPlainText(reading), resultVisual
      });
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      refundPurchase(userId, price, '2027년 신년운세 생성 실패 환불', jobId);
    });

  return { jobId, title: '2027년 신년운세' };
}

router.post('/newyear', requireAuth, handle(startNewYear));

module.exports = router;
module.exports.start = startNewYear;
module.exports.parseBody = parseBody;
module.exports.validateReading = validateReading;
