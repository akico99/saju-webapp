'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-date-select-payment-'));
process.env.OUTPUT_DIR = path.join(tmpDir, 'output');
fs.mkdirSync(process.env.OUTPUT_DIR, { recursive: true });

const root = path.join(__dirname, '..', 'src');
const charges = [];
const stubs = {
  [path.join(root, 'db', 'orders.js')]: {
    findPendingByUserAndProduct: () => null,
    updateStatus() {}, markDone() {}, markError() {}
  },
  [path.join(root, 'db', 'points.js')]: {
    PRICES: {}, SELLABLE: new Set(),
    chargeForProductAndCreateOrder(userId, productKey, options) { charges.push({ userId, productKey, ...options }); }
  },
  [path.join(root, 'server', 'refundPurchase.js')]: { refundPurchase() {} },
  [path.join(root, 'llm', 'dateSelectReading.js')]: {
    generateDateSelectReport: async () => ({ text: '테스트 리포트', usage: {} })
  },
  [path.join(root, 'llm', 'client.js')]: { costUsd: () => 0 },
  [path.join(root, 'pdf', 'renderDateSelectHtml.js')]: { renderDateSelectHtml: () => '<html></html>' },
  [path.join(root, 'pdf', 'dateSelectVisuals.js')]: { dateSelectWebHtml: () => '' },
  [path.join(root, 'pdf', 'renderPdf.js')]: {
    renderPdf: async (_html, outPath) => {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, 'test pdf');
    }
  }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (stubs[resolved]) return stubs[resolved];
  } catch (_error) { /* Let Node resolve or report the original error. */ }
  return originalLoad.apply(this, arguments);
};
const route = require('../src/server/routes/dateSelect');
Module._load = originalLoad;

const me = { year: 1994, month: 5, day: 17, hour: 9, minute: 0, gender: '여', name: '김하늘' };
const bodies = [
  { key: 'moving', body: { occasion: 'moving', ...me, targetYear: 2026, targetMonth: 11 } },
  { key: 'opening', body: { occasion: 'opening', ...me, targetYear: 2027, targetMonth: 3, industry: '카페' } },
  { key: 'wedding', body: { occasion: 'wedding', ...me, pYear: 1992, pMonth: 11, pDay: 3, pHour: 14, pMinute: 0, pGender: '남', pName: '이준호', targetYear: 2027 } },
  { key: 'birth', body: { occasion: 'birth', baseYear: 2027, baseMonth: 4, baseDay: 20, rangeDays: 5, aYear: 1994, aMonth: 5, aDay: 17, aHour: 9, aGender: '여', aName: '김하늘', bYear: 1992, bMonth: 11, bDay: 3, bHour: 14, bGender: '남', bName: '이준호' } }
];

test.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

for (const [index, { key, body }] of bodies.entries()) {
  test(`${key} card payment id is attached to its created order`, async () => {
    const expectedCardPaymentId = 8100 + index;
    const chargeCountBefore = charges.length;
    const result = await route.start(42, body, { cardPaymentId: expectedCardPaymentId });
    const charge = charges[chargeCountBefore];

    assert.ok(result.jobId, 'the report request should create an order');
    assert.equal(charge.userId, 42);
    assert.equal(charge.productKey, route.OCCASIONS[key].productKey);
    assert.equal(charge.cardPaymentId, expectedCardPaymentId);
  });
}
