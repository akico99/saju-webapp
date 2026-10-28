'use strict';
// 로컬 미리보기 전용: 신년운세를 켜고 임시 DB를 쓴다. 운영 데이터·결제·메일에는 연결하지 않는다.
// 공용 읽기 화면 파일(love-reading-*.js, love-assets)은 지금 연애 스위치에 묶여 있어 함께 켠다.
// 가상 결제 완료 주문: /new-year.html?jobId=preview-sample (newyear-generate.js 결과와 그 PDF).
process.env.NEWYEAR_ENABLED = 'true';
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.SAJU_DB_PATH = require('node:path').join(require('node:os').tmpdir(), 'newyear-preview.db');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const app = require('../../src/server/app');
const { toPlainText } = require('../../src/llm/newYearReading');
const { newYearWebHtml } = require('../../src/pdf/newYearVisuals');

const sampleFile = path.join(__dirname, 'newyear-generated-sample.json');
const pdfFile = path.join(__dirname, 'newyear-generated-sample.pdf');
const port = Number(process.argv[2]) || 4625;
http.createServer((req, res) => {
  if (/^\/api\/status\/preview-sample/.test(req.url) && fs.existsSync(sampleFile)) {
    const x = JSON.parse(fs.readFileSync(sampleFile, 'utf8'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'done', report: toPlainText(x.reading), visual: newYearWebHtml(x.reading), hasPdf: fs.existsSync(pdfFile), delivery: { status: 'sent', canRetry: false, exhausted: false } }));
  }
  if (/^\/api\/download\/preview-sample/.test(req.url) && fs.existsSync(pdfFile)) {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    return fs.createReadStream(pdfFile).pipe(res);
  }
  app(req, res);
}).listen(port, '127.0.0.1', () => console.log('preview ' + port));
