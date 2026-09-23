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
    '예를 들면 이렇게요',
    '첫 장에 <span class="hl">3줄 요약',
    '<span class="hl">형광펜으로 쫙',
    '<span class="hl">바로 옆에 풀이',
    '<span class="hl">3초 요약 카드',
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
  assert.equal(images.length, 7);
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
