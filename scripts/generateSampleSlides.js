'use strict';
/* consult.html 히어로 슬라이드용 — 실제 렌더링 파이프라인(report.ejs + report.css) 그대로
   화면 스크린샷을 떠서 "실제 리포트 페이지"를 그대로 보여주는 이미지 3장을 만든다.
   1) 표지 (이름 · 3줄 요약)  2) 명식 원국표 + 오행 차트  3) 실제 생성된 챕터 본문(총평)
   generateSamplePdf.js가 output/_sample-hong-gildong/chapters.json에 이미 실제 챕터를
   incremental하게 저장해두므로, 그 파일에서 챕터 1(총평)만 읽어 쓴다(전체 18개가
   다 끝날 때까지 기다릴 필요 없음 — chapters.json은 매 챕터 끝날 때마다 갱신됨).
   node scripts/generateSampleSlides.js 로 실행. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { computeSaju } = require('../src/engine/index');
const { generateCoverSummary } = require('../src/llm/coverSummary');
const { CHAPTERS } = require('../src/llm/chapters');
const { renderHtml } = require('../src/pdf/renderHtml');

const OUT_DIR = path.join(__dirname, '..', 'public', 'samples', 'slides');
const CHAPTERS_JSON = path.join(__dirname, '..', 'output', '_sample-hong-gildong', 'chapters.json');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const input = {
    year: 1990, month: 5, day: 15, hour: 14, minute: 30,
    gender: '남', isLunar: false, isLeap: false, city: null, lonOff: false
  };
  const engineResult = computeSaju(input);
  const person = { name: '홍길동', gender: input.gender };

  if (!fs.existsSync(CHAPTERS_JSON)) {
    throw new Error('chapters.json이 아직 없습니다. scripts/generateSamplePdf.js를 먼저(또는 동시에) 실행하세요.');
  }
  const saved = JSON.parse(fs.readFileSync(CHAPTERS_JSON, 'utf8'));
  const realChapter1 = saved[0]; // 총평 — index 0
  if (!realChapter1) {
    throw new Error('챕터 1(총평)이 아직 생성되지 않았습니다. 잠시 후 다시 시도하세요.');
  }
  // 나머지 17개는 화면에 안 나오는 자리채우기 — 템플릿이 chapter.text.split()을
  // 호출하므로 null이 아니기만 하면 된다.
  const chapters = CHAPTERS.map((meta, i) => saved[i] || { id: meta.id, title: meta.title, text: '(준비 중)' });

  console.log('표지 요약 생성 중...');
  const coverResult = await generateCoverSummary(engineResult, person).catch(() => null);
  const coverSummary = coverResult ? coverResult.lines : null;

  const html = renderHtml(engineResult, chapters, person, coverSummary);

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1400, deviceScaleFactor: 2 }); // A4 폭(210mm ≈ 794px @96dpi)
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 });
    await page.evaluate(async () => { await document.fonts.ready; });

    const coverEl = await page.$('.cover');
    await coverEl.screenshot({ path: path.join(OUT_DIR, 'cover.png') });
    console.log('cover.png 완료');

    const tableEl = await page.$('#myeongsik');
    await tableEl.screenshot({ path: path.join(OUT_DIR, 'table.png') });
    console.log('table.png 완료');

    // 챕터 1(총평) 본문 — 실제 챕터는 여러 페이지 분량이라 전체를 그대로 캡처하고,
    // "페이지 미리보기"처럼 위쪽 일부만 보여주는 크롭은 consult.html 쪽에서
    // CSS(고정 높이 컨테이너 + overflow hidden + object-position: top)로 처리한다
    // — 여기서 좌표를 직접 계산하면(boundingBox 기반 clip) 레이아웃이 조금만 바뀌어도
    // 엉뚱한 위치가 잘려나가는 문제가 있어(실제로 겪음), element.screenshot()으로
    // 항상 정확히 그 요소의 시작점부터 전체를 담는 쪽이 훨씬 안정적이다.
    const ch1El = await page.$('#ch-1');
    await ch1El.screenshot({ path: path.join(OUT_DIR, 'chapter1.png') });
    console.log('chapter1.png 완료');
  } finally {
    await browser.close();
  }

  console.log('모든 슬라이드 이미지 생성 완료:', OUT_DIR);
}

main().catch((e) => {
  console.error('슬라이드 생성 실패:', e);
  process.exit(1);
});
