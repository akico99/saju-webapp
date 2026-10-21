'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(publicDir, f), 'utf8');

test('연애 시기 페이지는 입력·무료 첫 장·잠금 해제·결과 영역과 결제 안내를 갖춘다', () => {
  const html = read('love.html');
  for (const id of ['loveForm', 'freeResult', 'unlockBtn', 'pointNotice', 'paidResult', 'loveVisual', 'loveSections', 'errorBlock']) {
    assert.ok(html.includes(`id="${id}"`), 'missing #' + id);
  }
  for (const name of ['situation', 'name', 'gender', 'calendar', 'year', 'month', 'day', 'isLeap', 'hour', 'minute', 'hourUnknown']) {
    assert.match(html, new RegExp('name="' + name + '"'), 'missing field ' + name);
  }
  for (const src of ['/point-notice.js', '/pay-flow.js', '/love-app.js']) assert.ok(html.includes(`src="${src}"`), src);
  assert.ok(html.indexOf('/point-notice.js') < html.indexOf('/love-app.js'));
  assert.match(html, /window\.POINT_NOTICE_PRICE = 19900/);
  assert.match(html, /href="\/love\.css"/);
  for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1], { filename: 'love.html' });
});

test('연애 시기 화면 스크립트는 문법 오류가 없고 결제 흐름 훅을 쓴다', () => {
  const js = read('love-app.js');
  new vm.Script(js, { filename: 'love-app.js' });
  assert.match(js, /PayFlow\.toLogin\(form\)/);
  assert.match(js, /PayFlow\.onInsufficient\('love'/);
  assert.match(js, /PayFlow\.resume\(\)/);
  assert.match(js, /\/api\/love\/preview/);
  assert.doesNotMatch(js, /innerHTML\s*=\s*[^'"`;]*(name|reading\.)/); // 사용자·응답 문자열을 innerHTML로 넣지 않는다
});

test('마이페이지는 PDF가 없는 연애 시기 리포트에 보기 링크를 준다', () => {
  const html = read('mypage.html');
  assert.match(html, /love_timing/);
  assert.match(html, /\/love\.html\?jobId=/);
});

