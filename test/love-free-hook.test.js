'use strict';
/* 연애 무료 결과 첫 화면의 세 달 카드. 유료 예시 조각이 가상 인물 예시 원문에서 그대로 뗀 것인지,
   첫 문장이 강한 달 개수를 쓰지 않는지 고정한다. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildFree } = require('../public/love-reading-model');
const example = require('../public/love-assets/reading-example.json');
const app = fs.readFileSync(path.join(__dirname, '../public/love-app.js'), 'utf8');

test('세 달 카드의 유료 예시는 가상 인물 예시 원문 조각 그대로다', () => {
  const m = /const PAID_SAMPLE = (\[[^\n]+\]);/.exec(app);
  assert.ok(m, 'PAID_SAMPLE 배열이 있어야 한다');
  const pieces = JSON.parse(m[1].replace(/'/g, '"'));
  assert.ok(pieces.length >= 2);
  const source = example.paid.replace(/\*\*/g, '').replace(/\s+/g, ' ');
  for (const p of pieces) assert.ok(source.includes(p), '원문에 없는 조각: ' + p);
  for (const p of pieces) assert.ok(!/\d{4}년\s*\d{1,2}월/.test(p), '예시에 날짜를 넣지 않는다: ' + p);
  assert.match(app, /가상 인물 ‘수달’의 1위 달 · 개인 결과 아님/);
});

test('무료 결과 첫 문장은 1위 달이 있는 구간을 알려 주고 정확한 달은 전체 풀이로 미룬다', () => {
  const firstHint = { label: '앞으로 6개월 안' };
  const strong = buildFree({ ...example.free, strongCount: 7, firstHint }, { name: '수진', situation: 'single' });
  assert.equal(strong.lead, '수진님의 인연 신호가 가장 강한 달은 앞으로 6개월 안에 있어요. 정확한 달과 그달에 할 일은 전체 풀이에서 알려 드려요.');
  assert.ok(!/\d+번/.test(strong.lead));
  const noName = buildFree({ ...example.free, strongCount: 7, firstHint }, { situation: 'single' });
  assert.equal(noName.lead, '당신의 인연 신호가 가장 강한 달은 앞으로 6개월 안에 있어요. 정확한 달과 그달에 할 일은 전체 풀이에서 알려 드려요.');
  const calm = buildFree({ ...example.free, strongCount: 0, firstHint: { label: '앞으로 3개월 안' } }, { name: '수진', situation: 'single' });
  assert.equal(calm.lead, '수진님의 인연 신호가 가장 나은 달은 앞으로 3개월 안에 있어요. 정확한 달과 그달에 할 일은 전체 풀이에서 알려 드려요.');
});

test('구간 안내가 없는 이전 응답은 기존 첫 문장을 쓴다', () => {
  const old = { ...example.free };
  delete old.firstHint;
  assert.equal(buildFree({ ...old, strongCount: 7 }, { name: '수진', situation: 'single' }).lead, '앞으로 12개월 중 인연 신호가 가장 강한 세 달을 골랐어요.');
  assert.equal(buildFree({ ...old, strongCount: 0 }, { name: '수진', situation: 'single' }).lead, '앞으로 12개월 중 흐름이 가장 나은 세 달을 골랐어요.');
});

test('세 달 카드는 구간 안내와 질문형 목록을 textContent로만 넣는다', () => {
  assert.match(app, /정확한 달은 전체 풀이/);
  assert.match(app, /전체 풀이에서 답해 드려요/);
  const start = app.indexOf('function hookCard');
  const end = app.indexOf('function addFreeExtras');
  assert.ok(start > 0 && end > start);
  assert.ok(!/innerHTML|insertAdjacentHTML/.test(app.slice(start, end)));
});

const loveHtml = fs.readFileSync(path.join(__dirname, '../public/love.html'), 'utf8');

test('랜딩 첫 화면의 예시 인용은 가상 인물 예시 원문 그대로이고 가격은 첫 화면에 없다', () => {
  const hero = /<div class="love-editorial">([\s\S]*?)<\/div>\s*<nav class="product-nav"/.exec(loveHtml);
  assert.ok(hero, '히어로 영역이 있어야 한다');
  const quote = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/.exec(hero[1]);
  assert.ok(quote, '히어로에 예시 인용이 있어야 한다');
  const pieces = quote[1].replace(/[“”]/g, '').split('…').map((s) => s.trim()).filter(Boolean);
  assert.equal(pieces.length, 2);
  const answer = example.paid.split('## 한 줄 답')[1].split('## ')[0].replace(/\*\*/g, '').replace(/\s+/g, ' ');
  for (const p of pieces) assert.ok(answer.includes(p), '한 줄 답 문단에 없는 조각: ' + p);
  assert.match(hero[1], /전체 풀이 예시 · 가상 인물 · 개인 결과 아님/);
  assert.match(hero[1], /무료 사주 분석 · 회원가입 없이/);
  assert.doesNotMatch(hero[1], /14,900|data-love-price|나의 매력/);
});

test('첫 화면에서 가격을 뺀 뒤에도 상품 상자와 결제 창의 14,900원은 그대로다', () => {
  assert.match(loveHtml, /<h3>인연의 시기 <b data-love-price>14,900원<\/b><\/h3>/);
  assert.match(loveHtml, /<strong data-love-price>14,900원<\/strong>/);
  assert.match(loveHtml, /id="stickyUnlock">12개월 연애 풀이 전체 보기 · 14,900원</);
  assert.match(loveHtml, /<div class="checkout-total"><span>상품 금액<\/span><strong data-love-price>14,900원<\/strong>/);
});

test('입력 첫 단계는 안내자 대사로 시작한다', () => {
  const step = /<fieldset class="stage-step" data-step="0">([\s\S]*?)<\/fieldset>/.exec(loveHtml)[1];
  const hello = step.indexOf('어서 와요. 지금부터 당신의 연애 흐름을 읽어 볼게요.');
  assert.ok(hello > 0 && hello < step.indexOf('먼저, 성별을 알려 주세요.'));
});
