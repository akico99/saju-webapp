'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 실제 메일이 나가지 않도록 resend를 가짜로 바꾼다.
const resendPath = require.resolve('../src/email/resend');
const sent = [];
let failSend = false;
require.cache[resendPath] = {
  id: resendPath, filename: resendPath, loaded: true,
  exports: { sendEmail: async (m) => { if (failSend) throw new Error('resend down'); sent.push(m); return { id: 'fake' }; } }
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-purchase-alert-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');
process.env.TOSS_SECRET_KEY = 'test_sk_dummy';
const db = require('../src/db');
const users = require('../src/db/users');
const points = require('../src/db/points');
const payments = require('../src/db/cardPayments');
const { recoverPaidPayments } = require('../src/jobs/recoverPendingOrders');
const { notifyPurchase, buildPurchaseAlert } = require('../src/email/purchaseAlert');

const settle = () => new Promise((r) => setTimeout(r, 20));
let seq = 0;
function reconcilePendingPayment() {
  seq++;
  const user = users.createUser({ email: `alert${seq}@example.com`, passwordHash: 'x' });
  const productKey = 'date_select_moving';
  const row = payments.create({
    userId: user.id, amountKrw: points.PRICES[productKey], orderName: '알림 테스트 상품', testMode: false, productKey,
    form: { name: '홍길동', birth: '1995-01-01' },
    attribution: { last: { utm_source: 'meta', utm_campaign: 'original_love_202611', utm_content: 'L1_timing_v1', fbclid: 'abc' } }
  });
  const key = `pk-alert-${seq}`;
  payments.claimConfirmation(row, key);
  payments.deferConfirmation(row, 'ambiguous response');
  return { row: payments.findByOrderId(row.order_id), key };
}
function tossDone(row, key) {
  return async (url) => {
    if (String(url).includes('/orders/')) {
      return { ok: true, status: 200, json: async () => ({ status: 'DONE', orderId: row.order_id, paymentKey: key, totalAmount: row.amount_krw, method: '카드', approvedAt: '2026-11-07T21:30:00+09:00' }) };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'CANCELED', cancels: [{ canceledAt: '2026-11-07T21:31:00+09:00' }] }) };
  };
}

test.after(() => { db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

test('결제가 확정되고 리포트가 시작되면 주문 1건당 메일 1통을 보낸다', async () => {
  sent.length = 0;
  const { row, key } = reconcilePendingPayment();
  const oldFetch = global.fetch;
  global.fetch = tossDone(row, key);
  try {
    await recoverPaidPayments(() => ({ start: async () => ({ jobId: 'job-alert-ok' }) }), [row]);
  } finally { global.fetch = oldFetch; }
  await settle();
  assert.equal(payments.findByOrderId(row.order_id).job_id, 'job-alert-ok');
  assert.equal(sent.length, 1);
  const mail = sent[0];
  assert.equal(mail.idempotencyKey, 'purchase-alert-' + row.order_id);
  assert.match(mail.subject, new RegExp(Number(row.amount_krw).toLocaleString('ko-KR') + '원'));
  assert.match(mail.subject, /L1_timing_v1/);
  assert.match(mail.html, /campaign=original_love_202611/);
  assert.match(mail.html, /fbclid 있음/);
  assert.match(mail.html, new RegExp(row.order_id));
  assert.doesNotMatch(mail.html + mail.subject, /홍길동|1995-01-01/, '고객 입력값은 메일에 담지 않는다');
});

test('리포트 시작에 실패해 자동 취소되는 결제는 알리지 않는다', async () => {
  sent.length = 0;
  const { row, key } = reconcilePendingPayment();
  const oldFetch = global.fetch;
  global.fetch = tossDone(row, key);
  try {
    await recoverPaidPayments(() => ({ start: async () => { throw new Error('start failed'); } }), [row]);
  } finally { global.fetch = oldFetch; }
  await settle();
  assert.equal(payments.findByOrderId(row.order_id).status, 'canceled');
  assert.equal(sent.length, 0);
});

test('테스트 결제는 제목에 표시하고, 유입 기록이 없어도 보낸다', () => {
  const mail = buildPurchaseAlert({ order_id: 'o-test', order_name: '인연의 시기', amount_krw: 14900, test_mode: 1, method: '카드', attribution: null });
  assert.match(mail.subject, /^\[사주보는 수달\] \(테스트 결제\) 결제 14,900원 · 인연의 시기$/);
  assert.match(mail.html, /유입\(마지막\)<\/b> 기록 없음/);
});

test('메일 발송이 실패해도 던지지 않는다', async () => {
  failSend = true;
  try {
    assert.doesNotThrow(() => notifyPurchase({ order_id: 'o-fail', order_name: 'x', amount_krw: 1 }));
    await settle();
  } finally { failSend = false; }
});
