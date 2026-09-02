'use strict';
/* Puppeteer로 HTML 문자열 → PDF 파일. 차트가 실제로 그려질 때까지
   window.__chartsReady 플래그를 기다린 뒤 인쇄한다(빈 캔버스 방지).

   ## 페이지 상하단 흰 줄 — 근본 해결 (v2)
   예전 버전은 margin>0 + Puppeteer headerTemplate/footerTemplate으로 다크 배경을
   칠하는 방식을 썼는데, Chromium이 그 템플릿 콘텐츠를 페이지 가장자리에서 고정폭
   (~5.3~5.4mm)만큼 안쪽으로 강제로 밀어 넣는 하드코딩된 동작 때문에 그 폭만큼은
   절대 칠할 수 없는 흰 틈이 항상 남았다(margin을 10/20/40mm 등 무엇으로 바꿔도
   틈은 5.42mm로 동일 — 자세한 실험 경위는 docs/design-decisions.md 참고). 여러
   시도 끝에 margin을 최소화하고 금색 테두리로 가려봤지만, 근본적으로 "완전히
   여백 없는 다크 배경"은 header/footerTemplate 메커니즘으로는 불가능했다.

   v2는 그 메커니즘 자체를 버린다:
   1. margin을 전부 0으로 둬 페이지 전체(가장자리까지)를 본문 배경색이 그대로
      덮는다 — Chromium의 강제 인셋 버그가 애초에 발동할 대상(header/footerTemplate)이
      없으므로 이 문제가 원천적으로 사라진다(`page.get_drawings()`로 배경 사각형이
      [0,0]~[페이지 전체]를 정확히 덮는 것을 확인함).
   2. margin이 0이면 본문 섹션(.chapter 등)의 padding이 그 섹션의 "첫 페이지"에만
      적용되고 문단이 이어지는 "연속 페이지"에는 적용되지 않는 것이 CSS 프래그먼테이션
      기본 동작이라, 그대로 두면 연속 페이지에서 글자가 페이지 가장자리에 거의 붙어버린다.
      `box-decoration-break: clone`을 그 섹션에 주면 padding/border/background가
      "매 페이지 조각마다" 반복 적용된다 — 이걸로 모든 페이지(연속 페이지 포함)에서
      균일한 여백을 확보했다(실측: 연속 페이지 첫 줄이 페이지 상단에서 항상 동일하게
      떨어져 시작함).
   3. 페이지 번호는 더 이상 Puppeteer의 header/footerTemplate으로 넣지 않는다(그러려면
      다시 margin>0이 필요해 1번을 무효화시킴). 대신 Puppeteer가 만든 완성 PDF를
      pdf-lib로 열어, 각 페이지 하단에 페이지 번호(와 이름)를 직접 그려 넣는
      후처리 단계를 추가했다 — Chromium의 header/footer 렌더링 경로를 아예 타지
      않으므로 위 버그와 완전히 무관하다. */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const GOLD_RGB = rgb(0.7804, 0.6314, 0.2275);
const MUTED_RGB = rgb(0.5529, 0.5882, 0.7216);

/* pdf-lib의 StandardFonts(Helvetica 등)는 한글 글리프가 없어 이름을 그대로 못 그린다
   (WinAnsi 인코딩만 지원). "OOO 님의 평생사주" 같은 한글 푸터 텍스트를 그리려면 한글
   글리프가 있는 TTF를 fontkit으로 임베드해야 한다 — 예전엔 로컬 윈도우의 맑은 고딕
   경로(C:\Windows\Fonts\malgun.ttf)를 직접 가리켰는데, 그 경로는 그 개발 PC에만
   존재해서 리눅스인 배포 서버(Render)에서는 파일을 못 찾아 PDF 생성이 조용히 계속
   실패했다(주문이 "생성 중"에 멈춘 채 끝나지 않음). OS에 있는 폰트에 기대는 대신
   OFL 라이선스 나눔고딕을 리포에 함께 커밋해 두 환경에서 완전히 동일하게 동작한다. */
const KOREAN_FONT_PATH = path.join(__dirname, 'fonts', 'NanumGothic-Regular.ttf');

/**
 * @param {string} html renderHtml()의 결과
 * @param {string} outputPath 저장할 .pdf 경로
 * @param {{name?: string, label?: string}} person 페이지 번호 옆에 표시할 이름.
 *   label을 생략하면 "평생사주"(본편/궁합 리포트용 기본값)를 쓰고,
 *   마이크로 리딩처럼 다른 상품명이 필요하면 label로 덮어쓴다(예: "재물운").
 */
async function renderPdf(html, outputPath, person = {}) {
  const browser = await puppeteer.launch({ headless: true });
  let pdfBytes;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction('window.__chartsReady === true', { timeout: 10000 });
    // `load` 이벤트는 @font-face로 넣은 커스텀 폰트의 다운로드 완료를 보장하지 않는다.
    // 로컬(Windows)은 폰트가 안 떴어도 시스템 대체 폰트(맑은 고딕 등)가 한글을 그려줘서
    // 문제가 안 보였지만, 배포 서버(Linux)는 대체 폰트에 한글 글리프가 전혀 없어서
    // 이 레이스에서 지면 텍스트는 있는데 글자만 안 그려지는(복붙은 되는데 안 보이는)
    // 현상이 났다. document.fonts.ready로 실제 로드 완료를 기다린다.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' }
    });
  } finally {
    await browser.close();
  }

  const label = person.label || '평생사주';
  const footerName = person.name ? `${person.name} 님의 ${label}` : label;
  const stamped = await stampPageNumbers(pdfBytes, footerName);
  fs.writeFileSync(outputPath, stamped);
}

/** 완성된 PDF에 페이지 번호(와 이름)를 하단에 직접 그려 넣는다. */
async function stampPageNumbers(pdfBytes, footerName) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(KOREAN_FONT_PATH);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const pages = pdfDoc.getPages();
  const total = pages.length;

  pages.forEach((p, i) => {
    const { width } = p.getSize();
    const y = 22; // 페이지 하단에서 ~7.8mm
    p.drawText(footerName, { x: 74, y, size: 7, font, color: MUTED_RGB });
    const pageLabel = `${i + 1} / ${total}`;
    const textWidth = font.widthOfTextAtSize(pageLabel, 8);
    p.drawText(pageLabel, {
      x: width - 74 - textWidth, y, size: 8, font, color: GOLD_RGB
    });
  });

  return pdfDoc.save();
}

module.exports = { renderPdf };
