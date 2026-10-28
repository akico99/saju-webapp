'use strict';
/* 유료 풀이가 완성되면 검토용 기록(db/reviews.js)을 남긴다. 검토 화면이 개인정보 원본을 다루지 않도록 저장 전에 가린다.
   · 본문·근거·자동 경고 인용에서 이름(2글자 이상)·생년월일·이메일·전화번호를 가린다.
   · 여덟 글자 표는 생년월일 줄(sc-basis)을 빼고 제목을 '나·그 사람'으로 바꾼다.
   검토 기록은 부가 기능이라 실패해도 주문(완료·발송)에는 영향을 주지 않는다. */
const reviews = require('../db/reviews');
const { sajuChartHtml } = require('../pdf/sajuChart');

const escapeRe = (s) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');

function makeMasker(names) {
  const list = [...new Set((names || []).map((n) => String(n || '').replace(/\s+/g, ' ').trim()).filter((n) => n.length >= 2))]
    .sort((a, b) => b.length - a.length);
  const nameRe = list.length ? new RegExp(list.map(escapeRe).join('|'), 'g') : null;
  return (text) => {
    let s = String(text == null ? '' : text);
    if (nameRe) s = s.replace(nameRe, '○○');
    return s
      .replace(/\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/g, '(생년월일 가림)')
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '(이메일 가림)')
      .replace(/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g, '(전화번호 가림)');
  };
}

const stripBasis = (html) => String(html).replace(/<p class="sc-basis">[\s\S]*?<\/p>/g, '');

function buildRecord(reading, { engines = [], names = [] } = {}) {
  const mask = makeMasker(names);
  const evidence = reading.evidence || {};
  const sections = (reading.sections || []).map((s) => ({ key: s.key, title: s.title, text: mask(s.text), evidence: evidence[s.key] ? mask(evidence[s.key]) : null }));
  if (reading.monthNotes && reading.monthNotes.length) {
    sections.push({ key: 'months', title: '월별 상세 흐름', evidence: evidence.months ? mask(evidence.months) : null,
      text: mask(reading.monthNotes.map((n) => '- ' + (n.year ? n.year + '년 ' : '') + n.month + '월: ' + n.note).join('\n')) });
  }
  const titles = engines.length > 1 ? ['나의 여덟 글자', '그 사람의 여덟 글자'] : ['여덟 글자'];
  const charts = engines.filter(Boolean).map((e, i) => stripBasis(sajuChartHtml(e, { title: titles[i] || '여덟 글자' })));
  const checks = (reading.checks || []).map((c) => ({ ...c, quote: mask(c.quote), message: mask(c.message) }));
  return { evidence: { title: reading.title || '', sections, charts }, checks };
}

function recordForReview(jobId, reading, opts = {}) {
  try {
    const { evidence, checks } = buildRecord(reading, opts);
    reviews.saveReading(jobId, evidence, checks);
  } catch (e) {
    console.warn('[검토 기록] 저장하지 못했습니다:', e.message);
  }
}

module.exports = { recordForReview, buildRecord, makeMasker };

