'use strict';
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { renderCardHtml, renderCardImage } = require('../src/pdf/renderCard');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const person = { name: '홍길동' };
  const html = renderCardHtml(engine, person);
  const outPath = path.join(__dirname, '..', 'output', 'manual-full-test', 'summary-card.png');
  await renderCardImage(html, outPath);
  console.log('카드 생성 완료:', outPath);
}
main().catch(e => { console.error('실패:', e); process.exit(1); });
