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
    UPDATE orders SET status='done', result_path=@resultPath, card_path=@cardPath,
      llm_cost_usd=@llmCostUsd, finished_at=datetime('now')
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
  ),
  listRecentDone: db.prepare(`
    SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id = o.user_id
    WHERE o.status = 'done' ORDER BY o.id DESC LIMIT ? OFFSET ?
  `),
  costSummaryByProduct: db.prepare(`
    SELECT product_key, COUNT(*) AS count, SUM(llm_cost_usd) AS total_cost_usd, AVG(llm_cost_usd) AS avg_cost_usd
    FROM orders WHERE status = 'done' AND llm_cost_usd IS NOT NULL GROUP BY product_key
  `)
};

function createOrder({ userId, productKey, label, jobId }) {
  stmts.insert.run({ userId, productKey, label: label || null, jobId });
}

function findByJobId(jobId) {
  return stmts.findByJobId.get(jobId);
}

function markDone(jobId, { resultPath, cardPath, llmCostUsd }) {
  stmts.markDone.run({ jobId, resultPath: resultPath || null, cardPath: cardPath || null, llmCostUsd: llmCostUsd != null ? llmCostUsd : null });
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

function listRecentDone({ limit = 50, offset = 0 } = {}) {
  return stmts.listRecentDone.all(limit, offset);
}

function costSummaryByProduct() {
  return stmts.costSummaryByProduct.all();
}

module.exports = {
  createOrder, findByJobId, markDone, markError, listByUser, countDone, findPendingByUserAndProduct,
  listRecentDone, costSummaryByProduct
};
