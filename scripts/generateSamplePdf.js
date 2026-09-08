'use strict';
/* 랜딩페이지(consult.html)에 실을 "홍길동" 가상 인물 평생사주 100p 샘플 PDF를 실제
   프로덕션 파이프라인 그대로(진짜 만세력 계산 + 진짜 LLM 18챕터) 생성해서
   public/samples/hong-gildong-lifetime.pdf에 저장한다.
   node scripts/generateSamplePdf.js 로 실행 — 필요할 때(엔진/프롬프트가 바뀌었을 때)만
   다시 돌리면 된다. 실제 API 비용이 드는 스크립트라 자동 실행되지 않는다. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../src/engine/index');
const { generateReport } = require('../src/llm/generateReport');
const { generateCoverSummary } = require('../src/llm/coverSummary');
const { renderHtml } = require('../src/pdf/renderHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

const OUT_DIR = path.join(__dirname, '..', 'public', 'samples');
const TMP_DIR = path.join(__dirname, '..', 'output', '_sample-hong-gildong');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const input = {
    year: 1990, month: 5, day: 15, hour: 14, minute: 30,
    gender: '남', isLunar: false, isLeap: false, city: null, lonOff: false
  };
  const engineResult = computeSaju(input);
  const person = { name: '홍길동', gender: input.gender };

  console.log('명식 계산 완료. 18챕터 생성 시작 (실제 LLM 호출, 시간이 걸립니다)...');

  const [chapters, coverResult] = await Promise.all([
    generateReport(engineResult, person, TMP_DIR, (p) => {
      process.stdout.write(`\r챕터 ${p.current}/${p.total}`);
    }),
    generateCoverSummary(engineResult, person).catch(() => null)
  ]);
  console.log('\n챕터 생성 완료. PDF 렌더링 중...');

  const coverSummary = coverResult ? coverResult.lines : null;
  const html = renderHtml(engineResult, chapters, person, coverSummary);
  const pdfPath = path.join(OUT_DIR, 'hong-gildong-lifetime.pdf');
  await renderPdf(html, pdfPath, person);

  console.log('완료:', pdfPath);
}

main().catch((e) => {
  console.error('샘플 PDF 생성 실패:', e);
  process.exit(1);
});
