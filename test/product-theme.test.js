'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { themeCss } = require('../src/productTheme');
const { outputs } = require('../scripts/build-product-themes');
const { computeSaju } = require('../src/engine');
const { sajuChartData, sajuChartHtml } = require('../src/pdf/sajuChart');
const pub = (f) => fs.readFileSync(path.join(__dirname, '..', 'public', f), 'utf8');

test('붉은 계열만 상품 색으로 옮기고 금색·흰색·회색과 오행 hsl 색은 그대로 둔다', () => {
  const css = '.a{color:#ffd166;background:#100607;border-color:#ef5368}.b{color:#fff;box-shadow:0 0 0 4px rgba(239,83,104,.2)}.c{color:#888}.d{color:hsl(8,78%,60%)}';
  const ny = themeCss(css, 'newyear');
  for (const keep of ['#ffd166', '#fff;', '#888', 'hsl(8,78%,60%)']) assert.ok(ny.includes(keep), keep);
  assert.doesNotMatch(ny, /#100607|#ef5368|rgba\(239,83,104/);
  assert.notEqual(themeCss(css, 'reunion'), ny);
  assert.notEqual(themeCss(css, 'couple'), ny);
});

test('상품 화면 CSS는 최신이고, 상품 페이지는 연애 CSS 대신 상품 색 CSS를 쓴다', () => {
  for (const o of outputs()) {
    assert.equal(fs.readFileSync(o.file, 'utf8'), o.css, o.href + ' — node scripts/build-product-themes.js 를 다시 실행하세요');
    const html = pub(o.slug + '.html');
    assert.ok(html.includes('href="' + o.href + '"'), o.slug + '.html 이 ' + o.href + ' 를 써야 한다');
    assert.ok(!html.includes('href="' + o.from + '"'), o.slug + '.html 에 원래 ' + o.from + ' 가 남아 있다');
  }
});

test('상품마다 고유 그림과 안내자를 쓴다(연애 그림·여울 재사용 없음)', () => {
  for (const [slug, guide] of [['new-year', '새온'], ['reunion', '달하'], ['couple', '결']]) {
    const html = pub(slug + '.html'), js = pub(slug + '-app.js');
    assert.doesNotMatch(html, /love-assets\/reading\/[a-z-]+\.webp/, slug + '.html');
    assert.match(js, /window\.LOVE_READING_ART = /, slug + '-app.js');
    assert.doesNotMatch(html.replace(/길잡이 여울/g, '') + js, /여울/, slug + ' 에 연애 안내자 이름이 남아 있다');
    assert.ok((html + js).includes(guide), slug + ' 안내자 ' + guide);
    for (const f of ['cover', 'timing', 'thread', 'door']) assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'pdf', 'assets', slug, f + '.jpg')), slug + '/' + f);
  }
});

test('여덟 글자 표는 십신·지장간·12운성·신살을 엔진 값으로 채우고, 시각을 모르면 시주를 비운다', () => {
  const d = sajuChartData(computeSaju({ year: 1994, month: 3, day: 12, hour: 12, minute: 0, gender: '여' }));
  assert.equal(d.basis, '양력 1994년 3월 12일 12시 0분 기준');
  assert.deepEqual(d.columns.map((c) => c.stem.char + c.branch.char), ['丙午', '丁酉', '丁卯', '甲戌']);
  assert.deepEqual(d.columns.map((c) => c.hidden), ['병 기 정', '경 신', '갑 을', '신 정 무']);
  assert.equal(d.columns[1].stem.shipsin, '일간');
  assert.equal(d.columns[1].unseong, '장생');
  assert.deepEqual(d.columns[1].shinsal.slice(0, 2), ['천을귀인', '문창귀인']);
  const unknown = sajuChartData(computeSaju({ year: 1994, month: 3, day: 12, hour: null, gender: '여' }));
  assert.equal(unknown.columns[0].known, false);
  assert.match(sajuChartHtml(computeSaju({ year: 1994, month: 3, day: 12, hour: null, gender: '여' })), /태어난 시각을<br>몰라 비워 둠/);
  assert.match(sajuChartHtml(computeSaju({ year: 1994, month: 3, day: 12, hour: 12, gender: '여' }), { title: '<b>x</b>' }), /&lt;b&gt;x&lt;\/b&gt;/);
});

