'use strict';
/* 카드 결제(토스페이먼츠) 원장 — 상품 1건을 그 가격으로 단건 결제한다.
   결제창을 열기 전에 ready 행을 만들어 상품·금액·폼 입력을 서버가 기억하고(금액은 클라이언트 값을
   믿지 않고 이 행과 대조), 승인 뒤 같은 행에 결제 결과와 시작된 주문(job_id)을 적는다. */
const crypto = require('crypto');
const db = require('./index');
const { adjustPointBalance } = require('./users');

const stmts = {
  insert: db.prepare(`
    INSERT INTO card_payments (user_id, order_id, order_name, amount_krw, test_mode, product_key, form_json)
    VALUES (@userId, @orderId, @orderName, @amountKrw, @testMode, @productKey, @formJson)
  `),
  findByOrderId: db.prepare('SELECT * FROM card_payments WHERE order_id = ?'),
  markPaid: db.prepare(`
    UPDATE card_payments SET status='paid', payment_key=@paymentKey, method=@method, approved_at=@approvedAt
    WHERE id=@id
  `),
  setJob: db.prepare('UPDATE card_payments SET job_id=@jobId WHERE id=@id'),
  markFailed: db.prepare("UPDATE card_payments SET status='failed', error=@error WHERE id=@id"),
  markCanceled: db.prepare("UPDATE card_payments SET status='canceled', error=@error WHERE id=@id"),
  // 생성 실패 환불 — 이 주문(jobId)을 결제한 카드 행을 찾는다. 상품 시작 도중(주문 번호가 카드 행에
  // 적히기 전) 실패한 경우를 위해, 아직 job_id가 없는 같은 상품의 결제 완료 행도 본다. 같은 상품은
  // 동시에 하나만 생성할 수 있으므로(already_pending) 이 조건으로 한 건만 걸린다.
  findForRefund: db.prepare(`
    SELECT * FROM card_payments
    WHERE user_id = @userId AND status = 'paid'
      AND (job_id = @jobId OR (job_id IS NULL AND product_key = @productKey))
    ORDER BY (job_id = @jobId) DESC, id DESC LIMIT 1
  `),
  claimForRefund: db.prepare("UPDATE card_payments SET status='refunding', job_id=COALESCE(job_id, @jobId) WHERE id=@id AND status='paid'"),
  finishRefund: db.prepare('UPDATE card_payments SET status=@status, error=@error WHERE id=@id'),
  findById: db.prepare('SELECT * FROM card_payments WHERE id = ?'),
  insertTx: db.prepare(`
    INSERT INTO point_transactions (user_id, delta, reason, ref_type, ref_id)
    VALUES (@userId, @delta, @reason, 'card_payment', @refId)
  `),
  // 최근 24시간 안에 승인된 테스트 결제 수. approved_at은 토스가 준 시각(+09:00 포함)이라 julianday로 UTC 비교한다.
  countPaidTest: db.prepare(`
    SELECT COUNT(*) AS n FROM card_payments
    WHERE user_id = ? AND status = 'paid' AND test_mode = 1
      AND julianday(COALESCE(approved_at, created_at)) >= julianday('now', '-1 day')
  `),
  listByUser: db.prepare('SELECT * FROM card_payments WHERE user_id = ? ORDER BY id DESC LIMIT 50'),
  listAll: db.prepare(`
    SELECT cp.*, u.email, u.name FROM card_payments cp JOIN users u ON u.id = cp.user_id
    ORDER BY cp.id DESC LIMIT 200
  `)
};

function newOrderId() {
  return 'saju_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function create({ userId, amountKrw, orderName, testMode, productKey, form }) {
  const orderId = newOrderId();
  stmts.insert.run({ userId, orderId, orderName, amountKrw, testMode: testMode ? 1 : 0, productKey, formJson: JSON.stringify(form || {}) });
  return stmts.findByOrderId.get(orderId);
}

function findByOrderId(orderId) { return stmts.findByOrderId.get(orderId); }

/** 승인 완료 기록 + 결제 금액만큼 크레딧을 올린다(1P = 1원). 바로 이어서 상품 start()가 같은 금액을
    차감하므로 정상 흐름에서는 잔액이 남지 않는다 — "충전"이 아니라 결제 1건을 포인트 원장으로 통과시키는 것. */
function markPaidAndCredit(row, { paymentKey, method, approvedAt }) {
  const tx = db.transaction(() => {
    stmts.markPaid.run({ id: row.id, paymentKey, method: method || null, approvedAt: approvedAt || null });
    stmts.insertTx.run({ userId: row.user_id, delta: row.amount_krw, reason: `${row.test_mode ? '테스트 결제' : '카드 결제'}: ${row.order_name}`, refId: row.id });
    adjustPointBalance(row.user_id, row.amount_krw);
  });
  tx();
  return stmts.findByOrderId.get(row.order_id);
}

/** 승인은 됐지만 상품을 시작하지 못했을 때 — 올렸던 크레딧을 되돌린다(결제 취소는 pay.js가 토스에 요청). */
function revertCredit(row, reason) {
  const tx = db.transaction(() => {
    stmts.insertTx.run({ userId: row.user_id, delta: -row.amount_krw, reason: `결제 취소 회수: ${reason}`.slice(0, 200), refId: row.id });
    adjustPointBalance(row.user_id, -row.amount_krw);
    stmts.markCanceled.run({ id: row.id, error: String(reason || '').slice(0, 300) });
  });
  tx();
}

function setJob(row, jobId) { stmts.setJob.run({ id: row.id, jobId }); }

/** 생성 실패 환불용으로 카드 결제 행 하나를 선점한다(paid → refunding). 없거나 이미 다른 곳이
    처리 중이면 null. 선점은 원자적이라 같은 결제를 두 번 취소하지 않는다. */
function claimForRefund({ userId, jobId, productKey }) {
  const row = stmts.findForRefund.get({ userId, jobId: jobId || '', productKey: productKey || '' });
  if (!row) return null;
  const claimed = stmts.claimForRefund.run({ id: row.id, jobId: jobId || null }).changes === 1;
  return claimed ? stmts.findById.get(row.id) : null;
}

/** 토스 취소 결과를 적는다. 실패하면 'cancel_failed'로 남겨 관리자 화면에서 수동 환불 대상을 찾게 한다. */
function finishRefund(row, ok, detail) {
  stmts.finishRefund.run({ id: row.id, status: ok ? 'canceled' : 'cancel_failed', error: String(detail || '').slice(0, 300) });
}

function findById(id) { return stmts.findById.get(id); }
function markFailed(row, error) { stmts.markFailed.run({ id: row.id, error: String(error || '').slice(0, 300) }); }
function countPaidTest(userId) { return stmts.countPaidTest.get(userId).n; }
function listByUser(userId) { return stmts.listByUser.all(userId); }
function listAll() { return stmts.listAll.all(); }

module.exports = {
  create, findByOrderId, findById, markPaidAndCredit, revertCredit, setJob, markFailed, countPaidTest, listByUser, listAll,
  claimForRefund, finishRefund
};
