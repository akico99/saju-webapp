'use strict';
/* 카드 결제(토스페이먼츠) 원장 — 결제창을 열기 전에 ready 행을 만들고(서버가 금액을 기억),
   successUrl로 돌아온 뒤 승인 API 결과를 같은 행에 기록한다. 금액은 클라이언트가 보내는 값을
   믿지 않고 이 행의 amount_krw와 대조한다(금액 위조 방지). */
const crypto = require('crypto');
const db = require('./index');
const { adjustPointBalance } = require('./users');

const stmts = {
  insert: db.prepare(`
    INSERT INTO card_payments (user_id, order_id, order_name, amount_krw, test_mode)
    VALUES (@userId, @orderId, @orderName, @amountKrw, @testMode)
  `),
  findByOrderId: db.prepare('SELECT * FROM card_payments WHERE order_id = ?'),
  markPaid: db.prepare(`
    UPDATE card_payments SET status='paid', payment_key=@paymentKey, method=@method, approved_at=@approvedAt
    WHERE id=@id
  `),
  markFailed: db.prepare("UPDATE card_payments SET status='failed', error=@error WHERE id=@id"),
  insertTx: db.prepare(`
    INSERT INTO point_transactions (user_id, delta, reason, ref_type, ref_id)
    VALUES (@userId, @delta, @reason, 'card_payment', @refId)
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

function create({ userId, amountKrw, orderName, testMode }) {
  const orderId = newOrderId();
  stmts.insert.run({ userId, orderId, orderName, amountKrw, testMode: testMode ? 1 : 0 });
  return stmts.findByOrderId.get(orderId);
}

function findByOrderId(orderId) { return stmts.findByOrderId.get(orderId); }

/** 승인 완료 처리. 실결제(test_mode=0)면 같은 트랜잭션에서 포인트를 지급한다(1P = 1원). */
function markPaid(row, { paymentKey, method, approvedAt }) {
  const tx = db.transaction(() => {
    stmts.markPaid.run({ id: row.id, paymentKey, method: method || null, approvedAt: approvedAt || null });
    if (!row.test_mode) {
      stmts.insertTx.run({ userId: row.user_id, delta: row.amount_krw, reason: '포인트 충전(카드)', refId: row.id });
      adjustPointBalance(row.user_id, row.amount_krw);
    }
  });
  tx();
  return stmts.findByOrderId.get(row.order_id);
}

function markFailed(row, error) {
  stmts.markFailed.run({ id: row.id, error: String(error || '').slice(0, 300) });
}

function listByUser(userId) { return stmts.listByUser.all(userId); }
function listAll() { return stmts.listAll.all(); }

module.exports = { create, findByOrderId, markPaid, markFailed, listByUser, listAll };
