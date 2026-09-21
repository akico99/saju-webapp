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
const { RELATIONS, normalizeRelation } = require('../../llm/compatOutlines');
const { costUsd } = require('../../llm/client');
const { renderCompatHtml } = require('../../pdf/renderCompatHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const { safeName } = require('../../pdf/personName');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');

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

/** 궁합 리포트 시작 — 라우트(/api/compat)와 카드 결제 승인(pay.js)이 같은 함수를 쓴다. */
async function startCompat(userId, body) {
  let personAInput, personBInput;
  try {
    personAInput = parsePerson(body, 'a');
    personBInput = parsePerson(body, 'b');
  } catch (e) {
    throw new HttpError(400, { error: e.message });
  }

  let engineA, engineB;
  try {
    engineA = computeSaju(personAInput.input);
    engineB = computeSaju(personBInput.input);
  } catch (e) {
    throw new HttpError(400, { error: '명식 계산 실패: ' + e.message });
  }

  // 이미 생성 중인 같은 상품이 있으면 또 결제/생성하지 않는다.
  const pending = orders.findPendingByUserAndProduct(userId, 'compat');
  if (pending) {
    throw new HttpError(409, {
      error: '이미 생성 중인 궁합 리포트가 있어요. 완료될 때까지 잠시만 기다려주세요.',
      code: 'already_pending', jobId: pending.job_id
    });
  }

  const personA = { name: personAInput.name };
  const personB = { name: personBInput.name };
  const compat = analyzeCompatibility(engineA, engineB);
  // 관계 유형에 따라 볼 자리가 다르다(연애=끌림·다툼, 부부=살림, 재회=어긋난 구조). 골격이 여기서 갈린다.
  const relation = normalizeRelation(body.relation);
  const jobId = crypto.randomUUID();
  const label = `궁합 리포트(${RELATIONS[relation].label}) — ${personA.name || '본인'} · ${personB.name || '상대방'}`;

  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, 'compat', { label, jobId });
  } catch (e) {
    if (e.code === 'insufficient_points') {
      throw new HttpError(402, { error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    throw new HttpError(500, { error: '결제 처리 중 오류가 발생했습니다. 포인트는 차감되지 않았습니다.' });
  }

  let jobDir;
  try {
    jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (e) {
    orders.markError(jobId, e.message || String(e));
    points.refund(userId, price, '생성 준비 실패 환불: compat', jobId);
    throw new HttpError(500, { error: '생성 준비 중 오류가 발생했습니다. 포인트는 환불되었습니다.' });
  }

  const payload = ({ jobId, compatSummary: { score: compat.score } });

  orders.updateStatus(jobId, 'generating');
  generateCompatReport(engineA, engineB, personA, personB, compat, relation)
    .then(async ({ text, usage }) => {
      orders.updateStatus(jobId, 'rendering');
      const html = renderCompatHtml(engineA, engineB, personA, personB, compat, text, relation);
      const pdfPath = path.join(jobDir, 'compat-report.pdf');
      await renderPdf(html, pdfPath, { name: `${safeName(personA.name, '본인')} · ${safeName(personB.name, '상대방')}` });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 파일 생성 확인 실패');
      orders.markDone(jobId, { resultPath: pdfPath, llmCostUsd: costUsd(usage) });
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      points.refund(userId, price, '생성 실패 환불: compat', jobId);
    });
  return payload;
}

router.post('/compat', requireAuth, handle(startCompat));

module.exports = router;
module.exports.start = startCompat;
