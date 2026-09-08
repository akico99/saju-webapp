'use strict';
/* consult.html 히어로 슬라이드 이미지가 CSS(고정 height:300px + object-fit:cover)로
   표시되던 방식은 컨테이너 "너비"가 넓어질수록(데스크톱 등) 실제로 보이는 원본
   영역이 오히려 줄어드는 문제가 있었다(너비 기준으로 이미지를 맞추고 높이만
   자르기 때문에, 컨테이너가 넓을수록 자르는 비율이 커짐). 그 결과 표지 요약문이나
   챕터 본문이 거의 안 보일 정도로 잘려 보였다.

   근본 해결: 화면에서 CSS로 "일부만" 자르는 대신, 여기서 원본 PNG 자체를 원하는
   영역만큼 미리 잘라 별도 파일로 저장한다. consult.html에서는 이 파일들을 원본
   비율 그대로(height:auto) 보여주기만 하면 되므로, 뷰포트 너비와 무관하게 항상
   같은 내용이 보인다.

   node scripts/cropSampleSlides.js 로 실행 (public/samples/slides/*.png가 이미
   있어야 함 — scripts/generateSampleSlides.js를 먼저 실행). */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const DIR = path.join(__dirname, '..', 'public', 'samples', 'slides');

// 각 원본 이미지에서 "후킹용으로 의미 있는" 영역까지의 높이(px, 원본 좌표계).
// cover: 제목 + 3줄요약 박스 + 생년월일/일간/격국/용신 메타 라인까지
// table: 명식 원국표(8글자·십신·신살) + 요약 바 + 오행 레이더 차트 시작부까지
// chapter1: 챕터 제목 + 키워드 칩 + 첫 문단까지
const CROPS = {
  'cover.png': { out: 'cover-hook.png', height: 1700 },
  'table.png': { out: 'table-hook.png', height: 1580 },
  'chapter1.png': { out: 'chapter1-hook.png', height: 1580 }
};

async function cropTop(browser, srcPath, destPath, cropHeight) {
  const page = await browser.newPage();
  const dataUri = 'data:image/png;base64,' + fs.readFileSync(srcPath).toString('base64');
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;"><img id="i" src="${dataUri}"></body></html>`);
  await page.waitForSelector('#i');
  await page.waitForFunction(() => {
    const el = document.getElementById('i');
    return el.complete && el.naturalWidth > 0;
  });
  const naturalWidth = await page.evaluate(() => document.getElementById('i').naturalWidth);
  await page.setViewport({ width: naturalWidth, height: cropHeight });
  await page.screenshot({ path: destPath, clip: { x: 0, y: 0, width: naturalWidth, height: cropHeight } });
  await page.close();
}

async function main() {
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const [src, cfg] of Object.entries(CROPS)) {
      const srcPath = path.join(DIR, src);
      const destPath = path.join(DIR, cfg.out);
      await cropTop(browser, srcPath, destPath, cfg.height);
      console.log(cfg.out, '완료');
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('크롭 실패:', e); process.exit(1); });
