const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const publicDir = path.join(__dirname, '..', 'public');
const pages = [
  'life-graph', 'today-preview', 'today-fortune', 'quick', 'compat',
  'lifetime-report', 'life-topics', 'career-timing', 'birth-timing',
  'date-select', 'reunion-check', 'login', 'signup', 'forgot-password',
  'reset-password', 'profiles', 'charge', 'mypage', 'services'
];

for (const name of pages) {
  test(`${name} uses the reading UI without changing its script syntax`, () => {
    const html = fs.readFileSync(path.join(publicDir, `${name}.html`), 'utf8');
    assert.match(html, /<body class="reading-page(?: life-graph-page)?">/);
    assert.match(html, /<link rel="stylesheet" href="\/reading-ui\.css">/);
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new vm.Script(match[1], { filename: `${name}.html` });
    }
  });
}

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
