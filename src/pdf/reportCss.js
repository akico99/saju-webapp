'use strict';
/* report.css를 읽어주는 공용 헬퍼 — 그냥 파일만 읽어 반환하던 예전 방식(각 render*Html.js가
   fs.readFileSync(CSS_PATH)를 따로 호출)의 문제: report.css가 지정하는 한글 폰트('맑은 고딕',
   'Batang' 등)는 전부 윈도우/맥에만 있는 시스템 폰트라, Puppeteer가 리눅스 배포 서버에서
   HTML을 PDF로 인쇄할 때 그 폰트들을 찾지 못해 본문 한글이 통째로 깨지거나 안 보였다
   (pdf-lib로 찍는 페이지 하단 푸터는 이미 번들 폰트를 쓰게 고쳤지만, 그건 별개의 렌더링
   경로라 본문에는 적용되지 않았다).

   해결: 리포에 실제로 들어있는 나눔고딕(본문)·나눔명조(제목, Batang 대체) TTF 파일을
   @font-face로 파일 경로째 CSS 맨 앞에 박아 넣는다. Puppeteer는 로컬 HTML 문자열을
   page.setContent()로 그대로 렌더링하므로 상대경로를 못 쓰고, file:// 절대경로가 필요하다
   (url.pathToFileURL이 윈도우/리눅스 경로 차이를 알아서 처리해준다). 시스템에 뭐가 깔려
   있든 상관없이 항상 같은 폰트로 렌더링되므로, 개발 PC와 배포 서버의 결과물도 동일해진다. */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const CSS_PATH = path.join(__dirname, 'templates', 'report.css');
const GOTHIC_PATH = path.join(__dirname, 'fonts', 'NanumGothic-Regular.ttf');
const MYEONGJO_PATH = path.join(__dirname, 'fonts', 'NanumMyeongjo-Regular.ttf');

let cachedFontFaces = null;
let cachedFull = null;

function getFontFaceCss() {
  if (cachedFontFaces) return cachedFontFaces;
  const gothicUrl = pathToFileURL(GOTHIC_PATH).href;
  const myeongjoUrl = pathToFileURL(MYEONGJO_PATH).href;
  cachedFontFaces = `
@font-face { font-family: 'ReportGothic'; src: url('${gothicUrl}') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'ReportMyeongjo'; src: url('${myeongjoUrl}') format('truetype'); font-weight: normal; font-style: normal; }
`;
  return cachedFontFaces;
}

// report.css를 쓰는 템플릿(quick/compat/full/date-select)용 — @font-face + report.css를 합쳐 반환한다.
function getReportCss() {
  if (cachedFull) return cachedFull;
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  cachedFull = getFontFaceCss() + css;
  return cachedFull;
}

module.exports = { getReportCss, getFontFaceCss };
