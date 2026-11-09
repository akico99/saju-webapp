'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const express = require('express');
const fixtures = require('./helpers/account-fixtures');
fixtures.makeTempEnv('lifetime-price-');
const m = fixtures.load();
const { resolveProduct } = require('../src/server/products');
const { productCatalog } = require('../src/server/routes/tracking');
const { recoverPendingOrders } = require('../src/jobs/recoverPendingOrders');

test('새 평생사주 결제와 광고 상품 가격은 18,900원이고 다른 상품 가격은 유지된다', () => {
  assert.equal(m.points.PRICES.full, 18900);
  assert.equal(resolveProduct('full', {}).price, 18900);
  assert.equal(productCatalog().full.price, 18900);
  assert.equal(m.points.PRICES.love_timing, 14900);
  assert.equal(m.points.PRICES.reunion_v2, 14900);
  assert.equal(m.points.PRICES.compat_v2, 14900);
});

test('결제 준비 API는 요청 금액을 무시하고 평생사주 18,900원을 주문에 기록한다', async () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: user.id }; next(); });
  app.use('/api', require('../src/server/routes/pay'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const body = JSON.stringify({ product: 'full', form: {}, amount: 1 });
    const response = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/pay/prepare', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
        let text = ''; res.on('data', (chunk) => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      });
      req.on('error', reject); req.end(body);
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.amountKrw, 18900);
    assert.equal(m.cardPayments.findByOrderId(response.body.orderId).amount_krw, 18900);
  } finally { server.closeAllConnections(); server.close(); }
});

test('인상 전 승인된 카드 결제는 저장된 14,900원만 차감하고 주문으로 연결된다', () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const card = m.cardPayments.create({ userId: user.id, amountKrw: 14900, orderName: 'old', testMode: true, productKey: 'full', form: {} });
  m.cardPayments.markPaidAndCredit(card, { paymentKey: 'old-price-test' });
  const amount = m.points.chargeForProductAndCreateOrder(user.id, 'full', { label: 'old', jobId: 'old-price-job', cardPaymentId: card.id });
  assert.equal(amount, 14900);
  assert.equal(m.users.findById(user.id).point_balance, 0);
  assert.equal(m.orders.findByJobId('old-price-job').card_payment_id, card.id);
  assert.throws(() => m.points.chargeForProductAndCreateOrder(user.id, 'full', { jobId: 'duplicate-old-price-job', cardPaymentId: card.id }));
  m.orders.markError('old-price-job', 'test cleanup');
});

test('다른 회원이나 상품의 카드 결제로 가격을 지정할 수 없다', () => {
  const a = fixtures.seedAccount(m, { noPayment: true }).user;
  const b = fixtures.seedAccount(m, { noPayment: true }).user;
  const card = m.cardPayments.create({ userId: a.id, amountKrw: 14900, orderName: 'old', testMode: true, productKey: 'full', form: {} });
  m.cardPayments.markPaidAndCredit(card, { paymentKey: 'owner-test' });
  m.users.adjustPointBalance(b.id, 20000);
  assert.throws(() => m.points.chargeForProductAndCreateOrder(b.id, 'full', { jobId: 'wrong-owner', cardPaymentId: card.id }));
  assert.throws(() => m.points.chargeForProductAndCreateOrder(a.id, 'compat', { jobId: 'wrong-product', cardPaymentId: card.id }));
});

test('재시작 복구 시 인상 전 잔액 주문은 실제 차감액 14,900원만 환불한다', () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const jobId = 'old-balance-job';
  m.db.prepare("INSERT INTO point_transactions (user_id, delta, reason, ref_type, ref_id) VALUES (?, -14900, 'old', 'product_purchase', ?)").run(user.id, jobId);
  m.orders.createOrder({ userId: user.id, productKey: 'full', label: 'old', jobId });
  recoverPendingOrders();
  assert.equal(m.users.findById(user.id).point_balance, 14900);
  assert.equal(m.db.prepare("SELECT delta FROM point_transactions WHERE ref_type='refund' AND ref_id=?").get(jobId).delta, 14900);
});

test('차감액이 확인되지 않는 예전 평생사주는 현재 가격으로 추정 환불하지 않는다', () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const jobId = 'unknown-old-price-job';
  m.orders.createOrder({ userId: user.id, productKey: 'full', label: 'old', jobId });
  recoverPendingOrders();
  assert.equal(m.users.findById(user.id).point_balance, 0);
  assert.match(m.orders.findByJobId(jobId).error, /수동 확인/);
});

test('이미 취소된 카드 주문은 재시작 때 잔액으로 중복 환불하지 않는다', () => {
  const { user } = fixtures.seedAccount(m, { noPayment: true });
  const card = m.cardPayments.create({ userId: user.id, amountKrw: 14900, orderName: 'old', testMode: true, productKey: 'full', form: {} });
  m.cardPayments.markPaidAndCredit(card, { paymentKey: 'canceled-old-price' });
  m.points.chargeForProductAndCreateOrder(user.id, 'full', { jobId: 'canceled-old-job', cardPaymentId: card.id });
  m.db.prepare("UPDATE card_payments SET status='canceled', job_id=? WHERE id=?").run('canceled-old-job', card.id);
  recoverPendingOrders();
  assert.equal(m.users.findById(user.id).point_balance, 0);
  assert.equal(m.db.prepare("SELECT COUNT(*) AS n FROM point_transactions WHERE ref_type='refund' AND ref_id=?").get('canceled-old-job').n, 0);
});

test('평생사주 안내와 검색 정보는 18,900원을 표시한다', () => {
  for (const file of ['public/lifetime-report.html', 'public/premium.html', 'public/webtoon/lifetime.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /18,900/);
    assert.doesNotMatch(html, /14,900|14900/);
  }
  const home = fs.readFileSync('public/index.html', 'utf8');
  assert.match(home, /평생사주 100p · 18,900원/);
  assert.match(home, /<em>18,900원 · PDF<\/em>/);
  assert.match(home, /14,900원 · 웹 \+ PDF/);
});
