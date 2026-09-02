'use strict';
/* report.css를 읽어주는 공용 헬퍼 — 그냥 파일만 읽어 반환하던 예전 방식(각 render*Html.js가
   fs.readFileSync(CSS_PATH)를 따로 호출)의 문제: report.css가 지정하는 한글 폰트('맑은 고딕',
   'Batang' 등)는 전부 윈도우/맥에만 있는 시스템 폰트라, Puppeteer가 리눅스 배포 서버에서
   HTML을 PDF로 인쇄할 때 그 폰트들을 찾지 못해 본문 한글이 통째로 깨지거나 안 보였다
   (pdf-lib로 찍는 페이지 하단 푸터는 이미 번들 폰트를 쓰게 고쳤지만, 그건 별개의 렌더링
   경로라 본문에는 적용되지 않았다).

   해결: @font-face로 CSS 맨 앞에 폰트를 박아 넣는다.

   1차 시도(file:// 절대경로)는 배포 서버에서도 여전히 실패했다 — page.setContent()로
   채운 문서는 about:blank 취급이라, Chromium이 그런 "불투명 출처" 문서에서의 file://
   리소스 로딩을 보안상 차단한다(로컬 Windows에서 안 걸린 이유는 요청이 막혀도 시스템에
   깔린 맑은 고딕이 대체 폰트로 한글을 그려줘서 증상이 가려졌을 뿐, 실제로는 그쪽도
   막혀 있었다). 파일시스템 접근 자체를 거치지 않도록 폰트를 base64 data: URI로 CSS에
   직접 박아 넣는다 — 출처 제약을 받지 않는 인라인 데이터라 어떤 환경에서도 동일하게
   로드된다.

   2차 시도(나눔고딕/나눔명조, Google Fonts OFL 배포판)는 base64로는 잘 로드됐지만
   한글(한글 음절)만 그려지고 한자(甲乙丙丁, 木火土金水 같은 일간·오행 표기용 한자)는
   전부 빈칸으로 나왔다 — 그 배포판이 한글 전용으로 줄인 서브셋이라 한자 글리프 자체가
   없었다. 사주 리포트는 일간·오행을 한자와 함께 표기하는 곳이 많아 이 글자들이 반드시
   필요하다. 구글 Noto Sans KR(가변 폰트, CJK 통합 한자 전체 포함)로 교체 — 제목용
   'ReportMyeongjo'도 별도 세리프 폰트 대신 같은 폰트를 쓴다(세리프 느낌은 포기하지만,
   전용 세리프+한자 완전판은 20MB를 넘어가 인쇄 시간이 지나치게 늘어난다). */
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, 'templates', 'report.css');
const GOTHIC_PATH = path.join(__dirname, 'fonts', 'NotoSansKR-Regular.ttf');
const MYEONGJO_PATH = path.join(__dirname, 'fonts', 'NotoSansKR-Regular.ttf');

let cachedFontFaces = null;
let cachedFull = null;

function toDataUri(fontPath) {
  return `data:font/truetype;base64,${fs.readFileSync(fontPath).toString('base64')}`;
}

function getFontFaceCss() {
  if (cachedFontFaces) return cachedFontFaces;
  const gothicUrl = toDataUri(GOTHIC_PATH);
  const myeongjoUrl = toDataUri(MYEONGJO_PATH);
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
