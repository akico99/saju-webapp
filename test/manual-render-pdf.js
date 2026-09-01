'use strict';
/* Phase 7 수동 확인용 — 더미 챕터 텍스트로 실제 PDF까지 생성 */
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

function dummyTextOfLength(n) {
  const UNIT = '이것은 페이지 배분 실측용 더미 문장입니다. 실제 챕터에서는 이 자리에 명식 근거를 인용한 서술문이 들어갑니다. ';
  let text = '';
  while (text.length < n) text += UNIT;
  text = text.slice(0, n);
  const chunkSize = Math.ceil(n / 4);
  const paras = [];
  for (let i = 0; i < n; i += chunkSize) paras.push(text.slice(i, i + chunkSize));
  return paras.join('\n\n');
}

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const chapters = CHAPTERS.map(c => ({
    id: c.id, title: c.title,
    text: dummyTextOfLength(c.targetWords)
  }));
  const person = { name: '홍길동', gender: '남' };
  const html = renderHtml(engine, chapters, person);
  const outPath = path.join(__dirname, '..', 'output', 'dummy-report.pdf');
  await renderPdf(html, outPath, person);
  console.log('wrote', outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
