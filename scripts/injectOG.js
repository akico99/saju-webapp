'use strict';
/* OG(오픈그래프)·트위터 카드·meta description을 고객 대면 페이지 <head>에 일괄 삽입.

   왜 필요한가: 인생 그래프에 "링크로 공유하기"가 있고 상품 페이지도 카카오톡으로 오가는데,
   지금까지 어느 페이지에도 og:* 태그가 없어서 링크를 붙여넣으면 제목도 그림도 없는 맨 주소만
   갔다. 공유가 사실상 유일한 무료 유입 경로인데 그 마지막 한 칸이 비어 있던 셈이다.

   - og:image는 절대 URL이어야 카카오톡·페이스북 크롤러가 읽는다. 정적 HTML이라 런타임에
     BASE_URL을 끼워 넣을 수 없어 배포 도메인을 상수로 둔다(docs/design-decisions.md 참고).
   - og:title은 각 페이지의 <title>을 그대로 쓴다. 제목을 두 군데서 관리하면 반드시 어긋난다.
   - 대상은 아래 PAGES 목록에 적은 페이지뿐이다. 판매 종료 후 리다이렉트만 남은 페이지
     (life-topics·career-timing·birth-timing·reunion-check)는 애초에 목록에 넣지 않는다.
     본문에서 location.replace 사용 여부로 판별하려 했더니, 파라미터 기본값을 채우는 데
     같은 함수를 쓰는 free.html까지 걸러졌다.
   - injectGA.js와 같은 원칙으로 재실행해도 중복 삽입되지 않는다(og:title 존재 여부로 확인).

   node scripts/injectOG.js 로 실행. */
const fs = require('fs');
const path = require('path');

const SITE = 'https://sajuotter.com';
const SITE_NAME = '사주보는 수달';
const DEFAULT_IMAGE = '/og-cover.jpg';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* 설명문은 검색 결과와 카카오톡 미리보기에 그대로 보이는 문장이다. 큰따옴표는 속성값을
   깨뜨리므로 쓰지 않는다. */
const PAGES = {
  'index.html': '실제 만세력 엔진으로 계산한 사주. 오늘의 운세와 인생 그래프는 무료로 보고, 재물·직업·궁합·평생사주는 궁금한 주제만 골라서 봅니다.',
  'services.html': '무료 미니 리딩부터 평생사주 100페이지까지, 사주보는 수달의 전체 서비스를 한눈에 봅니다.',
  'free.html': '생년월일만 넣으면 오행 밸런스·사주 속 귀인·타고난 매력을 바로 봅니다. 로그인도 결제도 없이 무료입니다.',
  'life-graph.html': '대운과 세운이 바뀔 때마다 내 기운이 어떻게 출렁이는지 그래프 한 장으로 봅니다. 무료입니다.',
  'today-preview.html': '생년월일만 넣으면 오늘 하루의 흐름과 앞으로 7일을 무료로 봅니다.',
  'today-fortune.html': '내 명식을 기준으로 계산한 오늘의 운세와 앞으로 7일의 흐름을 봅니다.',
  'quick.html': '재물·직업·애정·대인관계·건강 중 궁금한 주제 하나를 깊게 봅니다. 타고난 구조부터 지금 대운과 앞으로 3년까지.',
  'compat.html': '두 사람의 명식을 나란히 놓고 상성과 시기를 봅니다. 연애·결혼·부부·재회 중 관계에 맞는 관점으로 풀어드립니다.',
  'date-select.html': '이사·개업·결혼·임신과 출산처럼 중요한 순간의 날짜를 실제 만세력으로 계산해 고릅니다.',
  'lifetime-report.html': '태어난 순간부터 지금까지, 명식·격국·용신·대운을 모두 담은 평생사주 100페이지 리포트.',
  'consult.html': '카카오톡으로 편하게 물어보고 결과를 PDF로 받습니다. 어떤 서비스가 맞는지부터 안내해드립니다.',
  'premium.html': '더 깊이 보고 싶을 때 고르는 사주보는 수달의 프리미엄 리포트.',
  'login.html': '사주보는 수달 로그인.',
  'signup.html': '사주보는 수달 회원가입. 받은 리포트를 저장해두고 언제든 다시 볼 수 있습니다.',
  'mypage.html': '내가 받은 리포트와 저장해둔 인물을 관리합니다.',
  'profiles.html': '나·배우자·자녀처럼 자주 보는 사람의 생년월일시를 저장해두고 매번 다시 입력하지 않고 불러옵니다.',
  'forgot-password.html': '비밀번호 재설정 메일을 받습니다.',
  'reset-password.html': '새 비밀번호를 설정합니다.',
  'terms.html': '사주보는 수달 이용약관.',
  'privacy.html': '사주보는 수달 개인정보처리방침.'
};

function canonicalPath(file) {
  return file === 'index.html' ? '/' : '/' + file;
}

function blockFor(file, title, description) {
  const url = SITE + canonicalPath(file);
  return [
    '<meta name="description" content="' + description + '">',
    '<link rel="canonical" href="' + url + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + SITE_NAME + '">',
    '<meta property="og:title" content="' + title + '">',
    '<meta property="og:description" content="' + description + '">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:image" content="' + SITE + DEFAULT_IMAGE + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:locale" content="ko_KR">',
    '<meta name="twitter:card" content="summary_large_image">'
  ].join('\n');
}

let changed = 0, skipped = 0;
for (const [file, description] of Object.entries(PAGES)) {
  const filePath = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(filePath)) { console.log('없음(건너뜀):', file); continue; }
  const html = fs.readFileSync(filePath, 'utf8');
  if (html.includes('og:title')) { console.log('이미 있음(건너뜀):', file); skipped++; continue; }

  const match = html.match(/<title>([^<]*)<\/title>/);
  if (!match) { console.log('<title> 못 찾음(건너뜀):', file); continue; }

  const updated = html.replace(match[0], match[0] + '\n' + blockFor(file, match[1].trim(), description));
  fs.writeFileSync(filePath, updated);
  console.log('삽입 완료:', file);
  changed++;
}
console.log('\n총 ' + changed + '개 삽입, ' + skipped + '개 건너뜀');
