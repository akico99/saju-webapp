const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

function seo(enabled, price = '9900') {
  return JSON.parse(execFileSync(process.execPath, ['-e', `
    const seo = require('./scripts/buildSeo');
    const page = seo.PAGES.find(p => p.file === 'new-year.html');
    console.log(JSON.stringify({ page, head: page && seo.headBlock(page),
      sitemap: page && seo.buildSitemap(), home: JSON.parse(seo.jsonLdFor(seo.PAGES.find(p => p.file === 'index.html'))) }));
  `], { cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, NEWYEAR_ENABLED: enabled, NEWYEAR_PRICE_KRW: price } }));
}

test('unreleased new year product stays out of search and the public offer catalog', () => {
  const result = seo('false');
  assert.ok(result.page, 'new-year page must be managed by the SEO builder');
  assert.match(result.head, /noindex, follow/);
  assert.doesNotMatch(result.head, /"@type": "Offer"/);
  assert.doesNotMatch(result.sitemap, /new-year\.html/);
  assert.doesNotMatch(JSON.stringify(result.home), /new-year\.html/);
});

test('released new year product is indexable and uses the configured price', () => {
  const result = seo('true', '12900');
  assert.ok(result.page);
  assert.doesNotMatch(result.head, /noindex/);
  const data = JSON.parse(result.head.match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(data['@graph'].find(n => n['@type'] === 'Service').offers.price, '12900');
  assert.match(result.sitemap, /https:\/\/sajuotter\.com\/new-year\.html/);
  assert.match(JSON.stringify(result.home), /new-year\.html/);
});
