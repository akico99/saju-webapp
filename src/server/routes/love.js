'use strict';
/* 무료 사주 분석(즉시, AI 없음)과 그 위에 나중에 채우는 개인 소개(/api/love/intro, 가장 싼 모델),
   유료 웹/PDF 생성. PDF 완성 뒤 입력한 수신 주소로 전송한다.
   메일 실패는 결과를 유지하고 인증된 주문 소유자에게만 재전송을 허용한다. */
const express = require('express');
const { sajuChartHtml } = require('../../pdf/sajuChart');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OUTPUT_ROOT } = require('../../config/outputDir');
const { renderLoveHtml } = require('../../pdf/renderLoveHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const delivery = require('../../db/reportDelivery');
const { deliverLoveReport } = require('../../email/loveReport');
const { computeSaju } = require('../../engine/index');
const { buildLovePreview, buildLoveTiming, situationOf, validateBirth } = require('../../engine/loveTiming');
const { generateLoveReading, toPlainText } = require('../../llm/loveTimingReading');
const { recordForReview } = require('../reviewRecord');
const { introHandler, loveFacts } = require('../../llm/freeIntro');
const { loveWebHtml } = require('../../pdf/loveVisual');
const { costUsd } = require('../../llm/client');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { refundPurchase } = require('../refundPurchase');
const { requireAuth } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const { HttpError, handle } = require('../httpError');
const loveTimingConfig = require('../../config/loveTiming');
const loveLeads = require('../../db/loveLeads');
const { sendResultNow } = require('../../jobs/deliverLoveLeads');
const { handleUnsubscribe } = require('./loveUnsubscribe');

const router = express.Router();

// 꺼져 있으면 이 라우터의 모든 경로가 404다. app.js 게이트를 어떤 경로 변형으로 비켜 와도 여기서 한 번 더 막는다.
router.use('/love', (req, res, next) => (loveTimingConfig.enabled ? next() : res.sendStatus(404)));

// 숫자 칸 — 빈 값은 NaN으로 두고 검사(validateBirth)가 거른다. "5.5"는 소수로 남아 정수 검사에 걸린다.
const num = (v) => (v === '' || v == null ? NaN : Number(v));

function parseBody(body) {
  body = body || {};
  const situation = typeof body.situation === 'string' ? body.situation : '';
  situationOf(situation);
  const year = num(body.year), month = num(body.month), day = num(body.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');
  const unknown = body.hourUnknown === true || body.hourUnknown === 'true' || body.hourUnknown === 'on';
  const hour = !unknown && body.hour !== '' && body.hour != null ? num(body.hour) : null;
  const minute = hour != null && body.minute !== '' && body.minute != null ? num(body.minute) : 0;
  const gender = body.gender === '여' || body.gender === '남' ? body.gender : null;
  if (!gender) throw new Error('성별을 골라 주세요. 연애운 계산에 쓰여요.');
  const parsed = {
    situation,
    // 이름은 주문 이름·화면 표시·프롬프트에 들어간다. 태그 기호·제어문자·줄바꿈·마크다운 기호를 뺀다.
    name: String(body.name || '').replace(/[\u0000-\u001f\u007f<>#*`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 20),
    gender,
    startYm: typeof body.startYm === 'string' ? body.startYm.slice(0, 7) : null,
    birth: { year, month, day, hour, minute, gender, isLunar: body.calendar === '음력', isLeap: body.isLeap === true || body.isLeap === 'on' || body.isLeap === 'true' }
  };
  validateBirth(parsed.birth);
  return parsed;
}

// 시간 주입(테스트) — 앱이 loveNow를 주면 그 시각을, 아니면 지금을 쓴다.
const nowOf = (req) => (req.app.locals.loveNow ? req.app.locals.loveNow() : new Date());

// 이메일을 받는 새 흐름(leadFlow 2)의 요청만 IP별로 제한한다 — 남의 주소로 메일을 쏟아 보내는 일을 막는다.
const leadLimiter = makeLimiter({
  max: 60, windowMs: 60 * 60 * 1000,
  keyFn: (req) => 'love-lead:' + req.ip,
  message: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.'
});
const leadFlowLimit = (req, res, next) => (req.body && req.body.leadFlow === 2 ? leadLimiter(req, res, next) : next());

// leadFlow 2 요청의 이메일·동의 검사. 실패하면 한국어 메시지로 던진다.
function parseLead(body) {
  const email = loveLeads.normalizeEmail(body.leadEmail);
  if (!email) throw new Error('결과를 받을 이메일을 정확히 입력해 주세요.');
  if (body.agreeLeadPrivacy !== true) throw new Error('개인정보 수집·이용에 동의해 주세요.');
  return { email, marketing: body.agreeMarketing === true };
}

// 저장된 입력을 폼 요청과 같은 모양으로 되돌린다 — 메일 링크로 들어온 화면이 입력 단계를 건너뛰고 쓴다.
function leadInput(row, birth) {
  return {
    situation: row.situation, name: row.name, gender: birth.gender,
    year: birth.year, month: birth.month, day: birth.day,
    hour: birth.hour == null ? '' : birth.hour, minute: birth.hour == null ? '' : birth.minute,
    hourUnknown: birth.hour == null, calendar: birth.isLunar ? '음력' : '양력', isLeap: !!birth.isLeap,
    startYm: row.start_ym
  };
}

router.post('/love/preview', leadFlowLimit, (req, res) => {
  let parsed;
  try { parsed = parseBody(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  let leadIn = null;
  if (req.body && req.body.leadFlow === 2) {
    try { leadIn = parseLead(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const now = nowOf(req);
  let reading;
  try {
    reading = { ...buildLovePreview(parsed.birth, parsed.situation, now), chart: sajuChartHtml(computeSaju(parsed.birth)) };
  } catch (e) {
    return res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }
  if (!leadIn) return res.json({ reading });
  // 이메일은 부가 기능이다 — 저장이 실패해도 결과는 그대로 보여 준다.
  let lead = { saved: false, emailQueued: false };
  try {
    const top1 = buildLoveTiming(computeSaju(parsed.birth), parsed.birth.gender, now).top3[0];
    const saved = loveLeads.upsert({
      email: leadIn.email, name: parsed.name, birth: parsed.birth, situation: parsed.situation,
      startYm: reading.startYm, top1Ym: top1.year + '-' + String(top1.month).padStart(2, '0'), marketing: leadIn.marketing
    }, now);
    lead = { saved: true, emailQueued: saved.resultQueued };
    if (saved.resultQueued && req.app.locals.loveMailInline !== false) setImmediate(() => sendResultNow(saved.id).catch(() => {}));
  } catch (e) {
    console.error('[연애 메일] 저장 실패');
  }
  res.json({ reading, lead });
});

// 메일의 '결과 다시 보기' 링크 — 저장된 입력으로 무료 결과를 다시 만든다. 없거나 지난 토큰은 404.
router.get('/love/lead/:token', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  const now = nowOf(req);
  const row = loveLeads.findByToken(req.params.token, now);
  if (!row) return res.status(404).json({ error: '메일 링크가 만료되었거나 찾을 수 없어요.' });
  try {
    const birth = JSON.parse(row.birth_json);
    const reading = { ...buildLovePreview(birth, row.situation, now), chart: sajuChartHtml(computeSaju(birth)) };
    res.json({ reading, lead: { email: row.email, input: leadInput(row, birth) } });
  } catch (e) {
    res.status(404).json({ error: '메일 링크가 만료되었거나 찾을 수 없어요.' });
  }
});

router.get('/love/unsubscribe', handleUnsubscribe);

// 무료 사주 분석의 개인 소개 — 미리보기와 같은 입력을 받는다. 캐시·한도·실패 처리는 freeIntro가 맡는다.
router.post('/love/intro', introHandler((body) => {
  const parsed = parseBody(body);
  return loveFacts(parsed.birth, situationOf(parsed.situation).label);
}));

async function startLove(userId, body) {
  let parsed;
  try { parsed = parseBody(body); } catch (e) { throw new HttpError(400, { error: e.message }); }
  let email;
  try { email = delivery.parseDelivery(body); } catch (e) { throw new HttpError(400, { error: e.message }); }

  let engineResult;
  try { engineResult = computeSaju(parsed.birth); } catch (e) { throw new HttpError(400, { error: '명식 계산 실패: ' + e.message }); }

  const productKey = loveTimingConfig.productKey;
  const pending = orders.findPendingByUserAndProduct(userId, productKey);
  if (pending) {
    throw new HttpError(409, { error: '이미 만들고 있는 연애 시기 리포트가 있어요. 완료될 때까지 잠시만 기다려 주세요.', code: 'already_pending', jobId: pending.job_id });
  }

  const person = { name: parsed.name, gender: parsed.gender };
  const jobId = crypto.randomUUID();
  const label = loveTimingConfig.label + (person.name ? ' — ' + person.name : '');
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(userId, productKey, { label, jobId });
  } catch (e) {
    if (e.code === 'insufficient_points') {
      throw new HttpError(402, { error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    throw new HttpError(500, { error: '주문을 만드는 중 오류가 발생했습니다.' });
  }

  let jobDir;
  try {
    delivery.create(jobId, email);
    // 같은 이메일로 받은 무료 분석 판매 메일을 멈춘다(결제가 끝난 주문에서만 이 줄에 닿는다).
    try { loveLeads.markPurchasedByEmail(email); } catch (_) { /* 부가 기능 */ }
    jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
  } catch (e) {
    orders.markError(jobId, 'PDF 생성 준비 실패');
    refundPurchase(userId, price, '생성 준비 실패 환불: ' + productKey, jobId);
    throw new HttpError(500, { error: '리포트 생성 준비에 실패했어요.' });
  }
  orders.updateStatus(jobId, 'generating');
  generateLoveReading(engineResult, person, parsed.situation, new Date(), { startYm: parsed.startYm, readingFocus: body.readingFocus })
    .then(async (reading) => {
      orders.updateStatus(jobId, 'rendering');
      const pdfPath = path.join(jobDir, 'love-report.pdf');
      await renderPdf(renderLoveHtml(engineResult, person, reading), pdfPath, { name: person.name, label: '인연의 시기' });
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 생성 확인 실패');
      orders.markDone(jobId, {
        resultPath: pdfPath, cardPath: null, llmCostUsd: costUsd(reading.usage),
        resultText: toPlainText(reading), resultVisual: sajuChartHtml(engineResult) + loveWebHtml(reading.timing)
      });
      recordForReview(jobId, reading, { engines: [engineResult], names: [person.name] });
      // 발송 실패는 완성된 유료 결과를 오류/환불 상태로 바꾸지 않는다.
      await deliverLoveReport(jobId).catch(() => {});
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      refundPurchase(userId, price, '생성 실패 환불: ' + productKey, jobId);
    });
  return { jobId, situation: parsed.situation };
}

router.post('/love', requireAuth, handle(startLove));

router.post('/love/:jobId/delivery', requireAuth, async (req, res) => {
  const order = orders.findByJobId(req.params.jobId);
  if (!order || order.user_id !== req.session.userId || order.product_key !== loveTimingConfig.productKey) return res.sendStatus(404);
  if (order.status !== 'done' || !order.result_path) return res.status(409).json({ error: 'PDF가 아직 준비되지 않았어요.' });
  await deliverLoveReport(order.job_id);
  return res.json({ delivery: delivery.publicState(order.job_id) });
});

module.exports = router;
module.exports.start = startLove;
module.exports.parseBody = parseBody;
