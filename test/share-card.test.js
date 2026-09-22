const { test } = require('node:test');
const assert = require('node:assert/strict');
const ShareCard = require('../public/share-card.js');

test('share card payload removes empty copy and normalizes the download filename', () => {
  assert.deepEqual(ShareCard.normalizePayload({
    title: '  오늘의 운세  ',
    headline: null,
    lines: ['  한 줄 요약  ', '', 92],
    filename: '오늘/운세 카드'
  }), {
    title: '오늘의 운세',
    headline: '',
    lines: ['한 줄 요약', '92'],
    filename: '오늘-운세-카드.png',
    shareText: '내 무료 사주 결과를 한 장으로 정리했어요.'
  });
});
