'use strict';
/* 이미 생성된 engine.json + chapters.json을 재사용해 HTML/PDF 렌더링만 다시 수행
   (재생성 없이 템플릿/디자인 변경만 검증할 때 사용 — 비용/시간 절약) */
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const dir = path.join(__dirname, '..', 'output', 'manual-full-test');
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const chapters = JSON.parse(fs.readFileSync(path.join(dir, 'chapters.json'), 'utf8'));
  const person = { name: '홍길동', gender: '남' };

  const html = renderHtml(engine, chapters, person);
  fs.writeFileSync(path.join(dir, 'report.html'), html);
  const pdfPath = path.join(dir, 'report.pdf');
  await renderPdf(html, pdfPath, person);

  const buf = fs.readFileSync(pdfPath);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('렌더링 완료:', pdfPath, '총', pages, '페이지');
}
main().catch(e => { console.error('실패:', e); process.exit(1); });
