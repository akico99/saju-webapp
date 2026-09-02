'use strict';
/* 포인트 충전 신청 + 관리자 수동 승인 + 상품 구매 차감. 1포인트 = 1원(고정, v1). */
const db = require('./index');
const { adjustPointBalance, findById } = require('./users');

// 상품 가격은 서버가 유일한 기준이다 — 클라이언트가 보내는 price 쿼리파라미터는
// 화면 표시용일 뿐 절대 신뢰하지 않는다(가격 위조 방지).
const PRICES = {
  quick: 990, compat: 4900, full: 14900,
  career_timing: 990, reunion: 990, birth_timing: 2900,
  date_select_moving: 990, date_select_opening: 990, date_select_wedding: 990, date_select_birth: 990,
  date_select_conception: 990
};

const stmts = {
  insertRequest: db.prepare(`
    INSERT INTO point_requests (user_id, amount_krw, points, depositor_name, status)
    VALUES (@userId, @amountKrw, @points, @depositorName, 'pending')
  `),
  findRequest: db.prepare('SELECT * FROM point_requests WHERE id = ?'),
  listByUser: db.prepare('SELECT * FROM point_requests WHERE user_id = ? ORDER BY id DESC'),
  listPending: db.prepare(`
    SELECT pr.*, u.email, u.name FROM point_requests pr
    JOIN users u ON u.id = pr.user_id
    WHERE pr.status = 'pending' ORDER BY pr.id ASC
  `),
  listAll: db.prepare(`
    SELECT pr.*, u.email, u.name FROM point_requests pr
    JOIN users u ON u.id = pr.user_id
    ORDER BY pr.id DESC LIMIT 200
  `),
  resolveRequest: db.prepare(`
    UPDATE point_requests SET status=@status, admin_note=@adminNote, resolved_at=datetime('now')
    WHERE id=@id
  `),
  insertTx: db.prepare(`
    INSERT INTO point_transactions (user_id, delta, reason, ref_type, ref_id)
    VALUES (@userId, @delta, @reason, @refType, @refId)
  `),
  listTxByUser: db.prepare('SELECT * FROM point_transactions WHERE user_id = ? ORDER BY id DESC')
};

/** 상품 구매 시 포인트를 차감한다. 잔액 부족이면 code='insufficient_points'인 Error를 던진다. */
function chargeForProduct(userId, productKey) {
  const price = PRICES[productKey];
  if (!price) throw new Error('알 수 없는 상품입니다: ' + productKey);

  const user = findById(userId);
  if (!user || user.point_balance < price) {
    const err = new Error('포인트가 부족합니다.');
    err.code = 'insufficient_points';
    err.required = price;
    err.balance = user ? user.point_balance : 0;
    throw err;
  }

  const tx = db.transaction(() => {
    stmts.insertTx.run({ userId, delta: -price, reason: `상품 구매: ${productKey}`, refType: 'product_purchase', refId: null });
    adjustPointBalance(userId, -price);
  });
  tx();
  return price;
}

/** 생성 실패 시 차감했던 포인트를 되돌린다. */
function refund(userId, amount, reason) {
  const tx = db.transaction(() => {
    stmts.insertTx.run({ userId, delta: amount, reason, refType: 'refund', refId: null });
    adjustPointBalance(userId, amount);
  });
  tx();
}

/** 관리자가 회원관리 화면에서 포인트를 수동으로 더하거나 뺀다(보너스 지급, 오류 정정 등). */
function adminAdjust(userId, delta, reason) {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('조정 값이 올바르지 않습니다.');
  const user = findById(userId);
  if (!user) throw new Error('회원을 찾을 수 없습니다.');
  if (delta < 0 && user.point_balance + delta < 0) throw new Error('보유 포인트보다 많이 차감할 수 없습니다.');

  const tx = db.transaction(() => {
    stmts.insertTx.run({ userId, delta, reason: reason || '관리자 수동 조정', refType: 'admin_adjust', refId: null });
    adjustPointBalance(userId, delta);
  });
  tx();
  return findById(userId).point_balance;
}

function createRequest({ userId, amountKrw, depositorName }) {
  const points = amountKrw; // 1P = 1원
  const info = stmts.insertRequest.run({ userId, amountKrw, points, depositorName: depositorName || null });
  return stmts.findRequest.get(info.lastInsertRowid);
}

function listMyRequests(userId) {
  return stmts.listByUser.all(userId);
}

function listPendingRequests() {
  return stmts.listPending.all();
}

function listAllRequests() {
  return stmts.listAll.all();
}

function approveRequest(id, adminNote) {
  const reqRow = stmts.findRequest.get(id);
  if (!reqRow) throw new Error('요청을 찾을 수 없습니다.');
  if (reqRow.status !== 'pending') throw new Error('이미 처리된 요청입니다.');

  const tx = db.transaction(() => {
    stmts.resolveRequest.run({ id, status: 'approved', adminNote: adminNote || null });
    stmts.insertTx.run({ userId: reqRow.user_id, delta: reqRow.points, reason: '포인트 충전 승인', refType: 'point_request', refId: id });
    adjustPointBalance(reqRow.user_id, reqRow.points);
  });
  tx();
  return stmts.findRequest.get(id);
}

function rejectRequest(id, adminNote) {
  const reqRow = stmts.findRequest.get(id);
  if (!reqRow) throw new Error('요청을 찾을 수 없습니다.');
  if (reqRow.status !== 'pending') throw new Error('이미 처리된 요청입니다.');
  stmts.resolveRequest.run({ id, status: 'rejected', adminNote: adminNote || null });
  return stmts.findRequest.get(id);
}

function listMyTransactions(userId) {
  return stmts.listTxByUser.all(userId);
}

module.exports = {
  PRICES, chargeForProduct, refund, adminAdjust,
  createRequest, listMyRequests, listPendingRequests, listAllRequests,
  approveRequest, rejectRequest, listMyTransactions
};
