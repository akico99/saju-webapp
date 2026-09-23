'use strict';
/* GA4(구글 애널리틱스) 스니펫을 고객이 실제로 방문하는 페이지들의 <head>에 일괄 삽입.
   관리자 전용 페이지(admin*.html)는 대표님 본인 사용 트래픽이라 분석 대상에서 제외했다.
   한 번 실행한 뒤 재실행해도 중복 삽입되지 않도록 측정 ID 문자열 존재 여부를 먼저 확인한다.
   node scripts/injectGA.js 로 실행. */
const fs = require('fs');
const path = require('path');

const GA_ID = 'G-THWHBPH5WR';
const SNIPPET = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_ID}');
</script>
`;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PAGES = [
  'birth-timing.html', 'career-timing.html', 'charge.html', 'compat.html', 'consult.html',
  'date-select.html', 'forgot-password.html', 'index.html', 'life-graph.html', 'life-topics.html',
  'lifetime-report.html', 'login.html', 'mypage.html', 'premium.html', 'privacy.html',
  'profiles.html', 'quick.html', 'reset-password.html', 'reunion-check.html', 'signup.html',
  'terms.html', 'today-fortune.html', 'today-preview.html', 'webtoon/lifetime.html'
];

let changed = 0, skipped = 0;
for (const file of PAGES) {
  const filePath = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(filePath)) { console.log('없음(건너뜀):', file); continue; }
  const html = fs.readFileSync(filePath, 'utf8');
  if (html.includes(GA_ID)) { console.log('이미 있음(건너뜀):', file); skipped++; continue; }
  if (!html.includes('<head>')) { console.log('<head> 못 찾음(건너뜀):', file); continue; }
  const updated = html.replace('<head>', `<head>\n${SNIPPET}`);
  fs.writeFileSync(filePath, updated);
  console.log('삽입 완료:', file);
  changed++;
}
console.log(`\n총 ${changed}개 삽입, ${skipped}개 건너뜀`);
