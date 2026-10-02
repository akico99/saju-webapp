'use strict';
/* 택일 리포트(이사·결혼) 샘플 — 실제 라우트 start()를 그대로 돌리되 주문 DB·포인트·LLM만 가짜로 바꾼다.
   결과: output/visual-samples/afterC/date-<주제>.pdf / .png
   사용: node test/manual-dateselect-sample.js */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const puppeteer = require('puppeteer');

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-readings.json'), 'utf8'));
const outDir = path.join(__dirname, '..', 'output', 'visual-samples', 'afterC');
fs.mkdirSync(outDir, { recursive: true });

// 고정 샘플 본문 — 새 소제목 2개를 "**소제목**\n본문" 형식으로 포함한다.
const SAMPLE = {
  moving: '**언제가 좋을까**\n추천일은 **용신 기운이 가장 잘 채워지는 날**이에요. 오전 시간대에 첫 짐을 들이면 좋아요.\n\n**방향과 동네 분위기**\n전달된 방향과 분위기를 참고해 차분하게 고르면 돼요.\n\n**가장 먼저 들이면 좋은 물건**\n가장 먼저 들일 물건을 현관에 놓고 시작해보세요.\n\n**2·3순위 날짜는 어떤가요**\n2순위는 1순위보다 몇 점 낮지만 평일이라 일정 잡기가 편해요. 3순위도 무리 없는 선택이에요.\n\n**피하면 좋은 날**\n아래 날짜들은 태어난 날과 부딪히는 기운이 있어 **피하는 편이 무난**해요. 꼭 그 날이어야 한다면 크게 부담될 정도는 아니에요.',
  wedding: '**혼인신고, 이날이 좋아요**\n두 사람 모두에게 점수가 높은 주말을 골랐어요.\n\n**두 사람의 실제 궁합**\n서로 맞물리는 지점과 부딪히는 지점을 함께 살펴봤어요.\n\n**다툴 때 이렇게**\n한 사람이 먼저 차분한 톤으로 말을 걸어보세요.\n\n**웨딩과 신혼집의 무드**\n각자의 색과 소재를 섞어 따뜻한 분위기를 만들어보세요.\n\n**2·3순위 날짜는 어떤가요**\n2·3순위 주말도 두 사람 점수 차이가 크지 않아 대안으로 충분해요.\n\n**피하면 좋은 날**\n아래 주말은 점수가 낮아 **피하는 편이 무난**해요.'
};

async function run() {
  const root = path.join(__dirname, '..', 'src');
  const captured = [];
  let topic = 'moving';
  const stubs = {
    [path.join(root, 'db', 'orders.js')]: { findPendingByUserAndProduct: () => null, updateStatus() {}, markDone() {}, markError(id, e) { console.error('markError', e); } },
    [path.join(root, 'db', 'points.js')]: { chargeForProductAndCreateOrder() {}, PRICES: {}, SELLABLE: new Set() },
    [path.join(root, 'server', 'refundPurchase.js')]: { refundPurchase() {} },
    [path.join(root, 'llm', 'dateSelectReading.js')]: { generateDateSelectReport: async (p) => { captured.facts = p; return { text: SAMPLE[topic], usage: {} }; } },
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
  const b = fx.birth;
  const me = { year: b.year, month: b.month, day: b.day, hour: b.hour, minute: b.minute, gender: b.gender, name: fx.person.name };
  const bodies = {
    moving: { occasion: 'moving', ...me, targetYear: 2026, targetMonth: 11 },
    wedding: { occasion: 'wedding', ...me, pYear: 1992, pMonth: 11, pDay: 3, pHour: 14, pMinute: 0, pGender: '남', pName: '이준호', targetYear: 2027 }
  };
  const out = [];
  for (const [key, body] of Object.entries(bodies)) {
    topic = key;
    captured.length = 0;
    await route.start(1, body);
    for (let i = 0; i < 400 && !captured.length; i++) await new Promise((r) => setTimeout(r, 50));
    if (captured.length) out.push({ key, html: captured[0].html, label: captured[0].person.label, facts: captured.facts });
  }
  Module._load = origLoad;
  return out;
}

(async () => {
  const { renderPdf } = require('../src/pdf/renderPdf');
  const samples = await run();
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const d of samples) {
      const t0 = Date.now();
      await renderPdf(d.html, path.join(outDir, 'date-' + d.key + '.pdf'), { name: fx.person.name, label: d.label });
      const ms = Date.now() - t0;
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(d.html, { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.emulateMediaType('print');
      await page.screenshot({ path: path.join(outDir, 'date-' + d.key + '.png'), fullPage: true });
      await page.close();
      console.log(d.key, 'pdf', ms + 'ms', 'alts', JSON.stringify(d.facts.alts), 'avoid', JSON.stringify(d.facts.avoid));
    }
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
