'use strict';
// 로컬 미리보기 전용: 연애 상품을 켜고 임시 DB를 쓴다. 운영 데이터·결제에는 연결하지 않는다.
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.SAJU_DB_PATH = require('node:path').join(require('node:os').tmpdir(), 'love-preview.db');
const http = require('node:http');
const app = require('../../src/server/app');
const example = require('../../public/love-assets/reading-example.json');
// 가상 결제 완료 주문: 결제·생성 서버를 거치지 않고 저장된 가상 인물 예시 풀이만 돌려준다.
http.createServer((req, res) => {
  if (req.url.startsWith('/api/status/preview-paid')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'done', report: example.paid, visual: '' }));
  }
  app(req, res);
}).listen(4623, '0.0.0.0', () => console.log('preview 4623'));
