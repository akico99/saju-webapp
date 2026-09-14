'use strict';
/* 궁합 리포트 — generate.js와 같은 job 패턴(비동기 생성, orders 테이블에 상태 기록)을
   그대로 따른다. /api/download/:jobId 라우트는 orders.result_path만 보므로 그대로 재사용 가능. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeSaju } = require('../../engine/index');
const { analyzeCompatibility } = require('../../engine/compatibility');
const { generateCompatReport } = require('../../llm/generateCompatReport');
const { costUsd } = require('../../llm/client');
const { renderCompatHtml } = require('../../pdf/renderCompatHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const { safeName } = require('../../pdf/personName');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const { OUTPUT_ROOT } = require('../../config/outputDir');

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

  const personA = { name: personAInput.name };
  const personB = { name: personBInput.name };
  const compat = analyzeCompatibility(engineA, engineB);
  const jobId = crypto.randomUUID();
  const label = `궁합 리포트 — ${personA.name || '본인'} · ${personB.name || '상대방'}`;

  let price;
  try {
    price = points.chargeForProductAndCreateOrder(req.session.userId, 'compat', { label, jobId });
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(500).json({ error: '결제 처리 중 오류가 발생했습니다. 포인트는 차감되지 않았습니다.' });
  }

  let jobDir;
  try {
    jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (e) {
    orders.markError(jobId, e.message || String(e));
    points.refund(req.session.userId, price, '생성 준비 실패 환불: compat', jobId);
    return res.status(500).json({ error: '생성 준비 중 오류가 발생했습니다. 포인트는 환불되었습니다.' });
  }

  res.json({ jobId, compatSummary: { score: compat.score } });

  orders.updateStatus(jobId, 'generating');
  generateCompatReport(engineA, engineB, personA, personB, compat)
    .then(async ({ text, usage }) => {
      orders.updateStatus(jobId, 'rendering');
      const html = renderCompatHtml(engineA, engineB, personA, personB, compat, text);
      const pdfPath = path.join(jobDir, 'compat-report.pdf');
      await renderPdf(html, pdfPath, { name: `${safeName(personA.name, '본인')} · ${safeName(personB.name, '상대방')}` });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 파일 생성 확인 실패');
      orders.markDone(jobId, { resultPath: pdfPath, llmCostUsd: costUsd(usage) });
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      points.refund(req.session.userId, price, '생성 실패 환불: compat', jobId);
    });
});

module.exports = router;
