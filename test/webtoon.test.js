const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(publicDir, rel), 'utf8');
const page = () => read('webtoon/lifetime.html');

test('평생사주 웹툰은 문제 제기 → 쉬운 사주 제안 → 서비스 소개 순서로 읽힌다', () => {
  const html = page();
  const main = html.slice(html.indexOf('<main>'));
  const order = [
    '어려운 글자',
    '쉽게</em> 풀어주는 사주',
    '<p class="brand-name">사주보는 수달',
    '그래서 어떻게',
    '첫 장에 <span class="hl">3줄 요약',
    '<span class="hl">형광펜으로 쫙',
    '<span class="hl">바로 옆에 풀이',
    '<span class="hl">한 장 요약 카드',
    '받아보세요',
    '무료 리딩 5종',
  ].map((marker) => {
    const at = main.indexOf(marker);
    assert.ok(at > -1, marker + ': missing');
    return at;
  });
  order.reduce((prev, at) => { assert.ok(at > prev, 'story beats out of order'); return at; }, -1);
});

test('제목·말풍선·한자에 디자인 글꼴을 쓰고 실제로 불러온다', () => {
  const html = page();
  const css = read('webtoon/webtoon.css');
  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Black\+Han\+Sans&family=Nanum\+Pen\+Script&family=Noto\+Serif\+KR/);
  assert.match(css, /\.headline \.big\s*\{[^}]*font-family:\s*var\(--f-display\)/);
  assert.match(css, /\.thought\s*\{[^}]*font-family:\s*var\(--f-hand\)/);
  assert.match(css, /\.hj\s*\{[^}]*font-family:\s*var\(--f-hanja\)/);
  // 공통 스타일의 main/section 좌우 여백이 그림 경계를 드러내지 않게 걷어낸다.
  assert.match(css, /\.story main\s*\{\s*padding:\s*0;/);
});

test('웹툰의 가격·사양·무료 상품 이름이 실제 상품 페이지와 일치한다', () => {
  const html = page();
  const report = read('lifetime-report.html');
  const services = read('services.html');

  const price = Number(report.match(/POINT_NOTICE_PRICE\s*=\s*(\d+)/)[1]);
  const shown = price.toLocaleString('en-US');
  assert.match(html, new RegExp('<strong class="ticket-price">' + shown + '<small>원</small></strong>'));
  assert.match(html, new RegExp('<span class="cta-price">' + shown + '원</span>'));

  assert.match(report, /18 챕터/);
  assert.match(report, /약 100쪽/);
  assert.match(report, /최대 10분/);
  assert.match(html, /18장 · 약 100쪽/);
  assert.match(html, /10분 안에/);

  const chips = [...html.matchAll(/<ul class="free-chips">([\s\S]*?)<\/ul>/g)][0][1]
    .match(/<li>([^<]+)<\/li>/g).map((li) => li.replace(/<\/?li>/g, ''));
  assert.equal(chips.length, 5);
  const freeSection = services.slice(services.indexOf('<section id="free">'));
  chips.forEach((name) => assert.ok(freeSection.includes(name), name + ': not a free service'));
});

test('구매·무료 링크가 실제 경로를 가리킨다', () => {
  const html = page();
  assert.match(html, /<a class="cta" href="\/lifetime-report\.html\?from=lifetime-webtoon">/);
  assert.match(html, /<a class="free-link" href="\/services\.html#free">/);
  assert.ok(fs.existsSync(path.join(publicDir, 'lifetime-report.html')));
  assert.match(read('services.html'), /<section id="free">/);
});

test('직업·적성운 웹툰은 승인된 4구간과 실물 증거를 순서대로 제공한다', () => {
  const html = read('webtoon/career.html');
  const main = html.slice(html.indexOf('<main>'));
  const markers = [
    '열심히는 하는데,', '요약부터', '요약 세 문장부터',
    '조직과 독립', '할 것과 피할 것', '5년 타임라인', '내가 일하는 모습을',
  ].map((marker) => {
    const index = main.indexOf(marker);
    assert.ok(index >= 0, marker + ': missing');
    return index;
  });
  markers.reduce((prev, index) => { assert.ok(index > prev, 'career story beats out of order'); return index; }, -1);
  assert.match(html, /핵심 요약 첫 문단 3문장 발췌/);
  assert.match(html, /새로운 일을 시작하는 추진력/);
  assert.match(html, /2027년 정미년에는 이직보다 지금 자리에서 자격증·전문성 쌓는 데 집중하기 \(인성 기운, 커리어 점수 60\)/);
  assert.match(html, /2027년에 섣불리 이직을 추진해 다지기의 시기를 건너뛰기 \(커리어 점수 60, 인성 기운\)/);
  assert.match(html, /2026년부터 2030년까지/);
  assert.match(html, /취업·이직·승진의 성공 확률은 아니에요/);
  assert.doesNotMatch(html, /3년 그래프|공유 카드/);
});

test('직업·적성운 웹툰의 상품·추적·샘플 링크가 서비스와 일치한다', () => {
  const html = read('webtoon/career.html');
  const points = fs.readFileSync(path.join(__dirname, '..', 'src/db/points.js'), 'utf8');
  const quick = read('quick.html');
  assert.match(points, /deep_career/);
  assert.match(points, /deep_career[^\n]*3900|3900[^\n]*deep_career/);
  assert.match(quick, /topic=career/);
  assert.match(html, /<strong class="ticket-price">3,900<small>원<\/small><\/strong>/);
  assert.match(html, /<span class="cta-price">3,900원<\/span>/);
  assert.match(html, /href="\/quick\.html\?topic=career&amp;from=career-webtoon"/);
  assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
  assert.equal((html.match(/<script src="\/track\.js"><\/script>/g) || []).length, 1);
  assert.doesNotMatch(html, /fbq\(|kakaoPixel|META_PIXEL_ID|KAKAO_PIXEL_ID/);
  assert.match(html, /href="\/samples\/career\/"/);
  assert.ok(fs.existsSync(path.join(publicDir, 'samples/career/index.html')));
});

test('직업·적성운 웹툰 그림과 실제 원문 캡처는 크기·용량 계약을 지킨다', async () => {
  const html = read('webtoon/career.html');
  const images = [...html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/g)].map((match) => match[0]);
  assert.ok(images.length >= 10);
  images.forEach((tag) => {
    assert.match(tag, /width="\d+"/);
    assert.match(tag, /height="\d+"/);
    assert.match(tag, /alt="[^"]{8,}"/);
  });
  const files = fs.readdirSync(path.join(publicDir, 'webtoon/career')).filter((name) => name.endsWith('.webp'));
  assert.equal(files.length, 9, '그림 4장과 실물 증거 캡처 5개');
  let total = 0;
  for (const name of files) {
    const file = path.join(publicDir, 'webtoon/career', name);
    const { width, height } = await sharp(file).metadata();
    const bytes = fs.statSync(file).size;
    total += bytes;
    assert.ok(width >= 600 && height >= 100, name + ': image dimensions');
    if (/^0[1-4]-/.test(name)) assert.ok(bytes < 300 * 1024, name + ': art image exceeds 300KB');
  }
  assert.ok(total < 1024 * 1024, 'all career images <1MB: ' + total);
  const seo = fs.readFileSync(path.join(__dirname, '..', 'scripts/buildSeo.js'), 'utf8');
  assert.match(seo, /file: 'webtoon\/career\.html', sitemap: true, manageHead: false/);
});

// 웹툰이 내세우는 리포트 장점은 실제 생성 코드가 하는 일이어야 한다.
test('웹툰이 내세우는 리포트 장점 4가지가 실제 리포트 생성 코드에 있다', () => {
  const html = page();
  const src = (rel) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8');

  // 01 표지 3줄 요약
  assert.match(src('pdf/templates/partials/cover.ejs'), /평생사주 3줄 요약/);
  // 02 챕터마다 핵심 2~5곳 형광펜 — 페이지에 적은 숫자와 생성 규칙의 숫자가 같아야 한다
  const prompt = src('llm/systemPrompt.js');
  assert.match(prompt, /핵심 결론 2~5곳만/);
  assert.match(prompt, /형광펜으로 칠한 것처럼/);
  assert.match(src('pdf/textMarkup.js'), /<mark>\$1<\/mark>/);
  assert.match(html, /핵심 결론 2~5곳만 칠해 드려요/);
  // 03 전문용어는 나오는 자리에서 바로 풀이
  assert.match(prompt, /명리학 전문용어는 등장하는 그 자리에서 즉시 쉬운 말로 풀어씁니다/);
  // 04 요약 카드가 본편보다 먼저 나온다
  assert.match(read('lifetime-report.html'), /요약 카드가 먼저 나왔어요/);
});

test('웹툰 그림이 모두 존재하고 선언한 크기와 전송 용량 제한을 지킨다', async () => {
  const html = page();
  const images = [...html.matchAll(/<img src="(\/webtoon\/lifetime\/[^"]+)" width="(\d+)" height="(\d+)" alt="([^"]{8,})"/g)];
  assert.ok(images.length >= 4, '장면과 실물 증거 이미지가 빠짐');
  let total = 0;
  for (const [, src, width, height] of images) {
    const file = path.join(publicDir, src.slice(1));
    assert.ok(fs.existsSync(file), src + ': missing');
    const meta = await sharp(file).metadata();
    assert.equal(meta.format, 'webp', src + ': format');
    assert.equal(meta.width, Number(width), src + ': width');
    assert.equal(meta.height, Number(height), src + ': height');
    const size = fs.statSync(file).size;
    assert.ok(size < 300 * 1024, src + ': over per-image ceiling');
    total += size;
  }
  assert.ok(total < 1024 * 1024, 'webtoon images total ' + Math.round(total / 1024) + 'KB');
});

test('웹툰 페이지가 분석 태그와 홈 진입 링크를 유지한다', () => {
  assert.match(page(), /G-THWHBPH5WR/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'injectGA.js'), 'utf8'), /'webtoon\/lifetime\.html'/);
  const home = read('index.html');
  assert.match(home, /<a class="today-fortune-card" href="\/webtoon\/lifetime\.html\?from=home-lifetime-story">/);
});

const compatPage = () => read('webtoon/compat.html');
const compatSample = (name) => read('samples/compat/' + name + '-본문.md');
const visibleText = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

test('궁합 소개의 발췌는 공개된 가상 인물 원문과 일치한다', () => {
  assert.ok(fs.existsSync(path.join(publicDir, 'webtoon/compat.html')), '궁합 웹툰 공개 파일이 필요하다');
  const html = compatPage();
  const excerpts = [...html.matchAll(/<[^>]+ data-source="([^"]+)"[^>]*>([\s\S]*?)<\/(?:p|blockquote)>/g)];
  assert.equal(excerpts.length, 10, '요약 3문장·생활 강조·관계 4개·실천 2개');
  for (const [, name, excerpt] of excerpts) {
    assert.ok(compatSample(name).replace(/\*\*/g, '').replace(/==/g, '').includes(visibleText(excerpt)), name + ': 발췌가 원문에서 바뀜');
  }
  assert.match(html, /앞 3문장 발췌 · 전체 5문장/);
  const originalSummary = compatSample('연애').split('### 핵심 요약과 두 사람을 위한 실천 포인트')[1].split('### 지금 할 것')[0].trim().split(/(?<=\.)\s+/);
  assert.equal(originalSummary.length, 5, '전체 요약 문장 수');
  const summaryBlock = html.match(/<div class="compat-summary report"[^>]*>([\s\S]*?)<\/div>/)[1];
  assert.deepEqual([...summaryBlock.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map(m=>visibleText(m[1])), originalSummary.slice(0,3), '앞 세 문장 순서');
  const timingRows = html.match(/<table class="timing-values">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)[1];
  assert.deepEqual([...timingRows.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<(?:th|td)[^>]*>(\d+)<\/(?:th|td)>/g)].map(c=>Number(c[1]))), [[2026,69,46,58],[2027,72,58,65],[2028,61,51,56]], '실제 시기 참고 점수');
  for (const name of ['연애', '부부', '시작전', '재회']) {
    assert.ok(fs.existsSync(path.join(publicDir, 'samples/compat/' + name + '.html')));
    assert.match(read('samples/compat/' + name + '.html'), /샘플 · 가상 인물/);
    assert.match(html, new RegExp('/samples/compat/' + name + '\\.html'));
    // PDF의 큰 data: TTF가 공개 HTML마다 복제되면 모바일 원문 열기가 느려진다.
    assert.ok(fs.statSync(path.join(publicDir, 'samples/compat/' + name + '.html')).size < 100 * 1024);
    assert.doesNotMatch(read('samples/compat/' + name + '.html'), /data:font\//);
  }
});

test('궁합 소개는 실제 가격과 상품으로 연결되고 추적 태그를 중복하지 않는다', () => {
  const html = compatPage();
  const price = Number(read('compat.html').match(/POINT_NOTICE_PRICE\s*=\s*(\d+)/)[1]);
  assert.equal(price, 4900);
  const points = fs.readFileSync(path.join(__dirname, '..', 'src/db/points.js'), 'utf8');
  assert.equal(Number(points.match(/compat:\s*(\d+)/)[1]), price);
  assert.match(html, /<span class="cta-price">4,900원<\/span>/);
  assert.match(html, /href="\/compat\.html\?from=compat-webtoon"/);
  assert.equal((html.match(/src="\/track\.js"/g) || []).length, 1);
  assert.equal((html.match(/googletagmanager\.com\/gtag\/js/g) || []).length, 1);
  assert.doesNotMatch(html, /fbq\(|kakaoPixel\(|990원|구독|한자 없음|3초/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'scripts/injectGA.js'), 'utf8'), /'webtoon\/compat\.html'/);
  const sections = [...html.matchAll(/<section class="s-(problem|turn|service|close)" aria-labelledby="[^"]+"/g)].map(m => m[1]);
  assert.deepEqual(sections, ['problem', 'turn', 'service', 'close']);
});

test('궁합 그림과 서비스 캡처는 크기·대체 텍스트·전송 제한을 지킨다', async () => {
  const html = compatPage();
  const images = [...html.matchAll(/<img src="(\/webtoon\/compat\/[^"]+)" width="(\d+)" height="(\d+)" alt="([^"]{8,})"/g)];
  assert.equal(images.length, 8, '승인 그림 3장과 실물 증거 5장');
  let total = 0;
  for (const [, src, width, height] of images) {
    const file = path.join(publicDir, src.slice(1));
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, Number(width), src);
    assert.equal(meta.height, Number(height), src);
    assert.equal(meta.format, 'webp');
    const size = fs.statSync(file).size;
    assert.ok(size < 300 * 1024, src);
    total += size;
  }
  assert.ok(total < 1024 * 1024, '그림과 증거 합계가 1MB 이상');
});
