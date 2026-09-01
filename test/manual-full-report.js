'use strict';
/* Phase 5/8 수동 확인용 — 18챕터 전체를 실제 Claude API로 생성하고 PDF까지 렌더링 */
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { generateReport } = require('../src/llm/generateReport');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const person = { name: '홍길동', gender: '남' };
  const jobDir = path.join(__dirname, '..', 'output', 'manual-full-test');
  fs.mkdirSync(jobDir, { recursive: true });

  const t0 = Date.now();
  const chapters = await generateReport(engine, person, jobDir, (p) => {
    console.log(`진행률: ${p.current}/${p.total}`);
  });
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== 18챕터 생성 완료: ${elapsedSec}초 소요 ===`);

  let totalOutputTokens = 0, totalInputTokens = 0;
  chapters.forEach(c => {
    totalOutputTokens += c.usage.output_tokens;
    totalInputTokens += c.usage.input_tokens;
    const decimalHits = (c.text.match(/\d\.\d/g) || []).length;
    console.log(`제${c.id}장 "${c.title}": ${c.text.length}자, 소수점패턴 ${decimalHits}건, output_tokens ${c.usage.output_tokens}`);
  });
  console.log(`\n=== 합계: input ${totalInputTokens} / output ${totalOutputTokens} 토큰 ===`);

  const html = renderHtml(engine, chapters, person);
  const pdfPath = path.join(jobDir, 'report.pdf');
  await renderPdf(html, pdfPath, person);
  const buf = fs.readFileSync(pdfPath);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`=== PDF 생성 완료: ${pdfPath}, 총 ${pages}페이지 ===`);
}

main().catch(e => { console.error('실패:', e); process.exit(1); });
