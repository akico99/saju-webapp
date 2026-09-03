'use strict';
/* report.css를 읽어주는 공용 헬퍼 — 그냥 파일만 읽어 반환하던 예전 방식(각 render*Html.js가
   fs.readFileSync(CSS_PATH)를 따로 호출)의 문제: report.css가 지정하는 한글 폰트('맑은 고딕',
   'Batang' 등)는 전부 윈도우/맥에만 있는 시스템 폰트라, Puppeteer가 리눅스 배포 서버에서
   HTML을 PDF로 인쇄할 때 그 폰트들을 찾지 못해 본문 한글이 통째로 깨지거나 안 보였다
   (pdf-lib로 찍는 페이지 하단 푸터는 이미 번들 폰트를 쓰게 고쳤지만, 그건 별개의 렌더링
   경로라 본문에는 적용되지 않았다).

   해결: 리포에 실제로 들어있는 나눔고딕(본문)·나눔명조(제목, Batang 대체) TTF 파일을
   @font-face로 CSS 맨 앞에 박아 넣는다.

   1차 시도(file:// 절대경로)는 배포 서버에서도 여전히 실패했다 — page.setContent()로
   채운 문서는 about:blank 취급이라, Chromium이 그런 "불투명 출처" 문서에서의 file://
   리소스 로딩을 보안상 차단한다(로컬 Windows에서 안 걸린 이유는 요청이 막혀도 시스템에
   깔린 맑은 고딕이 대체 폰트로 한글을 그려줘서 증상이 가려졌을 뿐, 실제로는 그쪽도
   막혀 있었다). 파일시스템 접근 자체를 거치지 않도록 폰트를 base64 data: URI로 CSS에
   직접 박아 넣는다 — 출처 제약을 받지 않는 인라인 데이터라 어떤 환경에서도 동일하게
   로드된다.

   2차 시도: 나눔고딕/명조(Google Fonts OFL 배포판, 한글 전용 서브셋)는 한자 글리프가
   아예 없어 일간·오행 표기(甲乙, 木火土金水 등)가 빈칸으로 나왔다. CJK 통합 한자를
   전부 포함하는 Noto Sans KR(10MB+)로 전체 교체를 시도했더니, 이번엔 배포 서버에서
   그 큰 폰트를 파싱·래스터라이즈하는 데 몇 분씩 걸려 사실상 요청이 멈춰버렸다(로컬은
   문제없었지만 배포 서버 사양에서는 감당이 안 됨).

   최종 해결: 이 앱이 실제로 쓰는 한자는 십간·십이지·오행·격국·신살 용어 등 정해진
   ~100자뿐이다(scripts/extract-hanja로 소스 전체를 스캔해 뽑음). Noto Sans KR에서
   그 글자들만 fonttools로 서브셋한 초경량 폰트(수십 KB)를 'ReportHanja'라는 별도
   family로 등록하고, 기존 폰트 스택 맨 뒤에 폴백으로만 붙인다 — 나눔고딕/명조가 이미
   갖고 있는 한글은 그대로 쓰고, 그 폰트들에 없는 한자만 이 서브셋 폰트가 글자 단위로
   대신 채워준다(CSS font-family 폴백은 폰트 전체가 아니라 글자마다 개별적으로
   동작한다). 완전판 폰트를 통째로 바꾸는 것보다 훨씬 가볍고 안전하다. */
const fs = require('fs');
const path = require('path');

const CSS_PATH = path.join(__dirname, 'templates', 'report.css');
const GOTHIC_PATH = path.join(__dirname, 'fonts', 'NanumGothic-Regular.ttf');
const MYEONGJO_PATH = path.join(__dirname, 'fonts', 'NanumMyeongjo-Regular.ttf');
const HANJA_PATH = path.join(__dirname, 'fonts', 'ReportHanja.ttf');

let cachedFontFaces = null;
let cachedFull = null;

function toDataUri(fontPath, mime) {
  return `data:${mime};base64,${fs.readFileSync(fontPath).toString('base64')}`;
}

function getFontFaceCss() {
  if (cachedFontFaces) return cachedFontFaces;
  const gothicUrl = toDataUri(GOTHIC_PATH, 'font/truetype');
  const myeongjoUrl = toDataUri(MYEONGJO_PATH, 'font/truetype');
  // ReportHanja.ttf는 fonttools로 Noto Sans CJK KR(OTF/CFF)에서 뽑아낸 서브셋이라
  // TTF가 아니라 OTF(CFF 외곽선)다 — 확장자는 관례상 .ttf로 맞춰뒀지만 실제 포맷은
  // opentype. format() 힌트가 실제 바이트와 달라도 브라우저는 힌트를 강제하지 않고
  // 그냥 로드하지만, 정확한 힌트를 주는 게 맞다.
  const hanjaUrl = toDataUri(HANJA_PATH, 'font/opentype');
  cachedFontFaces = `
@font-face { font-family: 'ReportGothic'; src: url('${gothicUrl}') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'ReportMyeongjo'; src: url('${myeongjoUrl}') format('truetype'); font-weight: normal; font-style: normal; }
@font-face { font-family: 'ReportGothic'; src: url('${hanjaUrl}') format('opentype'); font-weight: normal; font-style: normal; unicode-range: U+4E00-9FFF; }
@font-face { font-family: 'ReportMyeongjo'; src: url('${hanjaUrl}') format('opentype'); font-weight: normal; font-style: normal; unicode-range: U+4E00-9FFF; }
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
