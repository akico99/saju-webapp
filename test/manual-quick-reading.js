'use strict';
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { generateQuickReading } = require('../src/llm/quickReading');
const { renderQuickHtml } = require('../src/pdf/renderQuickHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const person = { name: '홍길동', gender: '남' };

  const { title, text, usage } = await generateQuickReading(engine, person, 'wealth');
  console.log('생성 완료:', title, text.length, '자, output_tokens', usage.output_tokens);

  const html = renderQuickHtml(engine, person, title, text);
  const outPath = path.join(__dirname, '..', 'output', 'manual-full-test', 'quick-report.pdf');
  await renderPdf(html, outPath, { name: person.name, label: title });
  console.log('PDF 생성 완료:', outPath);
}
main().catch(e => { console.error('실패:', e); process.exit(1); });
