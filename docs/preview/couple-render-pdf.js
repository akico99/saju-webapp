'use strict';
// couple-generated-dating.json → PDF(docs/preview/couple-generated-dating.pdf, 커밋 제외). 쪽수·크기·누락 달을 확인한다.
const fs = require('fs'), path = require('path');
const { computeSaju } = require('../../src/engine');
const { renderCoupleHtml } = require('../../src/pdf/renderCoupleHtml');
const { renderPdf } = require('../../src/pdf/renderPdf');
const { monthParts } = require('../../public/love-reading-model');
(async () => {
  const x = require('./couple-generated-dating.json');
  const out = path.join(__dirname, 'couple-generated-dating.pdf');
  const t = Date.now();
  await renderPdf(renderCoupleHtml(computeSaju(x.birthA), computeSaju(x.birthB), x.people, x.reading), out, { name: x.people.a.name + ' · ' + x.people.b.name, label: '두 사람의 궁합' });
  const { PDFParse } = require('pdf-parse');
  const parsed = await new PDFParse({ data: fs.readFileSync(out) }).getText();
  const body = parsed.text.replace(/\s+/g, '');
  const missing = x.reading.monthNotes.filter((m) => !body.includes(monthParts(m.note).map((p) => p.text).join('').replace(/\*\*/g, '').replace(/\s+/g, '').slice(0, 60))).length;
  console.log(JSON.stringify({ pages: parsed.total, kb: Math.round(fs.statSync(out).size / 1024), seconds: Math.round((Date.now() - t) / 1000), missingMonths: missing }));
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
