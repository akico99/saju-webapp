/* 생성 예시(reunion-generated-*.json)를 실제 PDF로 그려 쪽수·크기를 잰다. PDF는 커밋하지 않는다.
   node docs/preview/render-reunion-pdf.js [cut|blocked] */
const fs = require('fs'), path = require('path');
const { computeSaju } = require('../../src/engine');
const { renderReunionHtml } = require('../../src/pdf/renderReunionHtml');
const { describeBond } = require('../../src/engine/reunion');
const { renderPdf } = require('../../src/pdf/renderPdf');
const kind = process.argv[2] || 'cut';
(async () => {
  const x = require('./reunion-generated-' + kind + '.json');
  const a = computeSaju(x.case.me.birth), b = computeSaju(x.case.them.birth);
  const out = path.join(__dirname, 'reunion-generated-' + kind + '.pdf');
  const t = Date.now();
  await renderPdf(renderReunionHtml(a, b, x.people, { ...x.reading, bond: describeBond(a, b) }), out, { name: x.people.me.name, label: '다시, 우리' });
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(out) });
  const r = await parser.getText();
  console.log(JSON.stringify({ kind, pages: r.total, kb: Math.round(fs.statSync(out).size / 1024), seconds: Math.round((Date.now() - t) / 1000) }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
