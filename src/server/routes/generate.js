'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { computeSaju } = require('../../engine/index');
const { generateReport } = require('../../llm/generateReport');
const { generateCoverSummary } = require('../../llm/coverSummary');
const { costUsd, sumUsage } = require('../../llm/client');
const { renderHtml } = require('../../pdf/renderHtml');
const { renderPdf } = require('../../pdf/renderPdf');
const { renderCardHtml, renderCardImage } = require('../../pdf/renderCard');
const points = require('../../db/points');
const orders = require('../../db/orders');
const { requireAuth } = require('../middleware/auth');

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

  const person = { name: input.name, gender: engineResult.meta.genderGiven ? input.gender : null };
  const jobId = crypto.randomUUID();
  const label = `평생사주 100p 정식 리포트${person.name ? ` — ${person.name}` : ''}`;

  // 포인트 차감과 주문 생성을 하나의 트랜잭션으로 묶는다 — 실패하면 전부 롤백되므로
  // 별도 환불이 필요 없다.
  let price;
  try {
    price = points.chargeForProductAndCreateOrder(req.session.userId, 'full', { label, jobId });
  } catch (e) {
    if (e.code === 'insufficient_points') {
      return res.status(402).json({ error: e.message, code: e.code, required: e.required, balance: e.balance });
    }
    return res.status(500).json({ error: '결제 처리 중 오류가 발생했습니다. 포인트는 차감되지 않았습니다.' });
  }

  // 포인트는 이미 차감됐다(위) — 이 블록(파일시스템 작업)은 DB 트랜잭션 밖이라, 여기서
  // 실패하면(디스크 오류 등) 반드시 환불하고 에러로 응답한다.
  let jobDir;
  try {
    jobDir = path.join(OUTPUT_ROOT, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    fs.writeFileSync(path.join(jobDir, 'engine.json'), JSON.stringify(engineResult, null, 2));
  } catch (e) {
    orders.markError(jobId, e.message || String(e));
    points.refund(req.session.userId, price, '생성 준비 실패 환불: full', jobId);
    return res.status(500).json({ error: '생성 준비 중 오류가 발생했습니다. 포인트는 환불되었습니다.' });
  }

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
  orders.updateStatus(jobId, 'generating');
  Promise.all([
    generateReport(engineResult, person, jobDir, (progress) => {
      orders.updateProgress(jobId, progress);
    }),
    generateCoverSummary(engineResult, person).catch(() => null) // 실패해도 표지 요약만 빠질 뿐 본편은 그대로 진행
  ])
    .then(async ([chapters, coverResult]) => {
      orders.updateStatus(jobId, 'rendering');
      const coverSummary = coverResult ? coverResult.lines : null;
      const html = renderHtml(engineResult, chapters, person, coverSummary);
      const pdfPath = path.join(jobDir, 'report.pdf');
      await renderPdf(html, pdfPath, person);
      if (!fs.existsSync(pdfPath)) throw new Error('PDF 파일 생성 확인 실패');

      // 3초 요약 카드 — 본편 PDF를 보내기 전에 당근마켓/카톡으로 먼저 공유할 미리보기 이미지
      const cardPath = path.join(jobDir, 'summary-card.png');
      const cardHtml = renderCardHtml(engineResult, person);
      await renderCardImage(cardHtml, cardPath);
      if (!fs.existsSync(cardPath)) throw new Error('요약 카드 생성 확인 실패');

      // 18챕터 + 표지요약 전체 usage를 합쳐 이 리포트 한 건의 실제 LLM 원가(달러)를 계산·저장.
      const totalUsage = sumUsage([...chapters.map((c) => c.usage), coverResult && coverResult.usage]);
      const llmCostUsd = costUsd(totalUsage);

      orders.markDone(jobId, { resultPath: pdfPath, cardPath, llmCostUsd });
    })
    .catch((e) => {
      orders.markError(jobId, e.message);
      points.refund(req.session.userId, price, '생성 실패 환불: full', jobId);
    });
});

module.exports = router;
