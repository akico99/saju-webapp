'use strict';
/* Chromium이 아닌 별도 파서(pdf-parse/pdfjs 계열)로 PDF의 실제 텍스트 내용을 추출해 확인 —
   "다른 뷰어에서도 빈 화면"이라는 증상이 파일 자체 문제인지 확인하기 위함 */
const fs = require('fs');
const path = require('path');
const { PDFParse } = require('pdf-parse');

async function main() {
  const filePath = path.join(__dirname, '..', 'output', 'manual-full-test', 'report.pdf');
  const buf = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  console.log('총 페이지:', result.pages ? result.pages.length : result.numpages);
  console.log('전체 텍스트 길이:', result.text.length);
  console.log('--- 앞 500자 ---');
  console.log(JSON.stringify(result.text.slice(0, 500)));
  console.log('총평 포함?', result.text.includes('총평'));
  console.log('경금 포함?', result.text.includes('경금'));
  await parser.destroy();
}
main().catch(e => { console.error('파싱 실패:', e); process.exit(1); });
