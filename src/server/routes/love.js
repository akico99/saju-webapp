'use strict';
/* 연애 시기 리포트 — 무료 첫 장(/api/love/preview, 로그인·LLM 없음)과 유료 생성(/api/love).
   유료 생성은 심층 리딩(quick.js)과 같은 job 패턴이고, 결제 승인 뒤에는 pay.js가
   resolveProduct('love')로 같은 start()를 부른다. PDF는 아직 만들지 않는다 — 결과는 웹 본문
   (result_text)과 12개월 막대(result_visual)로 보관하고 /love.html?jobId= 에서 다시 본다. */
const express = require('express');
const crypto = require('crypto');
const { computeSaju } = require('../../engine/index');
const { buildLovePreview, situationOf, validateBirth } = require('../../engine/loveTiming');
const { generateLoveReading, toPlainText } = require('../../llm/loveTimingReading');
const { loveWebHtml } = require('../../pdf/loveVisual');
const { costUsd } = require('../../llm/client');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { refundPurchase } = require('../refundPurchase');
const { requireAuth } = require('../middleware/auth');
const { HttpError, handle } = require('../httpError');
const loveTimingConfig = require('../../config/loveTiming');

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

router.post('/love/preview', (req, res) => {
  let parsed;
  try { parsed = parseBody(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  try {
    res.json({ reading: buildLovePreview(parsed.birth, parsed.situation) });
  } catch (e) {
    res.status(400).json({ error: '명식 계산 실패: ' + e.message });
  }
});

async function startLove(userId, body) {
  let parsed;
  try { parsed = parseBody(body); } catch (e) { throw new HttpError(400, { error: e.message }); }

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

  orders.updateStatus(jobId, 'generating');
  generateLoveReading(engineResult, person, parsed.situation, new Date(), { startYm: parsed.startYm })
    .then((reading) => {
      orders.markDone(jobId, {
        resultPath: null, cardPath: null, llmCostUsd: costUsd(reading.usage),
        resultText: toPlainText(reading), resultVisual: loveWebHtml(reading.timing)
      });
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      refundPurchase(userId, price, '생성 실패 환불: ' + productKey, jobId);
    });
  return { jobId, situation: parsed.situation };
}

router.post('/love', requireAuth, handle(startLove));

module.exports = router;
module.exports.start = startLove;
module.exports.parseBody = parseBody;
