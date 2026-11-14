'use strict';
// 개발용: 가상 인물 예시(reading-example.json)의 유료 읽기 화면을 390x844(@2x)로 찍어 docs/preview/paid-shots-source/ 에 원본 PNG로 저장한다.
// 샘플: plain(기본, 쉬운 말 '서연') 또는 legacy(예전 '수달'). 사용: node docs/preview/capture-paid-shots.js [plain|legacy]   (결과 webp는 docs/preview/make-paid-webp.js 가 만든다)
const puppeteer = require('puppeteer');
const fs = require('node:fs'), path = require('node:path');
const { start } = require('./serve-example.js');
const out = path.join(__dirname, 'paid-shots-source');
const BAND = '전체 풀이 예시 화면 · 가상 인물';
// 각 장면: 어느 요소의 위에서 몇 px 위로 스크롤할지
const SCENES = [
  { file: 'paid-1.png', sel: '#paidReader .lr-chapter:nth-of-type(1)', offset: -6, note: '인연 신호가 강한 세 달: 1위 달과 해볼 일' },
  { file: 'paid-2.png', sel: '#paidReader .lr-lead', offset: -20, note: '한 줄 답과 12개월 연애 흐름 그래프' },
  { file: 'paid-3.png', sel: '#paidReader .lr-chapter:nth-of-type(2)', offset: -6, note: '서로 끌리는 이유: 끌리는 사람' },
];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const sample = process.argv[2] || 'plain';
  const server = await start(4520, sample);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:4520/love.html?jobId=preview-example', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#paidReader .lr-chapter');
  await page.evaluate((band) => {
    const css = document.createElement('style');
    css.textContent = '.love-header{display:none!important}#stickyBar,.landing-dock{display:none!important}.paid-band{position:fixed;left:0;right:0;top:0;z-index:99999;height:34px;display:flex;align-items:center;justify-content:center;background:#5E0F1E;color:#fff;font:700 13px Pretendard,sans-serif;letter-spacing:-.2px}';
    document.head.appendChild(css);
    const b = document.createElement('div'); b.className = 'paid-band'; b.textContent = band; document.body.appendChild(b);
  }, BAND);
  await page.evaluate(async () => { document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; }); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  await new Promise((r) => setTimeout(r, 800));
  const result = [];
  for (const s of SCENES) {
    const y = await page.evaluate((sel, off) => { const e = document.querySelector(sel); return Math.max(0, Math.round(e.getBoundingClientRect().top + scrollY + off)); }, s.sel, s.offset);
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y);
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(out, s.file) });
    result.push({ file: s.file, scrollY: y, note: s.note });
  }
  fs.writeFileSync(path.join(out, 'scenes.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result));
  await browser.close(); server.close();
  process.exit(0);
})();

