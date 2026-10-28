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
  assert.match(html, /window\.POINT_NOTICE_PRICE = 14900/);
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

test('화면은 서버의 계절 문구를 그대로 쓰고, 무료 첫 장의 시작 달을 결제 요청에 싣는다', () => {
  const js = read('love-app.js');
  assert.match(js, /r\.seasonLead/);
  assert.doesNotMatch(js, /그 안에서 정확히/);
  assert.match(js, /startYm/);
});

test('마이페이지는 웹 결과가 본편인 상품(연애·재회·궁합·신년운세)에 보기 링크를 준다', () => {
  const html = read('mypage.html');
  for (const [key, page] of [['love_timing', 'love'], ['reunion_v2', 'reunion'], ['compat_v2', 'couple'], ['new_year_2027', 'new-year']]) {
    assert.match(html, new RegExp(key + ": '/" + page + "\\.html'"), key);
  }
  // 다운로드 처리기(.download-link)가 보기 링크까지 잡아 /api/download/undefined 를 부르지 않게 클래스를 나눈다.
  assert.match(html, /class="view-link" href="\$\{STORY_PAGE\[o\.productKey\]\}\?jobId=/);
  // PDF가 있는 연애 리포트는 보기 옆에 PDF 내려받기를 함께 준다.
  assert.match(html, /o\.hasFile \? ` <button type="button" class="download-link"/);
});

test('주문 이름(사용자 입력 포함)은 마이페이지와 관리자 주문 화면에서 이스케이프된다', () => {
  for (const f of ['mypage.html', 'admin-orders.html']) {
    const html = read(f);
    assert.doesNotMatch(html, /\$\{o\.label \|\| o\.productKey\}/, f);
    // 이스케이프하거나(esc) 텍스트 노드로만 넣는다(addText). 어느 쪽이든 마크업으로 해석되지 않는다.
    assert.match(html, /esc\(o\.label \|\| o\.productKey\)|addText\(tr, 'td', o\.label \|\| o\.productKey/, f);
  }
});

