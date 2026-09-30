'use strict';
/* 결과물 디자인 전후 비교용 샘플 렌더러 — AI 호출 없이 test/fixtures/sample-readings.json의
   고정 본문으로 주제별 리딩·택일 PDF와 페이지 미리보기 PNG를 만든다.
   사용: node test/manual-visual-samples.js <폴더이름>   (결과: output/visual-samples/<폴더이름>/) */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { computeSaju } = require('../src/engine');
const { buildTimingData, buildCareerTimeline, DEEP_TOPICS } = require('../src/llm/deepReading');
const { renderDeepHtml } = require('../src/pdf/renderDeepHtml');
const { renderDateSelectHtml } = require('../src/pdf/renderDateSelectHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-readings.json'), 'utf8'));
const outDir = path.join(__dirname, '..', 'output', 'visual-samples', process.argv[2] || 'latest');
fs.mkdirSync(outDir, { recursive: true });


/* 택일은 실제 라우트(start)를 그대로 돌린다 — 주문 DB·포인트 차감·LLM 호출만 가짜로 바꿔서
   날짜 계산 → 시각 요소 → PDF까지 운영과 같은 경로를 탄다. */
async function dateSelectSamples() {
  const Module = require('module');
  const root = path.join(__dirname, '..', 'src');
  const captured = [];
  const stubs = {
    [path.join(root, 'db', 'orders.js')]: { findPendingByUserAndProduct: () => null, updateStatus() {}, markDone() {}, markError(id, e) { console.error('markError', e); } },
    [path.join(root, 'db', 'points.js')]: { chargeForProductAndCreateOrder() {}, PRICES: {}, SELLABLE: new Set() },
    [path.join(root, 'server', 'refundPurchase.js')]: { refundPurchase() {} },
    [path.join(root, 'llm', 'dateSelectReading.js')]: { generateDateSelectReport: async () => ({ text: fx.dateSelect.moving, usage: {} }) },
    [path.join(root, 'pdf', 'renderPdf.js')]: { renderPdf: async (html, out, person) => { captured.push({ html, person }); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, ''); } }
  };
  const origLoad = Module._load;
  Module._load = function (req, parent, isMain) {
    try {
      const resolved = Module._resolveFilename(req, parent, isMain);
      if (stubs[resolved]) return stubs[resolved];
    } catch (e) { /* 그대로 진행 */ }
    return origLoad.apply(this, arguments);
  };
  const route = require('../src/server/routes/dateSelect');
  const refundMod = stubs[path.join(root, 'server', 'refundPurchase.js')];
  refundMod.default = refundMod.refundPurchase;
  const b = fx.birth;
  const me = { year: b.year, month: b.month, day: b.day, hour: b.hour, minute: b.minute, gender: b.gender, name: fx.person.name };
  const bodies = {
    moving: { occasion: 'moving', ...me, targetYear: 2026, targetMonth: 11 },
    opening: { occasion: 'opening', ...me, targetYear: 2027, targetMonth: 3, industry: '카페' },
    wedding: { occasion: 'wedding', ...me, pYear: 1992, pMonth: 11, pDay: 3, pHour: 14, pMinute: 0, pGender: '남', pName: '이준호', targetYear: 2027 },
    birth: { occasion: 'birth', baseYear: 2027, baseMonth: 4, baseDay: 20, rangeDays: 5, aYear: 1994, aMonth: 5, aDay: 17, aHour: 9, aGender: '여', aName: '김하늘', bYear: 1992, bMonth: 11, bDay: 3, bHour: 14, bGender: '남', bName: '이준호' }
  };
  const out = [];
  for (const [key, body] of Object.entries(bodies)) {
    captured.length = 0;
    await route.start(1, body);
    for (let i = 0; i < 200 && !captured.length; i++) await new Promise((r) => setTimeout(r, 50));
    if (captured.length) out.push({ key, html: captured[0].html, label: captured[0].person.label });
  }
  Module._load = origLoad;
  return out;
}

async function pngOf(html, file) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.emulateMediaType('print');
    await page.screenshot({ path: file, fullPage: true });
  } finally { await browser.close(); }
}

async function one(name, html, label) {
  const t0 = Date.now();
  await renderPdf(html, path.join(outDir, name + '.pdf'), { name: fx.person.name, label });
  const ms = Date.now() - t0;
  await pngOf(html, path.join(outDir, name + '.png'));
  console.log(name, 'pdf', ms + 'ms', Math.round(fs.statSync(path.join(outDir, name + '.pdf')).size / 1024) + 'KB');
}

(async () => {
  const engine = computeSaju(fx.birth);
  const now = new Date('2026-09-30T12:00:00+09:00');
  const topics = (process.argv[3] || 'wealth').split(',');
  for (const topic of topics) {
    const base = fx.deep.wealth;
    const data = buildTimingData(engine, now);
    if (topic === 'career') data.careerTimeline = buildCareerTimeline(engine, now);
    const reading = { topicKey: topic, title: DEEP_TOPICS[topic].label, chapters: base.chapters.map((c) => ({ ...c, title: DEEP_TOPICS[topic].label })), timing: { ...base.timing, data } };
    await one('deep-' + topic, renderDeepHtml(engine, fx.person, reading), reading.title);
  }
  {
    const { analyzeCompatibility } = require('../src/engine/compatibility');
    const { renderCompatHtml } = require('../src/pdf/renderCompatHtml');
    const engineB = computeSaju({ year: 1992, month: 11, day: 3, hour: 14, minute: 0, gender: '남' });
    const html = renderCompatHtml(engine, engineB, fx.person, { name: '이준호' }, analyzeCompatibility(engine, engineB), fx.deep.wealth.chapters[0].text, 'dating');
    await one('compat', html, '궁합 리포트');
  }
  if (process.argv[4] !== 'no-date') for (const d of await dateSelectSamples()) await one('date-' + d.key, d.html, d.label);
})().catch((e) => { console.error(e); process.exit(1); });


