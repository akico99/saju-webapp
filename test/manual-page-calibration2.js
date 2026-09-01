'use strict';
/* 한 챕터에만 정확히 알려진 글자수를 채워 넣어 새 CSS의 char당 페이지 비율을 정밀 측정 */
const path = require('path');
const fs = require('fs');
const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const UNIT = '가나다라마바사아자차카타파하 각 문단은 실제 사주 해석 문장과 비슷한 밀도로 한글 글자수를 채우기 위한 표본입니다. ';
  const targetChars = 6000;
  let text = '';
  while (text.length < targetChars) text += UNIT;
  text = text.slice(0, targetChars);
  // 문단 3~4개로 분할
  const parts = [text.slice(0, 1500), text.slice(1500, 3000), text.slice(3000, 4500), text.slice(4500)];
  const chapters = CHAPTERS.map(c => ({ id: c.id, title: c.title, text: c.id === 1 ? parts.join('\n\n') : '내용 없음.' }));
  const person = { name: '홍길동', gender: '남' };
  const html = renderHtml(engine, chapters, person);
  const outPath = path.join(__dirname, '..', 'output', 'calib2-report.pdf');
  await renderPdf(html, outPath, person);
  const buf = fs.readFileSync(outPath);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(`chapter1에 ${targetChars}자 채운 결과 총 페이지:`, pages);
}
main().catch(e => { console.error(e); process.exit(1); });
