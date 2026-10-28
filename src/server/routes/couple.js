'use strict';
/* 두 사람의 궁합(compat_v2, /couple.html) — 무료 첫 장과 유료 웹/PDF 생성. PDF 완성 뒤 입력한 수신 주소로 보낸다.
   기존 궁합(/api/compat, 4,900원)과는 별개 상품이다. 메일 실패는 결과를 유지하고 주문 소유자에게만 재전송을 허용한다. */
const express = require('express');
const { sajuChartHtml } = require('../../pdf/sajuChart');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OUTPUT_ROOT } = require('../../config/outputDir');
const { renderCoupleHtml, coupleWebHtml } = require('../../pdf/renderCoupleHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const delivery = require('../../db/reportDelivery');
const { deliverReport } = require('../../email/loveReport');
const { computeSaju } = require('../../engine/index');
const { validateBirth } = require('../../engine/loveTiming');
const { buildCouplePreview, generateCoupleReading, toPlainText, relationOf, cleanName } = require('../../llm/coupleReading');
const { costUsd } = require('../../llm/client');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { refundPurchase } = require('../refundPurchase');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');
const config = require('../../config/compatV2');

const router = express.Router();

// 꺼져 있으면 이 라우터의 모든 경로가 404다. app.js 게이트를 경로 변형으로 비켜 와도 여기서 한 번 더 막는다.
router.use('/couple', (req, res, next) => (config.enabled ? next() : res.sendStatus(404)));

const num = (v) => (v === '' || v == null ? NaN : Number(v));
const yes = (v) => v === true || v === 'true' || v === 'on';

function parsePerson(body, p, who) {
  const year = num(body[p + 'Year']), month = num(body[p + 'Month']), day = num(body[p + 'Day']);
  if (!year || !month || !day) throw new Error(who + ' 생년월일을 올바르게 입력해주세요.');
  const unknown = yes(body[p + 'HourUnknown']);
  const hourRaw = body[p + 'Hour'], minuteRaw = body[p + 'Minute'];
  const hour = !unknown && hourRaw !== '' && hourRaw != null ? num(hourRaw) : null;
  const minute = hour != null && minuteRaw !== '' && minuteRaw != null ? num(minuteRaw) : 0;
  const gender = body[p + 'Gender'] === '여' || body[p + 'Gender'] === '남' ? body[p + 'Gender'] : null;
  if (!gender) throw new Error(who + ' 성별을 골라 주세요. 궁합 흐름 계산에 쓰여요.');
  const birth = { year, month, day, hour, minute, gender, isLunar: body[p + 'Calendar'] === '음력', isLeap: yes(body[p + 'IsLeap']) };
  try { validateBirth(birth); } catch (e) { throw new Error(who + ' ' + e.message); }
  // 이름은 주문 이름·화면 표시·프롬프트에 들어간다. 태그 기호·제어문자·줄바꿈·마크다운 기호를 뺀다.
  return { birth, name: cleanName(body[p + 'Name']) };
}

function parseBody(body) {
  body = body || {};
  const relation = typeof body.relation === 'string' ? body.relation : '';
  relationOf(relation);
  const a = parsePerson(body, 'a', '내');
  const b = parsePerson(body, 'b', '그 사람의');
  return { relation, a, b, startYm: typeof body.startYm === 'string' ? body.startYm.slice(0, 7) : null };
}

router.post('/couple/preview', (req, res) => {
  let parsed;
  try { parsed = parseBody(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    res.json({ reading: { ...buildCouplePreview(parsed.a.birth, parsed.b.birth, parsed.relation, { a: parsed.a.name, b: parsed.b.name }), charts: { a: sajuChartHtml(computeSaju(parsed.a.birth), { title: (parsed.a.name || '나') + '의 여덟 글자' }), b: sajuChartHtml(computeSaju(parsed.b.birth), { title: (parsed.b.name || '그 사람') + '의 여덟 글자' }) } } });
  } catch (e) {
    res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }
});

/** 유료 시작 — 라우트(/api/couple)와 카드 결제 승인(pay.js)이 같은 함수를 쓴다. */
async function startCouple(userId, body, { cardPaymentId } = {}) {
  let parsed;
  try { parsed = parseBody(body); } catch (e) { throw new HttpError(400, { error: e.message }); }
  let email;
  try { email = delivery.parseDelivery(body); } catch (e) { throw new HttpError(400, { error: e.message }); }

  let engineA, engineB;
  try { engineA = computeSaju(parsed.a.birth); engineB = computeSaju(parsed.b.birth); } catch (e) { throw new HttpError(400, { error: '명식 계산 실패: ' + e.message }); }

  const productKey = config.productKey;
  const pending = orders.findPendingByUserAndProduct(userId, productKey);
  if (pending) {
    throw new HttpError(409, { error: '이미 만들고 있는 궁합 리포트가 있어요. 완료될 때까지 잠시만 기다려 주세요.', code: 'already_pending', jobId: pending.job_id });
  }

  const people = { a: { name: parsed.a.name }, b: { name: parsed.b.name } };
  const jobId = crypto.randomUUID();
  const label = config.label + (people.a.name || people.b.name ? ' — ' + (people.a.name || '나') + ' · ' + (people.b.name || '그 사람') : '');
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, productKey, { label, jobId, cardPaymentId });
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
  generateCoupleReading(engineA, engineB, people, parsed.relation, new Date(), { startYm: parsed.startYm })
    .then(async (reading) => {
      orders.updateStatus(jobId, 'rendering');
      const pdfPath = path.join(jobDir, 'couple-report.pdf');
      await renderPdf(renderCoupleHtml(engineA, engineB, people, reading), pdfPath, { name: (people.a.name || '나') + ' · ' + (people.b.name || '그 사람'), label: config.label });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 생성 확인 실패');
      orders.markDone(jobId, {
        resultPath: pdfPath, cardPath: null, llmCostUsd: costUsd(reading.usage),
        resultText: toPlainText(reading), resultVisual: sajuChartHtml(engineA, { title: (parsed.a.name || '나') + '의 여덟 글자' }) + sajuChartHtml(engineB, { title: (parsed.b.name || '그 사람') + '의 여덟 글자' }) + coupleWebHtml(reading.timing)
      });
      // 발송 실패는 완성된 유료 결과를 오류/환불 상태로 바꾸지 않는다.
      await deliverReport(jobId).catch(() => {});
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      refundPurchase(userId, price, '생성 실패 환불: ' + productKey, jobId);
    });
  return { jobId, relation: parsed.relation };
}

router.post('/couple', requireAuth, handle(startCouple));

router.post('/couple/:jobId/delivery', requireAuth, async (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || order.user_id !== req.session.userId || order.product_key !== config.productKey) return res.sendStatus(404);
  if (order.status !== 'done' || !order.result_path) return res.status(409).json({ error: 'PDF가 아직 준비되지 않았어요.' });
  await deliverReport(order.job_id);
  return res.json({ delivery: delivery.publicState(order.job_id) });
});

module.exports = router;
module.exports.start = startCouple;
module.exports.parseBody = parseBody;
