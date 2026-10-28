'use strict';
// 로컬 미리보기 전용: 연애 화면 자산과 궁합 상품을 켜고 임시 DB를 쓴다. 운영 데이터·결제·메일에는 연결하지 않는다.
// /couple.html?jobId=preview-dating 은 가상 커플로 실제 AI 생성한 결과(couple-generate-example.js)를 보여 준다.
process.env.LOVE_TIMING_ENABLED = 'true';
process.env.COMPAT_V2_ENABLED = 'true';
process.env.SAJU_DB_PATH = require('node:path').join(require('node:os').tmpdir(), 'couple-preview.db');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const app = require('../../src/server/app');
const { toPlainText } = require('../../src/llm/coupleReading');
const { coupleWebHtml } = require('../../src/pdf/renderCoupleHtml');

const file = path.join(__dirname, 'couple-generated-dating.json');
const pdf = path.join(__dirname, 'couple-generated-dating.pdf');
const wrap = express();
wrap.get('/api/status/preview-dating', (req, res) => {
  const x = JSON.parse(fs.readFileSync(file, 'utf8'));
  res.json({ status: 'done', report: toPlainText(x.reading), visual: coupleWebHtml(x.reading.timing), hasPdf: fs.existsSync(pdf), delivery: { status: 'sent', canRetry: false, exhausted: false } });
});
wrap.get('/api/download/preview-dating', (req, res) => { res.type('application/pdf'); fs.createReadStream(pdf).pipe(res); });
// app.js에 아직 등록 전이라 여기서 붙인다(/root 통합 뒤에는 app.js가 같은 일을 한다).
wrap.use('/api', express.json(), require('../../src/server/routes/couple'));
wrap.use(app);
wrap.listen(Number(process.env.PORT || 4625), '127.0.0.1', () => console.log('couple preview ' + (process.env.PORT || 4625)));
