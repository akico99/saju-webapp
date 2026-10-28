'use strict';
/* 판매 상품 레지스트리 — 카드 결제(pay.js)가 "무슨 상품을 얼마에, 승인 뒤 어떤 함수로 시작하는가"를
   여기서 찾는다. 각 상품의 실제 시작 로직은 해당 라우트 파일의 start(userId, body)에 있고, 가격은
   points.PRICES가 유일한 기준이다. */
const points = require('../db/points');
const { DEEP_TOPICS } = require('../llm/deepReading');
const generate = require('./routes/generate');
const quick = require('./routes/quick');
const compat = require('./routes/compat');
const dateSelect = require('./routes/dateSelect');
const newYear = require('./routes/newYear');
const newYearConfig = require('../config/newYear');
const love = require('./routes/love');
const loveTimingConfig = require('../config/loveTiming');
const reunionConfig = require('../config/reunion');
const compatV2Config = require('../config/compatV2');

/**
 * @param {string} product - 클라이언트가 보내는 상품 종류: full | deep | compat | date_select | newyear
 * @param {object} form - 상품 폼 본문(start()에 그대로 넘긴다)
 * @returns {{ productKey, price, label, page, start }} 또는 알 수 없으면 null
 */
function resolveProduct(product, form) {
  form = form || {};
  let productKey, label, page, start;
  if (product === 'full') {
    productKey = 'full'; label = '평생사주 100p 정식 리포트'; page = '/lifetime-report.html'; start = generate.start;
  } else if (product === 'deep') {
    const topic = DEEP_TOPICS[form.topic];
    if (!topic) return null;
    productKey = 'deep_' + form.topic; label = `${topic.label} 심층 리딩`; page = `/quick.html?topic=${form.topic}`; start = quick.start;
  } else if (product === 'compat') {
    productKey = 'compat'; label = '궁합 리포트'; page = '/compat.html'; start = compat.start;
  } else if (product === 'date_select') {
    const occ = dateSelect.OCCASIONS[form.occasion];
    if (!occ) return null;
    productKey = occ.productKey; label = `${occ.label} 리포트`; page = `/date-select.html?occasion=${form.occasion}`; start = dateSelect.start;
  } else if (product === 'newyear') {
    if (!newYearConfig.enabled) return null;
    productKey = newYearConfig.productKey;
    label = newYearConfig.year + '년 신년운세';
    page = '/new-year.html';
    start = newYear.start;
  } else if (product === 'love') {
    if (!loveTimingConfig.enabled) return null;
    productKey = loveTimingConfig.productKey;
    label = loveTimingConfig.label;
    page = loveTimingConfig.page;
    start = love.start;
  } else if (product === 'reunion') {
    if (!reunionConfig.enabled) return null;
    productKey = reunionConfig.productKey; label = reunionConfig.label; page = reunionConfig.page; start = require('./routes/reunion').start;
  } else if (product === 'couple') {
    if (!compatV2Config.enabled) return null;
    productKey = compatV2Config.productKey; label = compatV2Config.label; page = compatV2Config.page; start = require('./routes/couple').start;
  } else {
    return null;
  }
  if (!points.SELLABLE.has(productKey)) return null;
  const price = points.PRICES[productKey];
  const name = (form.name || form.aName || '').toString().slice(0, 30);
  return { productKey, price, label: name ? `${label} — ${name}` : label, page, start };
}

module.exports = { resolveProduct };
