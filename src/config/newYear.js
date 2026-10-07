'use strict';

const enabled = /^(1|true|yes|on)$/i.test(String(process.env.NEWYEAR_ENABLED || '').trim());
const configuredPrice = Number(process.env.NEWYEAR_PRICE_KRW);
const priceKrw = Number.isSafeInteger(configuredPrice) && configuredPrice > 0 && configuredPrice <= 100000
  ? configuredPrice
  : 9900;

module.exports = { enabled, priceKrw, year: 2027, productKey: 'new_year_2027' };
