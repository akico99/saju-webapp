'use strict';
/* 「다시, 우리」(재회) — 무료 첫 장(로그인·AI 호출 없음)과 유료 웹/PDF 생성. 연애 시기 리포트(routes/love.js)와 같은 흐름이다.
   PDF 완성 뒤 결제 전에 받은 이메일로 보낸다. 메일 실패는 주문을 실패로 만들지 않는다. */
const express = require('express');
const { sajuChartHtml } = require('../../pdf/sajuChart');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OUTPUT_ROOT } = require('../../config/outputDir');
const { renderReunionHtml, reunionWebHtml } = require('../../pdf/renderReunionHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const delivery = require('../../db/reportDelivery');
const { deliverReport } = require('../../email/loveReport');
const { computeSaju } = require('../../engine/index');
const { validateBirth } = require('../../engine/loveTiming');
const { buildReunionPreview, validateStory, describeBond } = require('../../engine/reunion');
const { generateReunionReading, toPlainText } = require('../../llm/reunionReading');
const { costUsd } = require('../../llm/client');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { refundPurchase } = require('../refundPurchase');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');
const reunionConfig = require('../../config/reunion');

const router = express.Router();

// 꺼져 있으면 이 라우터의 모든 경로가 404다. app.js 게이트를 경로 변형으로 비켜 와도 여기서 막는다.
router.use('/reunion', (req, res, next) => (reunionConfig.enabled ? next() : res.sendStatus(404)));

const num = (v) => (v === '' || v == null ? NaN : Number(v));
const truthy = (v) => v === true || v === 'true' || v === 'on';
// 이름은 주문 이름·화면·프롬프트에 들어간다. 태그 기호·제어문자·줄바꿈·마크다운 기호를 뺀다.
const cleanName = (v) => String(v || '').replace(/[\u0000-\u001f\u007f<>#*`\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20);

function parsePerson(body, p, who) {
  const gender = body[p + 'Gender'] === '여' || body[p + 'Gender'] === '남' ? body[p + 'Gender'] : null;
  if (!gender) throw new Error(who + ' 성별을 골라 주세요.');
  const year = num(body[p + 'Year']), month = num(body[p + 'Month']), day = num(body[p + 'Day']);
  if (!year || !month || !day) throw new Error(who + ' 생년월일을 올바르게 입력해주세요.');
  const unknown = truthy(body[p + 'HourUnknown']);
  const hour = !unknown && body[p + 'Hour'] !== '' && body[p + 'Hour'] != null ? num(body[p + 'Hour']) : null;
  const minute = hour != null && body[p + 'Minute'] !== '' && body[p + 'Minute'] != null ? num(body[p + 'Minute']) : 0;
  const birth = { year, month, day, hour, minute, gender, isLunar: body[p + 'Calendar'] === '음력', isLeap: truthy(body[p + 'IsLeap']) };
  try { validateBirth(birth); } catch (e) { throw new Error(who + ' ' + e.message); }
  return { name: cleanName(body[p + 'Name']), gender, birth };
}

function parseBody(body) {
  body = body || {};
  const me = parsePerson(body, 'a', '내');
  const them = parsePerson(body, 'b', '그 사람의');
  const story = validateStory({ since: body.since, initiator: body.initiator, contact: body.contact });
  return { me, them, story, startYm: typeof body.startYm === 'string' ? body.startYm.slice(0, 7) : null };
}

router.post('/reunion/preview', (req, res) => {
  let parsed;
  try { parsed = parseBody(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    res.json({ reading: { ...buildReunionPreview({ me: parsed.me.birth, them: parsed.them.birth, story: parsed.story }), charts: { me: sajuChartHtml(computeSaju(parsed.me.birth), { title: '나의 여덟 글자' }), them: sajuChartHtml(computeSaju(parsed.them.birth), { title: '그 사람의 여덟 글자' }) } } });
  } catch (e) {
    res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }
});

async function startReunion(userId, body) {
  let parsed;
  try { parsed = parseBody(body); } catch (e) { throw new HttpError(400, { error: e.message }); }
  let email;
  try { email = delivery.parseDelivery(body); } catch (e) { throw new HttpError(400, { error: e.message }); }
  let engineA, engineB;
  try { engineA = computeSaju(parsed.me.birth); engineB = computeSaju(parsed.them.birth); } catch (e) { throw new HttpError(400, { error: '명식 계산 실패: ' + e.message }); }

  const productKey = reunionConfig.productKey;
  const pending = orders.findPendingByUserAndProduct(userId, productKey);
  if (pending) throw new HttpError(409, { error: '이미 만들고 있는 재회 리포트가 있어요. 완료될 때까지 잠시만 기다려 주세요.', code: 'already_pending', jobId: pending.job_id });

  const people = { me: { name: parsed.me.name, gender: parsed.me.gender }, them: { name: parsed.them.name, gender: parsed.them.gender } };
  const jobId = crypto.randomUUID();
  const label = reunionConfig.title + (people.me.name ? ' — ' + people.me.name : '');
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, productKey, { label, jobId });
  } catch (e) {
    if (e.code === 'insufficient_points') throw new HttpError(402, { error: e.message, code: e.code, required: e.required, balance: e.balance });
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
  generateReunionReading(engineA, engineB, people, parsed.story, new Date(), { startYm: parsed.startYm })
    .then(async (reading) => {
      orders.updateStatus(jobId, 'rendering');
      const pdfPath = path.join(jobDir, 'reunion-report.pdf');
      await renderPdf(renderReunionHtml(engineA, engineB, people, { ...reading, bond: describeBond(engineA, engineB) }), pdfPath, { name: people.me.name, label: '다시, 우리' });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 생성 확인 실패');
      orders.markDone(jobId, {
        resultPath: pdfPath, cardPath: null, llmCostUsd: costUsd(reading.usage),
        resultText: toPlainText(reading), resultVisual: sajuChartHtml(engineA, { title: '나의 여덟 글자' }) + sajuChartHtml(engineB, { title: '그 사람의 여덟 글자' }) + reunionWebHtml(reading.timing)
      });
      await deliverReport(jobId).catch(() => {});
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      refundPurchase(userId, price, '생성 실패 환불: ' + productKey, jobId);
    });
  return { jobId };
}

router.post('/reunion', requireAuth, handle(startReunion));

router.post('/reunion/:jobId/delivery', requireAuth, async (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || order.user_id !== req.session.userId || order.product_key !== reunionConfig.productKey) return res.sendStatus(404);
  if (order.status !== 'done' || !order.result_path) return res.status(409).json({ error: 'PDF가 아직 준비되지 않았어요.' });
  await deliverReport(order.job_id);
  return res.json({ delivery: delivery.publicState(order.job_id) });
});

module.exports = router;
module.exports.start = startReunion;
module.exports.parseBody = parseBody;
