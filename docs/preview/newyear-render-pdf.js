'use strict';
// newyear-generate.js 결과로 PDF를 만들고 쪽수·크기·12개월 누락을 확인한다. 결과 PDF는 커밋하지 않는다.
const fs = require('fs'); const path = require('path');
const { computeSaju } = require('../../src/engine');
const { renderNewYearHtml } = require('../../src/pdf/renderNewYearHtml');
const { renderPdf } = require('../../src/pdf/renderPdf');
const { monthParts } = require('../../public/love-reading-model');
(async () => {
  const x = require('./newyear-generated-sample.json');
  const engine = computeSaju(x.birth);
  const out = path.join(__dirname, 'newyear-generated-sample.pdf');
  const t = Date.now();
  await renderPdf(renderNewYearHtml(engine, x.person, x.reading), out, { name: x.person.name, label: '2027년 신년운세' });
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(out) });
  const r = await parser.getText();
  const body = r.text.replace(/\s+/g, '');
  const missing = x.reading.monthNotes.filter((m) => !body.includes(monthParts(m.note).map((p) => p.text).join('').replace(/\*\*/g, '').replace(/\s+/g, '').slice(0, 60))).length;
  console.log(JSON.stringify({ pages: r.total, kb: Math.round(fs.statSync(out).size / 1024), seconds: Math.round((Date.now() - t) / 1000), missingMonths: missing }));
})().catch((e) => { console.error(e.message); process.exitCode = 1; });
