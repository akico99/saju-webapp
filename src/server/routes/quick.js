'use strict';
/* 주제별 심층 리딩(3,900원) — generate.js/compat.js와 같은 job 패턴을 따른다.
   URL(/api/quick)과 페이지(quick.html)는 그대로 두고 상품만 바꿨다. 예전 990원 빠른
   리딩(product_key 'quick')은 판매 종료 — 환불·복구용으로 키만 남아 있다. */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeSaju } = require('../../engine/index');
const { generateDeepReading, DEEP_TOPICS, toPlainText } = require('../../llm/deepReading');
const { costUsd } = require('../../llm/client');
const { renderDeepHtml } = require('../../pdf/renderDeepHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');

const router = express.Router();
const { OUTPUT_ROOT } = require('../../config/outputDir');

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
  if (!DEEP_TOPICS[topic]) throw new Error('주제를 선택해주세요.');
  return { input: { year, month, day, hour, minute, gender, isLunar, isLeap }, name, gender, topic };
}

/** 심층 리딩 시작 — 라우트(/api/quick)와 카드 결제 승인(pay.js)이 같은 함수를 쓴다. */
async function startDeep(userId, body) {
  let parsed;
  try {
    parsed = parseBody(body);
  } catch (e) {
    throw new HttpError(400, { error: e.message });
  }

  let engineResult;
  try {
    engineResult = computeSaju(parsed.input);
  } catch (e) {
    throw new HttpError(400, { error: '명식 계산 실패: ' + e.message });
  }

  // 이미 생성 중인 같은 상품이 있으면 또 결제/생성하지 않는다 — 프론트에서 버튼을
  // 잠가도(setFormBusy) 여러 탭이나 직접 API 호출까지는 못 막으므로 서버에서 한 번 더 막는다.
  const productKey = 'deep_' + parsed.topic;
  const pending = orders.findPendingByUserAndProduct(userId, productKey);
  if (pending) {
    throw new HttpError(409, {
      error: '이미 생성 중인 심층 리딩이 있어요. 완료될 때까지 잠시만 기다려주세요.',
      code: 'already_pending', jobId: pending.job_id
    });
  }

  const person = { name: parsed.name, gender: parsed.gender };
  const topicLabel = DEEP_TOPICS[parsed.topic].label;
  const jobId = crypto.randomUUID();
  const label = `${topicLabel} 심층 리딩${person.name ? ` — ${person.name}` : ''}`;

  // 포인트 차감과 주문 생성을 하나의 트랜잭션으로 묶는다 — 둘 중 하나라도 실패하면
  // 전부 롤백되므로, 이 단계에서 실패하면 애초에 차감 자체가 안 일어난 것이라 별도
  // 환불이 필요 없다.
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, productKey, { label, jobId });
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
    points.refund(userId, price, '생성 준비 실패 환불: ' + productKey, jobId);
    throw new HttpError(500, { error: '생성 준비 중 오류가 발생했습니다. 포인트는 환불되었습니다.' });
  }

  const payload = ({ jobId, topic: topicLabel, topicKey: parsed.topic });

  orders.updateStatus(jobId, 'generating');
  generateDeepReading(engineResult, person, parsed.topic)
    .then(async (reading) => {
      orders.updateStatus(jobId, 'rendering');
      const html = renderDeepHtml(engineResult, person, reading);
      const pdfPath = path.join(jobDir, 'deep-report.pdf');
      await renderPdf(html, pdfPath, { name: person.name, label: reading.title });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 파일 생성 확인 실패');
      // PDF와 동일한 풀이를 주문에 보관해 웹에서도 읽을 수 있게 한다. 추가 LLM 호출은 없다.
      orders.markDone(jobId, { resultPath: pdfPath, llmCostUsd: costUsd(reading.usage), resultText: toPlainText(reading) });
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      points.refund(userId, price, '생성 실패 환불: ' + productKey, jobId);
    });
  return payload;
}

router.post('/quick', requireAuth, handle(startDeep));

module.exports = router;
module.exports.start = startDeep;
