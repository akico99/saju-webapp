'use strict';
/* Phase 6/8 실측 — 챕터 본문을 최소 텍스트로 채워 표지+목차+명식표(프론트매터) 페이지 수를 측정.
   이후 실제 더미 분량 결과와 대조해 char당 페이지 비율을 역산한다. */
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderPdf } = require('../src/pdf/renderPdf');
const fs = require('fs');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const chapters = CHAPTERS.map(c => ({ id: c.id, title: c.title, text: '내용 없음.' }));
  const person = { name: '홍길동', gender: '남' };
  const html = renderHtml(engine, chapters, person);
  const outPath = path.join(__dirname, '..', 'output', 'baseline-report.pdf');
  await renderPdf(html, outPath, person);
  const buf = fs.readFileSync(outPath);
  const matches = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('baseline pages (frontmatter + 18 near-empty chapters):', matches);
}
main().catch(e => { console.error(e); process.exit(1); });
