'use strict';
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { analyzeCompatibility } = require('../src/engine/compatibility');
const { generateCompatReport } = require('../src/llm/generateCompatReport');
const { renderCompatHtml } = require('../src/pdf/renderCompatHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const engineA = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const engineB = computeSaju({ year: 1992, month: 9, day: 3, hour: 14, minute: 0, gender: '여' });
  const personA = { name: '홍길동' };
  const personB = { name: '김영희' };

  const compat = analyzeCompatibility(engineA, engineB);
  console.log('궁합 엔진 결과:', JSON.stringify(compat, null, 2));

  const { text, usage } = await generateCompatReport(engineA, engineB, personA, personB, compat);
  console.log('LLM 생성 완료:', text.length, '자, output_tokens', usage.output_tokens);

  const html = renderCompatHtml(engineA, engineB, personA, personB, compat, text);
  const outPath = path.join(__dirname, '..', 'output', 'manual-full-test', 'compat-report.pdf');
  await renderPdf(html, outPath, { name: `${personA.name} · ${personB.name}` });

  const buf = require('fs').readFileSync(outPath);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('궁합 PDF 생성 완료:', outPath, pages, '페이지');
}
main().catch(e => { console.error('실패:', e); process.exit(1); });
