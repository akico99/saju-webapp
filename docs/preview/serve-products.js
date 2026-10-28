'use strict';
// 로컬 미리보기 전용: 네 상품을 켜고, 가상 인물로 실제 생성해 둔 결과를 결제 완료 화면처럼 보여 준다(결제·메일 없음).
// /love.html?jobId=preview-love, /new-year.html?jobId=preview-newyear, /reunion.html?jobId=preview-reunion, /couple.html?jobId=preview-couple
for (const k of ['LOVE_TIMING_ENABLED', 'NEWYEAR_ENABLED', 'REUNION_ENABLED', 'COMPAT_V2_ENABLED']) process.env[k] = 'true';
process.env.SAJU_DB_PATH = require('node:path').join(require('node:os').tmpdir(), 'products-preview.db');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const app = require('../../src/server/app');
const { computeSaju } = require('../../src/engine');
const { sajuChartHtml } = require('../../src/pdf/sajuChart');
const J = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const SAMPLES = {
  love: () => { const x = J('love-generated-single.json'); return { report: require('../../src/llm/loveTimingReading').toPlainText(x.reading), visual: sajuChartHtml(computeSaju(x.birth)) + require('../../src/pdf/loveVisual').loveWebHtml(x.reading.timing) }; },
  newyear: () => { const x = J('newyear-generated-sample.json'); return { report: require('../../src/llm/newYearReading').toPlainText(x.reading), visual: sajuChartHtml(computeSaju(x.birth)) + require('../../src/pdf/newYearVisuals').newYearWebHtml(x.reading) }; },
  reunion: () => { const x = J('reunion-generated-cut.json'); return { report: require('../../src/llm/reunionReading').toPlainText(x.reading), visual: sajuChartHtml(computeSaju(x.case.me.birth), { title: '나의 여덟 글자' }) + sajuChartHtml(computeSaju(x.case.them.birth), { title: '그 사람의 여덟 글자' }) + require('../../src/pdf/renderReunionHtml').reunionWebHtml(x.reading.timing) }; },
  couple: () => { const x = J('couple-generated-dating.json'); return { report: require('../../src/llm/coupleReading').toPlainText(x.reading), visual: sajuChartHtml(computeSaju(x.birthA), { title: '지우의 여덟 글자' }) + sajuChartHtml(computeSaju(x.birthB), { title: '민준의 여덟 글자' }) + require('../../src/pdf/renderCoupleHtml').coupleWebHtml(x.reading.timing) }; }
};
const port = Number(process.argv[2]) || 4630;
http.createServer((req, res) => {
  const m = /^\/api\/status\/preview-(love|newyear|reunion|couple)/.exec(req.url);
  if (m) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'done', ...SAMPLES[m[1]](), hasPdf: false, delivery: null }));
  }
  app(req, res);
}).listen(port, '127.0.0.1', () => console.log('preview ' + port));

