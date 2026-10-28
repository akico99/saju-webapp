'use strict';
/* 관리자 — 유료 풀이 검토. 사주를 아는 검토자가 최근 완료 주문의 무작위 표본을 장마다 '맞음·애매함·틀림'으로 판정한다.
   기록은 db/reviews.js에만 있고 이미 이름·생년월일·이메일을 가린 상태로 저장되어 있다(server/reviewRecord.js).
   관리자 인증은 admin.js와 같은 ADMIN_PASSWORD 세션(requireAdmin)을 쓴다. */
const express = require('express');
const reviews = require('../../db/reviews');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const PRODUCT_LABEL = { love_timing: '인연의 시기', reunion_v2: '다시, 우리', compat_v2: '두 사람의 궁합' };
const labelOf = (key) => PRODUCT_LABEL[key] || (/^new_year/.test(key) ? '신년운세 ' + key.replace(/\D/g, '') : key);
const clampInt = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

router.get('/admin/review/sample', requireAdmin, (req, res) => {
  const perProduct = clampInt(req.query.per, 1, 20, 3);
  const pool = clampInt(req.query.pool, 10, 1000, 200);
  const productKey = typeof req.query.product === 'string' && /^[a-z0-9_-]{1,40}$/i.test(req.query.product) ? req.query.product : null;
  const items = reviews.sample({ perProduct, pool, productKey }).map((s) => {
    const r = reviews.getReading(s.jobId);
    const errors = r.checks.filter((c) => c.level === 'error').length;
    return { ...s, productLabel: labelOf(s.productKey), autoErrors: errors, autoWarnings: r.checks.length - errors,
      sections: r.evidence.sections ? r.evidence.sections.length : 0, marked: Object.keys(r.marks).length };
  });
  res.json({ items });
});

router.get('/admin/review/job/:jobId', requireAdmin, (req, res) => {
  const r = reviews.getReading(req.params.jobId);
  if (!r) return res.status(404).json({ error: '검토 기록이 없는 주문입니다.' });
  const sections = (r.evidence.sections || []).map((s) => ({ ...s, checks: r.checks.filter((c) => c.section === s.key), mark: r.marks[s.key] || null }));
  res.json({ jobId: r.jobId, productKey: r.productKey, productLabel: labelOf(r.productKey), finishedAt: r.finishedAt, title: r.evidence.title || '',
    charts: r.evidence.charts || [], sections, otherChecks: r.checks.filter((c) => !sections.some((s) => s.key === c.section)) });
});

router.post('/admin/review/job/:jobId/marks', requireAdmin, (req, res) => {
  const { sectionKey, verdict, memo } = req.body || {};
  try {
    reviews.saveMark(req.params.jobId, sectionKey, verdict, memo);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.get('/admin/review/summary', requireAdmin, (req, res) => {
  res.json({ rows: reviews.summary().map((r) => ({ ...r, productLabel: labelOf(r.productKey) })) });
});

module.exports = router;

