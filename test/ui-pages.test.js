const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.join(__dirname, '..', 'public');
const pages = [
  'free', 'life-graph', 'today-preview', 'today-fortune', 'quick', 'compat',
  'lifetime-report', 'date-select', 'login', 'signup', 'forgot-password',
  'reset-password', 'profiles', 'charge', 'mypage', 'services'
];

// 2026-09 판매 종료된 상품 페이지 — 새 상품으로 바로 보낸다. 링크·북마크로 들어온
// 사람이 죽은 폼을 만나지 않게, 리다이렉트 목적지가 살아있는 페이지인지만 확인한다.
const retiredRedirects = {
  'life-topics': '/services.html',
  'career-timing': '/quick.html?topic=career',
  'birth-timing': '/date-select.html?occasion=birth',
  'reunion-check': '/compat.html'
};
for (const [name, target] of Object.entries(retiredRedirects)) {
  test(`${name} redirects to a live product page`, () => {
    const html = fs.readFileSync(path.join(publicDir, `${name}.html`), 'utf8');
    assert.match(html, /location\.replace\(/);
    assert.ok(html.includes(target.split('?')[0]), `${name}: expected redirect toward ${target}`);
    assert.ok(fs.existsSync(path.join(publicDir, target.split('?')[0].slice(1))), `${name}: target missing`);
  });
}

for (const name of pages) {
  test(`${name} uses the reading UI without changing its script syntax`, () => {
    const html = fs.readFileSync(path.join(publicDir, `${name}.html`), 'utf8');
    // today-preview는 대화형 입력 무대 시범(otter-stage) — 결과 카드는 reading-ui를 그대로 쓴다.
    assert.match(html, /<body class="(?:reading-page(?: life-graph-page| paid-flow)?|otter-stage)(?: editorial-result-page)?">/);
    assert.match(html, /<link rel="stylesheet" href="\/reading-ui\.css">/);
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new vm.Script(match[1], { filename: `${name}.html` });
    }
  });
}

test('paid forms preserve integration hooks and load the shared paid UI', () => {
  for (const [name, formId, resultId] of [
    ['quick', 'quickForm', 'result'], ['compat', 'compatForm', 'result'],
    ['lifetime-report', 'sajuForm', 'result'], ['date-select', 'dsForm', 'dsResult']
  ]) {
    const html = fs.readFileSync(path.join(publicDir, `${name}.html`), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="\/paid-flow\.css">/);
    assert.ok(html.includes(`id="${formId}"`), `${name}: missing form`);
    assert.ok(html.includes(`id="${resultId}"`), `${name}: missing result`);
    assert.match(html, /class="paid-steps"/);
  }
  assert.ok(fs.existsSync(path.join(publicDir, 'paid-flow.css')));
});

test('life graph retains IDs used by result rendering and control events', () => {
  const html = fs.readFileSync(path.join(publicDir, 'life-graph.html'), 'utf8');
  for (const id of ['lgForm', 'lgResult', 'lgVerdict', 'lgOtterSay', 'lgScore',
    'lgTrend', 'lgTheme', 'lgDesc', 'lgChartWrap', 'lgSvg', 'lgDos', 'lgDonts',
    'lgCta', 'lgCtaLead', 'lgCtaName', 'lgCtaPrice', 'raceSeek']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.ok(fs.existsSync(path.join(publicDir, 'hero', 'otter-hero-mobile.jpg')));
  assert.ok(fs.existsSync(path.join(publicDir, 'reading-ui.css')));
});

test('life graph shows results before asking for a topic', () => {
  const html = fs.readFileSync(path.join(publicDir, 'life-graph.html'), 'utf8');
  assert.match(html, /<form id="lgForm">/);
  assert.doesNotMatch(html, /<form id="lgForm"[^>]*data-concern-step/);
  assert.match(html, /id="lgConcernOptions"/);
  assert.match(html, /class="card lg-premium-card hidden" id="lgPremiumCard"/);
  assert.ok(html.indexOf('id="lgChartWrap"') < html.indexOf('id="lgConcernOptions"'));
  assert.match(html, /ConcernStep\.byKey\(params\.get\('concern'\)\)/);
});

test('balance free reading has its own cover, chart, and paid preview without changing other kinds', () => {
  const html = fs.readFileSync(path.join(publicDir, 'free.html'), 'utf8');
  assert.match(html, /href="\/balance-experience\.css"/);
  assert.match(html, /kind === 'balance'\) document\.body\.classList\.add\('balance-experience'\)/);
  assert.match(html, /id="balanceCoverFacts"/);
  assert.match(html, /balance-spectrum/);
  assert.match(html, /class="balance-paid-preview"/);
  assert.ok(fs.existsSync(path.join(publicDir, 'balance-experience.css')));
});
