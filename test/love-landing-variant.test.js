'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const variant = require('../public/love-assets/landing-variant.js');
const example = require('../public/love-assets/reading-example.json');
const html = fs.readFileSync(path.join(__dirname, '../public/love.html'), 'utf8');
const source = example.paid.replace(/\*\*/g, '').replace(/\s+/g, ' ');
const section = (title) => example.paid.split('## ' + title)[1].split('\n## ')[0].replace(/\*\*/g, '').replace(/\s+/g, ' ');

function fakeDoc() {
  const nodes = { heroQuestion: { textContent: '' }, heroQuote: { textContent: '' } };
  return { nodes, body: { dataset: {} }, getElementById: (id) => nodes[id] || null };
}

test('예시 인용 조각은 해당 장 원문에 글자 그대로 있다', () => {
  for (const p of variant.ANSWER_QUOTE) assert.ok(section('한 줄 답').includes(p), '한 줄 답에 없음: ' + p);
  for (const p of variant.PATTERN_QUOTE) assert.ok(section('반복되기 쉬운 연애 패턴').includes(p), '패턴 장에 없음: ' + p);
  for (const p of variant.PATTERN_QUOTE.concat(variant.ANSWER_QUOTE)) assert.ok(source.includes(p));
});

test('concern·hook 값에 따라 질문과 인용이 바뀌고, 이상한 값은 기본으로 돌아간다', () => {
  const d = fakeDoc();
  let v = variant.apply(d, '?hook=pattern&concern=some');
  assert.equal(v.key, 'pattern');
  assert.equal(d.nodes.heroQuestion.textContent, '좋은 말만 하는 사주 말고, 내가 반복하는 연애 패턴부터');
  assert.equal(d.nodes.heroQuote.textContent, '“… 정작 수달님은 그럴 의도가 없었는데도 거리가 생기는 일이 반복될 수 있어요.”');
  assert.equal(d.body.dataset.landingVariant, 'pattern');
  assert.equal(variant.apply(fakeDoc(), '?concern=some').key, 'some');
  assert.equal(variant.pick('?concern=some').question, '이 썸, 언제 분명해질까요?');
  for (const c of ['single', 'dating', 'breakup']) assert.equal(variant.pick('?concern=' + c).key, c);
  for (const bad of ['', '?', '?concern=', '?concern=pattern', '?concern=constructor', '?concern=__proto__', '?concern=SOME', '?hook=other', '?hook=', '?concern=%00', '?concern=<img>']) {
    const v = variant.pick(bad);
    assert.equal(v.key, 'default', bad);
    assert.equal(v.question, '내 연애가 가장 강해지는 세 달, 언제일까요?');
  }
  assert.equal(variant.pick(undefined).key, 'default');
  assert.equal(variant.pick(null).key, 'default');
  const dflt = fakeDoc(); variant.apply(dflt, '');
  const quote = dflt.nodes.heroQuote.textContent.replace(/[“”]/g, '').split('…').map((s) => s.trim()).filter(Boolean);
  assert.equal(quote.length, 2);
  for (const p of quote) assert.ok(section('한 줄 답').includes(p));
});

test('랜딩 변형 코드는 innerHTML 없이 textContent로만 글을 넣고 가격을 쓰지 않는다', () => {
  const code = fs.readFileSync(path.join(__dirname, '../public/love-assets/landing-variant.js'), 'utf8');
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(code));
  assert.match(code, /textContent/);
  for (const text of Object.values(variant.QUESTION)) assert.doesNotMatch(text, /원|14,900|재회|보장|적중/);
  assert.match(html, /<script src="\/love-assets\/landing-variant\.js"><\/script>/);
  assert.match(html, /landing-variant\.css/);
  assert.match(html, /id="heroQuestion"/);
  assert.match(html, /id="heroQuote"/);
});

test('풀이 미리보기에 실물 화면 3장이 가로 스트립으로 들어 있고 표기가 있다', () => {
  const peek = /<div class="paid-peek">([\s\S]*?)<div class="reading-specimen">/.exec(html);
  assert.ok(peek, '미리보기 스트립이 있어야 한다');
  assert.match(peek[1], /class="paid-strip"/);
  assert.match(peek[1], /전체 풀이 예시 화면 · 가상 인물 · 개인 결과 아님/);
  assert.match(html, /<span class="specimen-label">풀이 형식 예시 · 개인 분석 결과가 아닙니다<\/span>/);
  for (const n of [1, 2, 3]) {
    assert.match(peek[1], new RegExp('src="/love-assets/preview/paid-' + n + '\\.webp"'));
    const file = path.join(__dirname, '../public/love-assets/preview/paid-' + n + '.webp');
    const buf = fs.readFileSync(file);
    assert.ok(buf.length <= 250 * 1024, 'paid-' + n + ' 용량 ' + buf.length);
    assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
    assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  }
  assert.doesNotMatch(peek[1], /14,900|원/);
});

