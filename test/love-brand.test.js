'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

test('상품 표현과 서버 가격은 동일한 설정을 사용하며 운영 브랜드는 유지한다', () => {
  const brand = require('../public/love-brand');
  const config = require('../src/config/loveTiming');
  assert.equal(brand.operator, '사주보는 수달');
  assert.equal(brand.product.title, '인연의 시기');
  assert.equal(brand.product.priceKrw, config.priceKrw);
  assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname, '../public', brand.character.portrait)));
  assert.ok(brand.product.chapters.length >= 6);
});
