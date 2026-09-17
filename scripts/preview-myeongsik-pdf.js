'use strict';
/* 명식표와 분포 페이지만 출력한다. LLM 호출·포인트 사용·전체 챕터 렌더링 없음. */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { computeSaju } = require('../src/engine');
const { getReportCss } = require('../src/pdf/reportCss');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const partialPath = path.join(__dirname, '..', 'src', 'pdf', 'templates', 'partials', 'myeongsik-table.ejs');
  const content = ejs.render(fs.readFileSync(partialPath, 'utf8'), { engine }, { filename: partialPath });
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${getReportCss()}</style></head>
    <body>${content}<script>window.__chartsReady = true;</script></body></html>`;
  const outputDir = path.join(__dirname, '..', 'output', 'pdf');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'myeongsik-light-preview.pdf');
  await renderPdf(html, outputPath, { name: '홍길동', label: '명식 미리보기' });
  console.log(outputPath);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
