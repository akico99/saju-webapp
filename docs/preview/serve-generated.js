'use strict';
// 로컬 미리보기 전용: 연애 상품을 켜고 임시 DB를 쓴다. 운영 데이터·결제·메일에는 연결하지 않는다.
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.SAJU_DB_PATH = require('node:path').join(require('node:os').tmpdir(), 'love-preview.db');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const app = require('../../src/server/app');
const { toPlainText } = require('../../src/llm/loveTimingReading');
const { loveWebHtml } = require('../../src/pdf/loveVisual');

// 가상 결제 완료 주문: /love.html?jobId=preview-single (some, breakup도 가능).
// 가상 인물로 실제 AI 생성한 결과(generate-love-examples.js)와 그 PDF를 보여준다.
function sample(kind) {
  const file = path.join(__dirname, 'love-generated-' + kind + '.json');
  return /^(single|some|breakup)$/.test(kind) && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
http.createServer((req, res) => {
  const status = /^\/api\/status\/preview-(\w+)/.exec(req.url);
  if (status) {
    const x = sample(status[1]);
    if (!x) { res.writeHead(404); return res.end(); }
    const hasPdf = fs.existsSync(path.join(__dirname, 'love-generated-' + status[1] + '.pdf'));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'done', report: toPlainText(x.reading), visual: loveWebHtml(x.reading.timing), hasPdf, delivery: { status: 'sent', canRetry: false, exhausted: false } }));
  }
  const pdf = /^\/api\/download\/preview-(\w+)/.exec(req.url);
  if (pdf && sample(pdf[1])) {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    return fs.createReadStream(path.join(__dirname, 'love-generated-' + pdf[1] + '.pdf')).pipe(res);
  }
  app(req, res);
}).listen(4624, '0.0.0.0', () => console.log('preview 4624'));
