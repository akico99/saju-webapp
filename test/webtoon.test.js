const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '..', 'public');

test('평생사주 웹툰이 승인된 16컷 에피소드를 제공한다', () => {
  const episodes = require('../public/webtoon/episodes.js');
  const episode = episodes.lifetime;
  assert.equal(episode.title, '한 번은, 내 삶의 지도를 펼쳐보고 싶었다');
  assert.equal(episode.cuts.length, 16);
  assert.deepEqual(episode.cta, {
    href: '/lifetime-report.html?from=lifetime-webtoon',
    label: '내 삶의 지도 펼쳐보기',
    price: '14,900원'
  });
  assert.equal(episode.subCta.href, '/services.html#free');
  assert.equal(episode.midCtaAfter, 10);
});

test('평생사주 모든 컷에 안정적인 접근성 메타데이터가 있다', () => {
  const { lifetime } = require('../public/webtoon/episodes.js');
  const validGaps = new Set(['sm', 'md', 'lg', 'xl']);
  lifetime.cuts.forEach((cut, index) => {
    assert.equal(cut.src, `/webtoon/lifetime/cut-${String(index + 1).padStart(2, '0')}.webp`);
    assert.ok(Number.isInteger(cut.width) && cut.width > 0, `cut ${index + 1}: width`);
    assert.ok(Number.isInteger(cut.height) && cut.height > 0, `cut ${index + 1}: height`);
    assert.ok(cut.alt.length >= 8, `cut ${index + 1}: alt`);
    assert.ok(validGaps.has(cut.gap), `cut ${index + 1}: gap`);
    assert.ok(cut.texts.length <= 3, `cut ${index + 1}: too many text blocks`);
    cut.texts.forEach((item) => assert.ok(item.body.length <= 45, `cut ${index + 1}: copy too long`));
  });
  assert.deepEqual(
    lifetime.cuts.map((cut, index) => cut.texts.length === 0 ? index + 1 : null).filter(Boolean),
    [4, 6, 11, 16]
  );
});
