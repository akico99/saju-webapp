'use strict';
// 로컬 미리보기 전용(개발용): reading-example.json(가상 인물 '수달'의 실제 AI 생성 예시)을 가상 결제 완료 주문(preview-example)으로 보여 준다.
// 임시 DB를 쓰고 운영 데이터·결제·메일에는 연결하지 않는다. 사용: node docs/preview/serve-example.js [포트=4520]
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.SAJU_DB_PATH = require('node:path').join(require('node:os').tmpdir(), 'love-example-preview-' + process.pid + '.db');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const app = require('../../src/server/app');
const example = JSON.parse(fs.readFileSync(path.join(__dirname, '../../public/love-assets/reading-example.json'), 'utf8'));
function start(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (/^\/api\/status\/preview-example/.test(req.url)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ status: 'done', report: example.paid, visual: example.visual, hasPdf: false, delivery: { status: 'sent', canRetry: false, exhausted: false } }));
      }
      app(req, res);
    }).listen(port, '127.0.0.1', () => resolve(server));
  });
}
module.exports = { start };
if (require.main === module) start(Number(process.argv[2]) || 4520).then(() => console.log('example preview http://127.0.0.1:' + (process.argv[2] || 4520) + '/love.html?jobId=preview-example'));

