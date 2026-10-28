'use strict';
/* 2027 신년운세 — 무료 첫 장(/api/newyear/preview, 로그인·AI 호출 없음)과 유료 웹/PDF 생성(/api/newyear).
   PDF 완성 뒤 결제 전에 받은 수신 주소로 보낸다. 메일 실패는 결과를 유지하고, 인증된 주문 소유자에게만
   재전송(/api/newyear/:jobId/delivery)을 허용한다. 구조는 routes/love.js와 같다. */
const express = require('express');
const { sajuChartHtml } = require('../../pdf/sajuChart');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OUTPUT_ROOT } = require('../../config/outputDir');
const { computeSaju } = require('../../engine');
const { validateBirth } = require('../../engine/loveTiming');
const { generateNewYearReading, buildNewYearPreview, toPlainText } = require('../../llm/newYearReading');
const { costUsd } = require('../../llm/client');
const { renderNewYearHtml } = require('../../pdf/renderNewYearHtml');
const { newYearWebHtml } = require('../../pdf/newYearVisuals');
const { renderPdf } = require('../../pdf/renderPdf');
const delivery = require('../../db/reportDelivery');
const { deliverReport } = require('../../email/loveReport');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { refundPurchase } = require('../refundPurchase');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');
const config = require('../../config/newYear');

const router = express.Router();
const LABEL = config.year + '년 신년운세';

// 꺼져 있으면 이 라우터의 모든 경로가 404다. app.js 게이트를 어떤 경로 변형으로 비켜 와도 여기서 한 번 더 막는다.
router.use('/newyear', (req, res, next) => (config.enabled ? next() : res.sendStatus(404)));

router.get('/newyear/config', (req, res) => {
  res.set('Cache-Control', 'private, no-store').json({ year: config.year, priceKrw: config.priceKrw });
});

// 숫자 칸 — 빈 값은 NaN으로 두고 검사(validateBirth)가 거른다. "5.5"는 소수로 남아 정수 검사에 걸린다.
const num = (v) => (v === '' || v == null ? NaN : Number(v));

function parseBody(body) {
  body = body || {};
  const year = num(body.year), month = num(body.month), day = num(body.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');
  const unknown = body.hourUnknown === true || body.hourUnknown === 'true' || body.hourUnknown === 'on';
  const hour = !unknown && body.hour !== '' && body.hour != null ? num(body.hour) : null;
  const minute = hour != null && body.minute !== '' && body.minute != null ? num(body.minute) : 0;
  const gender = body.gender === '여' || body.gender === '남' ? body.gender : null;
  if (!gender) throw new Error('성별을 골라 주세요. 신년운세 계산에 쓰여요.');
  const parsed = {
    // 이름은 주문 이름·화면 표시·프롬프트에 들어간다. 태그 기호·제어문자·줄바꿈·마크다운 기호를 뺀다.
    name: String(body.name || '').replace(/[\u0000-\u001f\u007f<>#*\u0060]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20),
    gender,
    birth: { year, month, day, hour, minute, gender, isLunar: body.calendar === '음력', isLeap: body.isLeap === true || body.isLeap === 'on' || body.isLeap === 'true' }
  };
  validateBirth(parsed.birth);
  return parsed;
}

router.post('/newyear/preview', (req, res) => {
  let parsed;
  try { parsed = parseBody(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    res.set('Cache-Control', 'no-store').json({ reading: { ...buildNewYearPreview(parsed.birth), chart: sajuChartHtml(computeSaju(parsed.birth)) } });
  } catch (e) {
    res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }
});

async function startNewYear(userId, body, { cardPaymentId } = {}) {
  if (!config.enabled) throw new HttpError(404, { error: '상품을 준비 중입니다.' });
  let parsed;
  try { parsed = parseBody(body); } catch (e) { throw new HttpError(400, { error: e.message }); }
  let email;
  try { email = delivery.parseDelivery(body); } catch (e) { throw new HttpError(400, { error: e.message }); }

  let engine;
  try { engine = computeSaju(parsed.birth); } catch (e) { throw new HttpError(400, { error: '명식 계산 실패: ' + e.message }); }

  const productKey = config.productKey;
  const pending = orders.findPendingByUserAndProduct(userId, productKey);
  if (pending) {
    throw new HttpError(409, { error: '이미 만들고 있는 ' + LABEL + '가 있어요. 완료될 때까지 잠시만 기다려 주세요.', code: 'already_pending', jobId: pending.job_id });
  }

  const person = { name: parsed.name, gender: parsed.gender };
  const jobId = crypto.randomUUID();
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, productKey, { label: LABEL + (person.name ? ' — ' + person.name : ''), jobId, cardPaymentId });
  } catch (e) {
    if (e.code === 'insufficient_points') {
      throw new HttpError(402, { error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    throw new HttpError(500, { error: '주문을 만드는 중 오류가 발생했습니다.' });
  }

  let jobDir;
  try {
    delivery.create(jobId, email);
    jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (e) {
    orders.markError(jobId, 'PDF 생성 준비 실패');
    refundPurchase(userId, price, '생성 준비 실패 환불: ' + productKey, jobId);
    throw new HttpError(500, { error: '리포트 생성 준비에 실패했어요.' });
  }

  orders.updateStatus(jobId, 'generating');
  generateNewYearReading(engine, person)
    .then(async (reading) => {
      orders.updateStatus(jobId, 'rendering');
      const pdfPath = path.join(jobDir, 'new-year-report.pdf');
      await renderPdf(renderNewYearHtml(engine, person, reading), pdfPath, { name: person.name, label: LABEL });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 생성 확인 실패');
      orders.markDone(jobId, {
        resultPath: pdfPath, cardPath: null, llmCostUsd: costUsd(reading.usage),
        resultText: toPlainText(reading), resultVisual: sajuChartHtml(engine) + newYearWebHtml(reading)
      });
      // 발송 실패는 완성된 유료 결과를 오류/환불 상태로 바꾸지 않는다.
      await deliverReport(jobId).catch(() => {});
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      refundPurchase(userId, price, '생성 실패 환불: ' + productKey, jobId);
    });

  return { jobId, title: LABEL };
}

router.post('/newyear', requireAuth, handle(startNewYear));

router.post('/newyear/:jobId/delivery', requireAuth, async (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || order.user_id !== req.session.userId || order.product_key !== config.productKey) return res.sendStatus(404);
  if (order.status !== 'done' || !order.result_path) return res.status(409).json({ error: 'PDF가 아직 준비되지 않았어요.' });
  await deliverReport(order.job_id);
  return res.json({ delivery: delivery.publicState(order.job_id) });
});

module.exports = router;
module.exports.start = startNewYear;
module.exports.parseBody = parseBody;
