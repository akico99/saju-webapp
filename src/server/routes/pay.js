'use strict';
/* 카드 결제(토스페이먼츠 결제위젯 v2) — 상품 1건을 그 가격으로 단건 결제한다. 선불 충전 없음.

   흐름: 상품 폼 제출 → 잔액 부족(402) → POST /pay/prepare(상품·폼을 서버에 보관, 가격은 서버가 정함)
        → pay.html 결제위젯 → successUrl → POST /pay/confirm(토스 승인) → 같은 금액을 크레딧으로 올리고
        → 즉시 상품 start()가 차감·주문 생성·생성 시작 → 결과 페이지로.
   승인은 됐는데 상품을 시작하지 못하면(입력 오류·중복 주문 등) 크레딧을 회수하고 토스에 결제 취소를 요청한다.

   키는 .env의 TOSS_CLIENT_KEY / TOSS_SECRET_KEY. 시크릿이 live_로 시작하지 않으면 테스트 모드 —
   결제창·승인은 실제와 같지만 청구가 없다. 테스트 모드에서도 상품은 실제로 생성한다(심사자가 결제 후
   제공까지 봐야 하므로). 테스트 결제도 실제 리포트를 만들어 비용이 드니, 계정당 24시간에 TEST_LIMIT_PER_USER건까지만
   상품을 시작한다(결제 기록은 지우지 않고, 하루가 지나면 다시 쓸 수 있다). 건수는 TEST_LIMIT_PER_DAY 환경변수로 바꿀 수 있다. */
const express = require('express');
const users = require('../../db/users');
const cardPayments = require('../../db/cardPayments');
const consents = require('../../db/consents');
const orders = require('../../db/orders');
const { parseDelivery } = require('../../db/reportDelivery');
const { resolveProduct } = require('../products');
const { HttpError } = require('../httpError');
const { requireAuth } = require('../middleware/auth');
const { paymentPrepareLimiter, paymentStartLimiter } = require('../middleware/rateLimit');
const { CLIENT_KEY, SECRET_KEY, TEST_MODE, confirmPayment, lookupPayment, cancelPayment, latestCanceledAt } = require('../tossPayments');
const { notifyPurchase } = require('../../email/purchaseAlert');
const newYearConfig = require('../../config/newYear');
const loveTimingConfig = require('../../config/loveTiming');

const router = express.Router();

const TEST_LIMIT_PER_USER = Number(process.env.TEST_LIMIT_PER_DAY) || 3;
function matchesPayment(row, paymentKey, data) {
  return !!data && data.orderId === row.order_id && Number(data.totalAmount) === row.amount_krw && data.paymentKey === paymentKey;
}
function matchesConfirmedPayment(row, paymentKey, data) {
  return !!data && data.status === 'DONE' && matchesPayment(row, paymentKey, data);
}
const TERMINAL_PAYMENT_FAILURES = new Set(['ABORTED', 'EXPIRED']);
function settleTerminalLookup(row, paymentKey, data, claimed) {
  if (!data || !TERMINAL_PAYMENT_FAILURES.has(data.status) || !matchesPayment(row, paymentKey, data)) return null;
  const message = data.status === 'EXPIRED'
    ? '결제 시간이 지나 만료되었습니다. 새 주문으로 다시 시작해 주세요.'
    : '결제가 승인되지 않았습니다. 새 주문으로 다시 시작해 주세요.';
  const detail = `토스 결제 조회에서 ${data.status} 상태를 확인했습니다.`;
  return cardPayments.failConfirmation(claimed, detail) ? { message } : null;
}
router.get('/pay/config', requireAuth, (req, res) => {
  res.json({ clientKey: CLIENT_KEY, testMode: TEST_MODE });
});

// 결제창을 열기 전에 주문을 만든다 — 상품과 폼 입력을 보관하고 가격은 서버(points.PRICES)가 정한다.
router.post('/pay/prepare', requireAuth, paymentPrepareLimiter, (req, res) => {
  const { product, form, attribution } = req.body || {};
  const resolved = resolveProduct(product, form);
  if (!resolved) return res.status(400).json({ error: '알 수 없는 상품입니다.' });
  // PDF를 이메일로 받는 상품은 결제창을 열기 전에 수신 주소와 동의를 확인한다.
  if (['love', 'newyear', 'reunion', 'couple'].includes(product)) {
    try { require('../../db/reportDelivery').parseDelivery(form); }
    catch (e) { return res.status(400).json({ error: e.message }); }
  }
  const user = users.findById(req.session.userId);
  const row = cardPayments.create({
    userId: user.id, amountKrw: resolved.price, orderName: resolved.label, testMode: TEST_MODE,
    productKey: resolved.productKey, form, attribution
  });
  res.json({
    orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw, page: resolved.page, productKey: row.product_key,
    customerEmail: user.email, customerName: user.name || '고객', testMode: TEST_MODE
  });
});

// 결제창을 열기 직전 — 이용자가 결제 화면에서 직접 체크한 동의를 기록한다. 아직 현재 약관에 동의하지 않은
// 회원은 같은 화면에서 이용약관·개인정보·만 14세 동의도 함께 받는다(동의 페이지를 따로 거치지 않는다).
router.post('/pay/agree', requireAuth, (req, res) => {
  const { orderId, agreeOrder } = req.body || {};
  const row = orderId ? cardPayments.findByOrderId(orderId) : null;
  if (!row || row.user_id !== req.session.userId) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  if (row.status !== 'ready') return res.status(409).json({ error: '이미 처리된 주문입니다.', code: row.status });
  const needsSignup = !consents.hasSignupConsent(req.session.userId);
  if (agreeOrder !== true || (needsSignup && !consents.signupAgreed(req.body))) {
    return res.status(400).json({ error: '필수 항목에 모두 동의해 주세요.', code: 'consent_required' });
  }
  if (needsSignup) consents.recordSignupConsents(req.session.userId, req);
  consents.recordOrderConsent(req.session.userId, orderId, req);
  res.json({ ok: true });
});

/* 구매 창 하나로 끝내는 결제 시작 — 로그인하지 않아도 된다(비회원 결제).
   상품 화면의 구매 창에서 받은 수신 이메일과 필수 동의(이용약관·개인정보·만 14세·주문 내용)를 한 번에 기록하고
   주문을 만든다. 로그인하지 않은 손님에게는 내부용 비회원 계정(users.createGuestUser)을 붙여 이 브라우저 세션에
   연결한다 — 결제·생성·환불·결과 보기가 모두 user_id 기준이라 같은 경로를 그대로 쓴다.
   주문 동의가 이미 남아 있으므로 결제 페이지(pay.html)는 동의를 다시 묻지 않고 결제수단만 보여 준다. */
const START_PRODUCTS = new Set(['love', 'newyear', 'reunion', 'couple']);
router.post('/pay/start', paymentStartLimiter, (req, res) => {
  const body = req.body || {};
  const { product, form, attribution } = body;
  if (!START_PRODUCTS.has(product)) return res.status(400).json({ error: '알 수 없는 상품입니다.' });
  if (!consents.signupAgreed(body) || body.agreeOrder !== true) {
    return res.status(400).json({ error: '필수 항목에 모두 동의해 주세요.', code: 'consent_required' });
  }
  const resolved = resolveProduct(product, form);
  if (!resolved) return res.status(400).json({ error: '알 수 없는 상품입니다.' });
  try { parseDelivery(form); } catch (e) { return res.status(400).json({ error: e.message }); }

  let user = req.session.userId ? users.findById(req.session.userId) : null;
  if (user && user.status === 'suspended') return res.status(403).json({ error: '이용이 제한된 계정입니다. 문의: sooky2001@gmail.com' });
  if (user) {
    const pending = orders.findPendingByUserAndProduct(user.id, resolved.productKey);
    if (pending) return res.status(409).json({ error: '이미 만들고 있는 리포트가 있어요. 완료될 때까지 잠시만 기다려 주세요.', code: 'already_pending', jobId: pending.job_id });
  }
  const finish = () => {
    if (!consents.hasSignupConsent(user.id)) consents.recordSignupConsents(user.id, req);
    const row = cardPayments.create({
      userId: user.id, amountKrw: resolved.price, orderName: resolved.label, testMode: TEST_MODE,
      productKey: resolved.productKey, form, attribution
    });
    consents.recordOrderConsent(user.id, row.order_id, req);
    res.json({ orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw, page: resolved.page, productKey: row.product_key, guest: users.isGuest(user), testMode: TEST_MODE });
  };
  if (user) return finish();
  user = users.createGuestUser();
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: '결제를 준비하지 못했어요. 다시 시도해 주세요.' });
    req.session.userId = user.id;
    finish();
  });
});

/* 결제 승인 요청의 접근 확인. 보통은 주문을 만든 브라우저 세션으로 돌아온다. 비회원 주문은 카드사·간편결제 앱을
   다녀오며 다른 브라우저로 돌아와 세션이 없을 수 있다 — 그때는 토스가 결제자에게만 돌려주는 paymentKey를 가진
   요청만 받고(이미 키가 기록된 주문은 그 키와 같아야 한다), 승인이 확인된 뒤에만 이 브라우저를 그 주문에 연결한다. */
function confirmAccess(req, res, next) {
  const { orderId, paymentKey } = req.body || {};
  const row = orderId ? cardPayments.findByOrderId(orderId) : null;
  const sessionUserId = req.session && req.session.userId;
  const owner = row && row.user_id !== sessionUserId ? users.findById(row.user_id) : null;
  if (owner && users.isGuest(owner) && owner.status !== 'suspended' && typeof paymentKey === 'string' && paymentKey &&
      (!row.payment_key || row.payment_key === paymentKey)) {
    req.guestOwnerId = row.user_id;
    return next();
  }
  return requireAuth(req, res, next);
}

// successUrl에서 돌아온 뒤 — 승인하고, 바로 상품을 시작한다.
router.post('/pay/confirm', confirmAccess, async (req, res) => {
  const { paymentKey, orderId, amount } = req.body;
  if (!orderId) return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });

  const row = cardPayments.findByOrderId(orderId);
  if (!row || (row.user_id !== req.session.userId && row.user_id !== req.guestOwnerId)) return res.status(404).json({ error: '주문을 찾을 수 없습니다.' });
  // 결제가 확인된 응답만 이 브라우저를 비회원 주문에 연결한다(세션이 이미 그 주문의 것이면 그대로 보낸다).
  const adopt = (send) => {
    if (!req.guestOwnerId || req.session.userId === req.guestOwnerId) return send();
    req.session.regenerate((err) => { if (!err) req.session.userId = req.guestOwnerId; send(); });
  };
  // 새로고침/동시 요청은 같은 주문 한 번만 승인하고 시작한다.
  if (row.status === 'paid') return adopt(() => res.json({ payment: summarize(row), jobId: row.job_id, page: pageOf(row), alreadyConfirmed: true }));
  if (row.status === 'confirming') return res.status(202).json({ error: '결제 확인이 진행 중입니다. 같은 주문으로 다시 확인해 주세요.', code: 'confirmation_pending', retry: true });
  const retryingUncertain = row.status === 'reconcile_pending';
  if (row.status !== 'ready' && !retryingUncertain) return res.status(409).json({ error: '이미 처리된 주문입니다.', code: row.status });
  // 불확실 상태는 새 승인 요청이 아니다. 저장된 결제 키와 서버 원장 금액으로 조회해
  // 브라우저 콜백의 누락·오래된 값·변조가 복구를 막지 않도록 한다.
  const confirmationPaymentKey = retryingUncertain ? (row.payment_key || paymentKey) : paymentKey;
  if (!confirmationPaymentKey || (!retryingUncertain && (amount == null || amount === ''))) {
    return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });
  }
  // 가입 동의·주문 동의 기록이 없는 결제는 승인하지 않는다(토스 승인 전이라 청구되지 않는다).
  if (!retryingUncertain && (!consents.hasSignupConsent(row.user_id) || !consents.hasOrderConsent(row.user_id, orderId))) {
    cardPayments.markFailed(row, '주문 동의 기록 없음');
    return res.status(400).json({ error: '주문 내용 확인 및 결제 동의가 확인되지 않아 결제를 진행하지 않았어요. 다시 시도해 주세요.', code: 'consent_required' });
  }
  // 새 승인 요청은 요청 금액을 거부한다. 이미 응답이 불확실한 주문은 새 청구를 하지 않고
  // 원장 금액과 PG 조회 결과만 대조해 복구하므로, 변조되거나 오래된 브라우저 금액으로 닫지 않는다.
  if (!retryingUncertain && Number(amount) !== row.amount_krw) {
    cardPayments.markFailed(row, `금액 불일치: 요청 ${amount}, 주문 ${row.amount_krw}`);
    return res.status(400).json({ error: '결제 금액이 주문 금액과 다릅니다. 결제가 승인되지 않았습니다.' });
  }
  if (!SECRET_KEY) return res.status(503).json({ error: '결제 서버 설정이 아직 완료되지 않았습니다(TOSS_SECRET_KEY 없음).' });
  if (!retryingUncertain && row.test_mode && cardPayments.countPaidTest(row.user_id) >= TEST_LIMIT_PER_USER) {
    cardPayments.markFailed(row, '테스트 결제 한도 초과');
    return res.status(429).json({ error: `테스트 모드에서는 계정당 24시간에 ${TEST_LIMIT_PER_USER}건까지만 결제할 수 있어요. 내일 다시 시도해 주세요.` });
  }

  // 한 요청만 토스 승인을 시도한다.
  const claimed = cardPayments.claimConfirmation(row, confirmationPaymentKey);
  if (!claimed) return res.status(202).json({ error: '결제 확인이 진행 중입니다. 같은 주문으로 다시 확인해 주세요.', code: 'confirmation_pending', retry: true });

  // 이미 승인 응답이 불확실했던 주문은 승인 API를 재호출하지 않고 조회만 한다.
  let approved;
  if (retryingUncertain) {
    const checked = await lookupPayment(orderId);
    const d = checked.data || {};
    if (checked.ok && matchesConfirmedPayment(row, confirmationPaymentKey, d)) {
      approved = { ok: true, data: d };
    } else {
      if (checked.ok && d.status === 'CANCELED' && matchesPayment(row, confirmationPaymentKey, d)) {
        cardPayments.markUnconfirmedCanceled(claimed, latestCanceledAt(d));
        return res.status(409).json({ error: '이 결제는 취소된 상태입니다. 상품 페이지에서 새 주문으로 다시 시작해 주세요.', code: 'payment_canceled', canceled: true });
      }
      const terminal = checked.ok && settleTerminalLookup(row, confirmationPaymentKey, d, claimed);
      if (terminal) return res.status(409).json({ error: terminal.message, code: 'payment_not_approved' });
      cardPayments.deferConfirmation(claimed, '재시도 조회에서도 승인 결과 미확정');
      return res.status(202).json({ error: '결제 확인이 아직 진행 중입니다. 잠시 후 같은 주문으로 다시 확인해 주세요.', code: 'confirmation_pending', retry: true });
    }
  } else {
    // 1) 토스 승인
    try {
      approved = await confirmPayment({ paymentKey: confirmationPaymentKey, orderId, amount: row.amount_krw });
    } catch (e) {
      approved = { ok: false, status: 0, data: { message: e.message } };
    }
  }
  if (!retryingUncertain && !approved.ok && (approved.status === 0 || approved.status >= 500 || approved.status === 409)) {
    const checked = await lookupPayment(orderId);
    const d = checked.data || {};
    if (checked.ok && matchesConfirmedPayment(row, confirmationPaymentKey, d)) {
      approved = { ok: true, data: d };
    } else {
      if (checked.ok && d.status === 'CANCELED' && matchesPayment(row, confirmationPaymentKey, d)) {
        cardPayments.markUnconfirmedCanceled(claimed, latestCanceledAt(d));
        return res.status(409).json({ error: '이 결제는 취소된 상태입니다. 상품 페이지에서 새 주문으로 다시 시작해 주세요.', code: 'payment_canceled', canceled: true });
      }
      const terminal = checked.ok && settleTerminalLookup(row, confirmationPaymentKey, d, claimed);
      if (terminal) return res.status(409).json({ error: terminal.message, code: 'payment_not_approved' });
      cardPayments.deferConfirmation(claimed, '승인 결과 미확인');
      return res.status(202).json({ error: '결제 확인이 아직 진행 중입니다. 잠시 후 같은 주문으로 다시 확인해 주세요.', code: 'confirmation_pending', retry: true });
    }
  }
  if (!approved.ok) {
    cardPayments.releaseConfirmation(row, `${approved.data.code || approved.status} ${approved.data.message || ''}`);
    return res.status(approved.status).json({ error: approved.data.message || '결제 승인에 실패했습니다.', code: approved.data.code });
  }

  // 2) 결제 금액만큼 크레딧 → 3) 즉시 상품 시작(같은 금액 차감). 정상이면 잔액 변동 0.
  const paid = cardPayments.markPaidAndCredit(row, { paymentKey: confirmationPaymentKey, method: approved.data.method, approvedAt: approved.data.approvedAt });
  if (!paid) {
    const current = cardPayments.findByOrderId(orderId);
    if (current && current.status === 'paid') {
      return adopt(() => res.json({ payment: summarize(current), jobId: current.job_id, page: pageOf(current), alreadyConfirmed: true }));
    }
    return res.status(202).json({ error: '결제 상태를 계속 확인하고 있습니다. 같은 주문으로 다시 확인해 주세요.', code: 'confirmation_pending', retry: true });
  }
  const form = JSON.parse(row.form_json || '{}');
  const resolved = resolveProduct(productOf(row.product_key), form);
  try {
    if (!resolved) throw new HttpError(400, { error: '알 수 없는 상품입니다.' });
    if (!cardPayments.claimPaidStart(paid)) return adopt(() => res.status(202).json({ error: '결제는 확인됐고 리포트 시작을 확인하고 있어요. 마이페이지에서 잠시 후 확인해 주세요.', code: 'start_pending', retry: true }));
    const payload = await resolved.start(row.user_id, form, { cardPaymentId: paid.id });
    cardPayments.setJob(paid, payload.jobId);
    notifyPurchase(paid);
    return adopt(() => res.json({ payment: summarize(paid), jobId: payload.jobId, page: resolved.page, payload }));
  } catch (e) {
    // 승인은 됐지만 상품을 시작하지 못했다. 상품이 이미 차감까지 한 뒤 실패했다면 그쪽에서
    // refundPurchase가 이 결제를 선점해 카드 취소를 진행 중이다 — 그때는 두 번 취소하지 않는다.
    const reason = (e.body && e.body.error) || e.message || '상품 시작 실패';
    const status = e instanceof HttpError ? e.status : 500;
    const current = cardPayments.findById(paid.id);
    if (current.status !== 'paid') {
      return res.status(status).json({ error: `${reason} 결제는 자동으로 취소돼요.`, code: e.body && e.body.code, canceled: true });
    }
    // 차감 전에 실패했다 — 크레딧 회수 + 토스 결제 취소. 사용자에겐 이유를 그대로 보여준다.
    const cancelClaim = cardPayments.claimCancellationWithCreditReversal(cardPayments.findById(paid.id), reason);
    const cancel = cancelClaim ? await cancelPayment(confirmationPaymentKey, reason, cancelClaim.cancel_idempotency_key) : { ok: false, data: { message: '취소 진행 중' } };
    if (cancelClaim) cardPayments.finishRefund(cancelClaim, cancel.ok, cancel.data && cancel.data.message || reason, latestCanceledAt(cancel.data));
    if (!cancel.ok) console.error('[pay] 결제 취소 실패 — 수동 취소 필요:', orderId, cancel.data);
    return res.status(status).json({
      error: `${reason} 결제는 ${cancel.ok ? '자동으로 취소되었습니다' : '취소 요청 중 문제가 생겨 운영자가 확인 후 환불합니다'}.`,
      code: e.body && e.body.code, canceled: cancel.ok
    });
  }
});

router.get('/pay/mine', requireAuth, (req, res) => {
  // 결제 페이지가 쓰는 두 값 — 구매 창에서 주문 동의를 이미 받았는지(받았으면 다시 묻지 않는다),
  // 토스 영수증을 보낼 주소(구매 창에서 받은 수신 이메일). 아직 결제하지 않은 주문에만 주소를 싣는다.
  res.json({ payments: cardPayments.listByUser(req.session.userId).map((row) => Object.assign(summarize(row), {
    orderAgreed: consents.hasOrderConsent(row.user_id, row.order_id),
    customerEmail: row.status === 'ready' ? deliveryEmailOf(row) : null
  })) });
});

function deliveryEmailOf(row) {
  try {
    const f = JSON.parse(row.form_json || '{}');
    return typeof f.deliveryEmail === 'string' && f.deliveryEmail.trim() ? f.deliveryEmail.trim().slice(0, 254) : null;
  } catch (e) { return null; }
}

// product_key → resolveProduct의 product 종류 (폼은 원장에 보관된 것을 그대로 쓴다)
function productOf(productKey) {
  if (productKey === 'full') return 'full';
  if (productKey === 'compat') return 'compat';
  if (productKey.startsWith('deep_')) return 'deep';
  if (productKey.startsWith('date_select_')) return 'date_select';
  if (productKey === newYearConfig.productKey) return 'newyear';
  if (productKey === loveTimingConfig.productKey) return 'love';
  if (productKey === 'reunion_v2') return 'reunion';
  if (productKey === 'compat_v2') return 'couple';
  return null;
}
function pageOf(row) {
  const r = resolveProduct(productOf(row.product_key || ''), JSON.parse(row.form_json || '{}'));
  return r ? r.page : '/mypage.html';
}
function summarize(row) {
  return {
    orderId: row.order_id, orderName: row.order_name, amountKrw: row.amount_krw, status: row.status,
    method: row.method, testMode: !!row.test_mode, approvedAt: row.approved_at, createdAt: row.created_at, jobId: row.job_id,
    productKey: row.product_key
  };
}

module.exports = router;
module.exports.matchesConfirmedPayment = matchesConfirmedPayment;
