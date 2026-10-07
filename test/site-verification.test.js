const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');
const count = (html, re) => (html.match(re) || []).length;

// 네이버·빙 소유확인은 홈페이지 메타 태그로 이뤄진다. 사라지면 두 도구의 사이트 확인이 풀리고
// 같은 태그가 여러 번 들어가면 확인이 불안정해지므로, 홈에는 정확히 한 번씩 있어야 하고 다른 페이지에는 없어야 한다.
test('home carries each search-tool verification meta exactly once', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  assert.equal(count(html, /<meta name="naver-site-verification" content="[0-9a-f]{40}">/g), 1);
  assert.equal(count(html, /<meta name="msvalidate\.01" content="[0-9A-F]{32}">/g), 1);
});

test('verification metas stay out of every other page', () => {
  for (const file of fs.readdirSync(publicDir).filter((f) => f.endsWith('.html') && f !== 'index.html')) {
    const html = fs.readFileSync(path.join(publicDir, file), 'utf8');
    assert.doesNotMatch(html, /naver-site-verification|msvalidate\.01/, file + ': verification meta leaked');
  }
});
