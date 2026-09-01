'use strict';
/* Phase 6 수동 확인용 — LLM 없이 더미 챕터 텍스트로 HTML 렌더링 결과를 파일로 저장 */
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { CHAPTERS } = require('../src/llm/chapters');
const { renderHtml } = require('../src/pdf/renderHtml');

const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });

const DUMMY_PARA = '이것은 더미 문단입니다. '.repeat(20);
const chapters = CHAPTERS.map(c => ({
  id: c.id, title: c.title,
  text: `${DUMMY_PARA}\n\n${DUMMY_PARA}\n\n${DUMMY_PARA}`
}));

const html = renderHtml(engine, chapters, { name: '홍길동', gender: '남' });
const outPath = path.join(__dirname, '..', 'output', 'dummy-report.html');
fs.writeFileSync(outPath, html);
console.log('wrote', outPath, html.length, 'bytes');
