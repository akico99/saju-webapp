'use strict';
/* 검색·공유용 메타데이터를 한곳에서 관리한다. 실행: node scripts/buildSeo.js

   이 스크립트가 하는 일
   1) PAGES에 적은 고객 대면 페이지의 <head>를 맞춘다 — <title>, meta description, canonical,
      Open Graph, 트위터 카드, JSON-LD 구조화 데이터. 기존 블록은 지우고 다시 쓰므로 몇 번을
      실행해도 결과가 같다.
   2) 판매 종료 후 이동만 하는 페이지(REDIRECT_STUBS)에 noindex와 이동할 곳의 canonical을 단다.
   3) public/sitemap.xml과 public/robots.txt를 새로 만든다. lastmod는 각 파일의 마지막 커밋 날짜,
      아직 커밋하지 않은 수정이 있으면 오늘 날짜다(구글은 정확한 lastmod만 믿는다).

   키워드 원칙(claude-seo 스킬의 keyword-density·seo-schema 기준)
   - 핵심 키워드는 제목 앞쪽, 설명, H1 또는 첫 문단, JSON-LD의 name·description·keywords에 한 번씩
     자연스럽게 넣는다. 같은 단어를 반복해서 채우면 스팸으로 본다.
   - JSON-LD에는 페이지에 실제로 있는 상품·가격만 적는다. 가격을 바꾸면 여기도 같이 바꾼다.
   - FORTUNE_YEAR는 해가 바뀌면 올린다(사주 도감은 올해·내년 세운을 보여 준다).
   - og:title은 <title>과 같게 둔다. 두 곳에서 관리하면 어긋난다. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = 'https://sajuotter.com';
const SITE_NAME = '사주보는 수달';
const OG_IMAGE = SITE + '/og-cover.jpg';
const FORTUNE_YEAR = 2026;
const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
// 서버와 같은 설정을 읽는다. 공개 전 상품은 사이트맵에 넣지 않는다.
require('dotenv').config({ path: path.join(ROOT, '.env') });
const newYear = require('../src/config/newYear');

const Y = FORTUNE_YEAR;

/* service가 있는 페이지는 Service + Offer를 JSON-LD에 넣는다. price는 원 단위 숫자, 무료는 0.
   catalog는 한 페이지에서 여러 주제를 파는 경우(주제별 심층 리딩)에만 쓴다.
   sitemap: true인 페이지만 사이트맵에 들어간다. manageHead: false면 <head>는 손대지 않고
   사이트맵에만 넣는다(웹툰은 제목·설명을 직접 관리한다). */
const PAGES = [
  {
    file: 'new-year.html', sitemap: newYear.enabled, crumb: newYear.year + '년 신년운세',
    robots: newYear.enabled ? null : 'noindex, follow',
    title: newYear.year + '년 신년운세 리포트 | ' + SITE_NAME,
    description: newYear.year + '년 총운과 12개월 흐름, 재물·일·애정·건강 풀이를 담은 AI 신년운세 리포트. 웹 결과와 PDF, 공유 카드를 제공합니다.' +
      (newYear.enabled ? ' ' + newYear.priceKrw.toLocaleString('ko-KR') + '원.' : ' 상품 준비 중입니다.'),
    keywords: [newYear.year + '년 신년운세', '신년운세', '월별 운세'],
    service: newYear.enabled ? { name: newYear.year + '년 신년운세 리포트', serviceType: '사주 풀이', price: newYear.priceKrw } : null
  },
  {
    file: 'index.html', sitemap: true, crumb: '홈',
    title: '사주 풀이·' + Y + '년 신년운세·사주 궁합 | ' + SITE_NAME,
    description: '사람의 개입이 없는 AI 사주 서비스. 실제 만세력으로 계산해 바로 리포트로 드려요. 오늘의 운세와 ' + Y + '년 신년운세는 무료로 보고, 사주 궁합·이직운·재물운·평생사주는 궁금한 주제만 골라 봅니다.',
    keywords: ['사주 풀이', '무료 사주', Y + '년 신년운세', '사주 궁합', '이직운', '오늘의 운세', '평생사주']
  },
  {
    file: 'services.html', sitemap: true, crumb: '전체 서비스', pageType: 'CollectionPage',
    title: '사주 궁합·이직운·신년운세 전체 서비스 | ' + SITE_NAME,
    description: Y + '년 신년운세를 담은 무료 사주 도감과 오늘의 운세부터 사주 궁합, 이직운을 보는 직업·적성운, 평생사주 100페이지까지 전체 서비스를 한눈에 봅니다.',
    keywords: ['사주 서비스', Y + '년 신년운세', '사주 궁합', '이직운', '무료 사주']
  },
  {
    file: 'field-guide.html', sitemap: true, crumb: '사주 도감',
    title: Y + '년 신년운세 무료 사주 도감 | ' + SITE_NAME,
    description: '생년월일로 보는 ' + Y + '년 신년운세와 ' + (Y + 1) + '년 흐름. 실제 만세력으로 계산한 타고난 체질, 지금 대운, 올해와 내년의 세운을 무료 사주 도감 한 장에 담아 드려요.',
    keywords: [Y + '년 신년운세', Y + '년 운세', (Y + 1) + '년 운세', '무료 사주', '세운', '사주 도감'],
    service: { name: '사주 도감 (' + Y + '년 신년운세 포함)', serviceType: '무료 사주 풀이', price: 0 }
  },
  {
    file: 'today-preview.html', sitemap: true, crumb: '오늘의 운세',
    title: '오늘의 운세 무료 | 생년월일로 보는 7일 흐름 - ' + SITE_NAME,
    description: '생년월일만 넣으면 내 사주를 기준으로 계산한 오늘의 운세와 앞으로 7일의 흐름을 무료로 봅니다. 로그인 없이 바로 확인하세요.',
    keywords: ['오늘의 운세', '무료 운세', '사주 운세', '7일 운세'],
    service: { name: '오늘의 운세', serviceType: '무료 운세', price: 0 }
  },
  {
    file: 'today-fortune.html', sitemap: false, crumb: '오늘의 운세',
    title: '오늘의 운세 | ' + SITE_NAME,
    description: '내 명식을 기준으로 계산한 오늘의 운세와 앞으로 7일의 흐름을 봅니다.',
    keywords: ['오늘의 운세']
  },
  {
    file: 'life-graph.html', sitemap: true, crumb: '인생 그래프',
    title: '인생 그래프 무료 | 대운·세운으로 보는 사주 흐름 - ' + SITE_NAME,
    description: '대운과 해마다 바뀌는 세운에 따라 내 기운이 어떻게 출렁이는지 인생 그래프 한 장으로 봅니다. ' + Y + '년이 흐름의 어디쯤인지도 함께 보여 드려요. 무료입니다.',
    keywords: ['인생 그래프', '대운', '세운', Y + '년 운세', '무료 사주'],
    service: { name: '인생 그래프', serviceType: '무료 사주 풀이', price: 0 }
  },
  {
    file: 'free.html', sitemap: true, crumb: '무료 미니 리딩',
    title: '무료 사주 풀이 | 오행 밸런스·귀인·타고난 매력 - ' + SITE_NAME,
    description: '생년월일만 넣으면 오행 밸런스, 사주 속 귀인, 타고난 매력을 바로 보는 무료 사주 풀이. 로그인도 결제도 필요 없습니다.',
    keywords: ['무료 사주 풀이', '오행', '귀인', '무료 사주'],
    service: { name: '무료 미니 리딩', serviceType: '무료 사주 풀이', price: 0 }
  },
  {
    file: 'quick.html', sitemap: true, crumb: '주제별 심층 리딩',
    title: '이직운·재물운·애정운 사주 풀이 | ' + SITE_NAME,
    description: '5년 이직 타임라인을 담은 이직운(직업·적성운)부터 재물운, 애정·결혼운, 대인관계, 건강운까지 궁금한 주제 하나를 깊게 봅니다. 주제당 3,900원.',
    keywords: ['이직운', '직업운', '재물운', '애정운', '사주 풀이'],
    service: {
      name: '주제별 심층 사주 리딩', serviceType: '사주 풀이', price: 3900,
      catalog: [
        ['직업·적성운 (이직운, 5년 이직 타임라인)', 'career'],
        ['재물운', 'wealth'],
        ['애정·결혼운', 'love'],
        ['대인관계·인복', 'relationship'],
        ['건강운', 'health'],
        ['내 사주 첫 풀이', 'intro']
      ]
    }
  },
  {
    file: 'compat.html', sitemap: true, crumb: '사주 궁합',
    title: '사주 궁합 보기 | 연애·결혼·재회 궁합 리포트 - ' + SITE_NAME,
    description: '두 사람의 명식을 나란히 놓고 보는 사주 궁합. 연애·결혼·부부·재회 중 관계에 맞는 관점으로 상성과 시기를 풀어 PDF로 드립니다. 4,900원.',
    keywords: ['사주 궁합', '궁합 보기', '연애 궁합', '결혼 궁합', '재회 궁합'],
    service: { name: '사주 궁합 리포트', serviceType: '사주 궁합', price: 4900 }
  },
  {
    file: 'date-select.html', sitemap: true, crumb: '택일',
    title: '택일 사주 | 이사·개업·결혼 좋은 날짜 고르기 - ' + SITE_NAME,
    description: '이사·개업·결혼·임신과 출산처럼 중요한 순간의 날짜를 실제 만세력으로 계산해 고릅니다. 날짜와 함께 챙길 것까지 담은 택일 리포트, 3,900원.',
    keywords: ['택일', '이사 날짜', '개업 날짜', '결혼 날짜', '사주 택일'],
    service: { name: '택일 리포트', serviceType: '사주 택일', price: 3900 }
  },
  {
    file: 'lifetime-report.html', sitemap: true, crumb: '평생사주',
    title: '평생사주 100페이지 리포트 | 대운·용신 사주 풀이 - ' + SITE_NAME,
    description: '태어난 순간부터 지금까지, 명식·격국·용신·대운을 모두 담은 평생사주 100페이지 리포트. 3초 요약카드 포함, 14,900원.',
    keywords: ['평생사주', '사주 풀이', '대운', '용신', '사주 리포트'],
    service: { name: '평생사주 100페이지 리포트', serviceType: '사주 풀이', price: 14900 }
  },
  {
    file: 'premium.html', sitemap: true, crumb: '평생사주 정식 리포트',
    title: '평생사주 100p 정식 리포트 | ' + SITE_NAME,
    description: '명식·격국·용신·대운·형충회합을 18장, 100페이지 PDF로 담은 사주보는 수달의 평생사주 정식 리포트. 3초 요약카드 포함.',
    keywords: ['평생사주', '사주 리포트', '사주 풀이'],
    service: { name: '평생사주 100페이지 리포트', serviceType: '사주 풀이', price: 14900 }
  },
  { file: 'webtoon/lifetime.html', sitemap: true, manageHead: false },
  { file: 'webtoon/compat.html', sitemap: true, manageHead: false },
  {
    file: 'consult.html', sitemap: false, crumb: '상담 안내',
    title: '사주보는 수달 | 정갈한 사주 심층 분석 리포트',
    description: '카카오톡으로 편하게 물어보고 결과를 PDF로 받습니다. 어떤 서비스가 맞는지부터 안내해드립니다.'
  },
  { file: 'login.html', title: '사주보는 수달 — 로그인', description: '사주보는 수달 로그인.' },
  { file: 'signup.html', title: '사주보는 수달 — 회원가입', description: '사주보는 수달 회원가입. 받은 리포트를 저장해두고 언제든 다시 볼 수 있습니다.' },
  { file: 'mypage.html', title: '사주보는 수달 — 마이페이지', description: '내가 받은 리포트와 저장해둔 인물을 관리합니다.' },
  { file: 'profiles.html', title: '사주보는 수달 — 저장된 인물', description: '나·배우자·자녀처럼 자주 보는 사람의 생년월일시를 저장해두고 매번 다시 입력하지 않고 불러옵니다.' },
  { file: 'forgot-password.html', title: '사주보는 수달 — 비밀번호 찾기', description: '비밀번호 재설정 메일을 받습니다.' },
  { file: 'reset-password.html', title: '사주보는 수달 — 비밀번호 재설정', description: '새 비밀번호를 설정합니다.' },
  { file: 'terms.html', title: '사주보는 수달 — 이용약관', description: '사주보는 수달 이용약관.' },
  { file: 'privacy.html', title: '사주보는 수달 — 개인정보처리방침', description: '사주보는 수달 개인정보처리방침.' }
];

/* 판매 종료 후 location.replace로 옮겨 가기만 하는 페이지. 색인에서 빼고 옮겨 갈 곳을 알려 준다. */
const REDIRECT_STUBS = {
  'career-timing.html': '/quick.html',
  'life-topics.html': '/services.html',
  'reunion-check.html': '/compat.html',
  'birth-timing.html': '/date-select.html'
};

/* 검색에 나올 필요가 없는 개인·결제·관리 화면. noindex가 붙은 페이지는 막지 않는다
   (막으면 구글이 noindex를 읽지 못한다). */
const ROBOTS_DISALLOW = [
  '/api/', '/admin', '/pay.html', '/pay-success.html', '/pay-fail.html', '/consent.html',
  '/mypage.html', '/profiles.html', '/login.html', '/signup.html',
  '/forgot-password.html', '/reset-password.html', '/balance-cover-preview.html'
];

const urlOf = (file) => SITE + (file === 'index.html' ? '/' : '/' + file);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function organization() {
  return {
    '@type': 'Organization', '@id': SITE + '/#org', name: SITE_NAME, legalName: '길잡이 여울',
    url: SITE + '/', logo: SITE + '/logo.png', email: 'sooky2001@gmail.com'
  };
}

function website() {
  return {
    '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: SITE_NAME,
    inLanguage: 'ko-KR', publisher: { '@id': SITE + '/#org' }
  };
}

function offer(price, url) {
  return { '@type': 'Offer', price: String(price), priceCurrency: 'KRW', url, availability: 'https://schema.org/InStock' };
}

function jsonLdFor(page) {
  const url = urlOf(page.file);
  const graph = [website(), organization()];
  const webPage = {
    '@type': page.pageType || 'WebPage', '@id': url + '#webpage', url, name: page.title,
    description: page.description, inLanguage: 'ko-KR', isPartOf: { '@id': SITE + '/#website' },
    primaryImageOfPage: { '@type': 'ImageObject', url: OG_IMAGE }
  };
  if (page.keywords) webPage.keywords = page.keywords.join(', ');
  if (page.file !== 'index.html') {
    webPage.breadcrumb = { '@id': url + '#breadcrumb' };
    graph.push({
      '@type': 'BreadcrumbList', '@id': url + '#breadcrumb',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: page.crumb, item: url }
      ]
    });
  }
  if (page.service) {
    const s = page.service;
    webPage.mainEntity = { '@id': url + '#service' };
    const service = {
      '@type': 'Service', '@id': url + '#service', name: s.name, serviceType: s.serviceType,
      description: page.description, url, provider: { '@id': SITE + '/#org' },
      areaServed: { '@type': 'Country', name: '대한민국' }
    };
    if (s.catalog) {
      service.hasOfferCatalog = {
        '@type': 'OfferCatalog', name: s.name,
        itemListElement: s.catalog.map(([name, topic]) => ({
          ...offer(s.price, url + '?topic=' + topic),
          itemOffered: { '@type': 'Service', name, serviceType: s.serviceType }
        }))
      };
    } else {
      service.offers = offer(s.price, url);
    }
    graph.push(service);
  }
  if (page.file === 'index.html') {
    webPage.about = { '@id': SITE + '/#org' };
    graph.push({
      '@type': 'ItemList', '@id': SITE + '/#services', name: SITE_NAME + ' 대표 서비스',
      itemListElement: PAGES.filter((p) => p.service && p.file !== 'premium.html').map((p, i) => ({
        '@type': 'ListItem', position: i + 1, name: p.service.name, url: urlOf(p.file)
      }))
    });
  }
  graph.push(webPage);
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 1);
}

function headBlock(page) {
  const url = urlOf(page.file);
  const lines = [
    '<meta name="description" content="' + esc(page.description) + '">',
    '<link rel="canonical" href="' + url + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + SITE_NAME + '">',
    '<meta property="og:title" content="' + esc(page.title) + '">',
    '<meta property="og:description" content="' + esc(page.description) + '">',
    '<meta property="og:url" content="' + url + '">',
    '<meta property="og:image" content="' + OG_IMAGE + '">',
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="' + SITE_NAME + ' — 실제 만세력으로 보는 사주 풀이">',
    '<meta property="og:locale" content="ko_KR">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(page.title) + '">',
    '<meta name="twitter:description" content="' + esc(page.description) + '">',
    '<meta name="twitter:image" content="' + OG_IMAGE + '">'
  ];
  if (page.robots) lines.push('<meta name="robots" content="' + esc(page.robots) + '">');
  if (page.keywords || page.service) {
    lines.push('<script type="application/ld+json">\n' + jsonLdFor(page) + '\n</script>');
  }
  return lines.join('\n');
}

const MANAGED_LINE = /^\s*(<meta name="description"|<link rel="canonical"|<meta property="og:|<meta name="twitter:|<meta name="robots")/;

/* <head> 안에서 이 스크립트가 관리하는 줄과 JSON-LD를 지우고, <title> 바로 뒤에 새 블록을 넣는다. */
function rewriteHead(html, title, block) {
  const start = html.indexOf('<head>');
  const end = html.indexOf('</head>');
  if (start < 0 || end < 0) throw new Error('<head> 못 찾음');
  let head = html.slice(start, end);
  head = head.replace(/\n?<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  head = head.split('\n').filter((line) => !MANAGED_LINE.test(line)).join('\n');
  if (!/<title>[^<]*<\/title>/.test(head)) throw new Error('<title> 못 찾음');
  head = head.replace(/<title>[^<]*<\/title>/, () => '<title>' + esc(title) + '</title>\n' + block);
  return html.slice(0, start) + head + html.slice(end);
}

function write(file, content) {
  const filePath = path.join(PUBLIC_DIR, file);
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (before === content) return false;
  fs.writeFileSync(filePath, content);
  return true;
}

function lastmodOf(file) {
  const rel = path.posix.join('public', file);
  try {
    const dirty = execFileSync('git', ['status', '--porcelain', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!dirty) {
      const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
      if (date) return date;
    }
  } catch (e) { /* git이 없으면 오늘 날짜 */ }
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

function buildSitemap() {
  const urls = PAGES.filter((p) => p.sitemap).map((p) =>
    '  <url>\n    <loc>' + urlOf(p.file) + '</loc>\n    <lastmod>' + lastmodOf(p.file) + '</lastmod>\n  </url>');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n';
}

function buildRobots() {
  return [
    '# scripts/buildSeo.js가 만든다. 직접 고치지 말고 스크립트를 고친 뒤 다시 실행한다.',
    'User-agent: *',
    'Allow: /',
    ...ROBOTS_DISALLOW.map((p) => 'Disallow: ' + p),
    '',
    'Sitemap: ' + SITE + '/sitemap.xml',
    ''
  ].join('\n');
}

function main() {
  const changed = [];
  for (const page of PAGES) {
    if (page.manageHead === false) continue;
    const filePath = path.join(PUBLIC_DIR, page.file);
    if (!fs.existsSync(filePath)) { console.log('없음(건너뜀):', page.file); continue; }
    const html = fs.readFileSync(filePath, 'utf8');
    let rendered = rewriteHead(html, page.title, headBlock(page));
    if (page.file === 'new-year.html') {
      rendered = rendered.replace(/(<strong id="newYearPrice">)[\s\S]*?(<\/strong>)/,
        (_, open, close) => open + (newYear.enabled ? newYear.priceKrw.toLocaleString('ko-KR') + '원' : '준비 중') + close);
    }
    if (write(page.file, rendered)) changed.push(page.file);
  }
  for (const [file, target] of Object.entries(REDIRECT_STUBS)) {
    const filePath = path.join(PUBLIC_DIR, file);
    if (!fs.existsSync(filePath)) continue;
    const html = fs.readFileSync(filePath, 'utf8');
    const title = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || SITE_NAME).replace(/&amp;/g, '&');
    const block = '<meta name="robots" content="noindex, follow">\n<link rel="canonical" href="' + SITE + target + '">';
    if (write(file, rewriteHead(html, title, block))) changed.push(file);
  }
  // 사이트맵의 lastmod는 위에서 고친 파일의 상태를 보고 정하므로 HTML을 먼저 쓴다.
  if (write('sitemap.xml', buildSitemap())) changed.push('sitemap.xml');
  if (write('robots.txt', buildRobots())) changed.push('robots.txt');
  // llms.txt에도 판매 중인 상품만 표시한다. 본문 가격과 같은 설정이 원장이다.
  const llmsPath = path.join(PUBLIC_DIR, 'llms.txt');
  if (fs.existsSync(llmsPath)) {
    let llms = fs.readFileSync(llmsPath, 'utf8').replace(/^.*\]\(https:\/\/sajuotter\.com\/new-year\.html\).*\r?\n/gm, '');
    if (newYear.enabled) {
      llms = llms.replace(/(## 유료 리포트\r?\n)/, '$1- [' + newYear.year + '년 신년운세](https://sajuotter.com/new-year.html): 총운·12개월 흐름·재물·일·애정·건강 풀이. 웹 결과·PDF·공유 카드 제공. ' + newYear.priceKrw.toLocaleString('ko-KR') + '원.\n');
    }
    if (write('llms.txt', llms)) changed.push('llms.txt');
  }
  console.log(changed.length ? '바뀐 파일:\n  ' + changed.join('\n  ') : '바뀐 파일 없음');
}

if (require.main === module) main();

module.exports = { PAGES, REDIRECT_STUBS, ROBOTS_DISALLOW, FORTUNE_YEAR, urlOf, jsonLdFor, headBlock, buildSitemap };
