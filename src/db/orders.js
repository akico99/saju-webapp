'use strict';
/* 생성 요청(주문) 이력 — "다시보기" 기능의 기반.
   jobManager는 메모리에만 있어 서버 재시작하면 사라지지만, 여기 기록된 result_path는
   디스크의 실제 PDF 파일을 그대로 가리키므로 재시작 후에도 다시 받을 수 있다. */
const db = require('./index');

const stmts = {
  insert: db.prepare(`
    INSERT INTO orders (user_id, product_key, label, job_id, status)
    VALUES (@userId, @productKey, @label, @jobId, 'pending')
  `),
  findByJobId: db.prepare('SELECT * FROM orders WHERE job_id = ?'),
  markDone: db.prepare(`
    UPDATE orders SET status='done', result_path=@resultPath, card_path=@cardPath, finished_at=datetime('now')
    WHERE job_id=@jobId
  `),
  markError: db.prepare(`
    UPDATE orders SET status='error', error=@error, finished_at=datetime('now')
    WHERE job_id=@jobId
  `),
  listByUser: db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100'),
  countDone: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'done'"),
  findPendingByUserAndProduct: db.prepare(
    "SELECT * FROM orders WHERE user_id = ? AND product_key = ? AND status = 'pending' ORDER BY id DESC LIMIT 1"
  )
};

function createOrder({ userId, productKey, label, jobId }) {
  stmts.insert.run({ userId, productKey, label: label || null, jobId });
}

function findByJobId(jobId) {
  return stmts.findByJobId.get(jobId);
}

function markDone(jobId, { resultPath, cardPath }) {
  stmts.markDone.run({ jobId, resultPath: resultPath || null, cardPath: cardPath || null });
}

function markError(jobId, error) {
  stmts.markError.run({ jobId, error: String(error).slice(0, 500) });
}

function listByUser(userId) {
  return stmts.listByUser.all(userId);
}

function countDone() {
  return stmts.countDone.get().c;
}

function findPendingByUserAndProduct(userId, productKey) {
  return stmts.findPendingByUserAndProduct.get(userId, productKey);
}

module.exports = {
  createOrder, findByJobId, markDone, markError, listByUser, countDone, findPendingByUserAndProduct
};
