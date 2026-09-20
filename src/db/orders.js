'use strict';
/* 생성 요청(주문) 이력 — "다시보기" 기능과 /api/status 진행률 조회의 기반.
   상태(status)·진행률(progress_current/total)까지 전부 여기 저장하므로, 서버가
   재시작돼도 남아있다. result_path는 디스크의 실제 PDF 파일을 그대로 가리키므로
   재시작 후에도 다시 받을 수 있다. */
const db = require('./index');

const stmts = {
  insert: db.prepare(`
    INSERT INTO orders (user_id, product_key, label, job_id, status)
    VALUES (@userId, @productKey, @label, @jobId, 'pending')
  `),
  findByJobId: db.prepare('SELECT * FROM orders WHERE job_id = ?'),
  // 요약 카드는 명식 계산만으로 만들어져 LLM을 기다릴 필요가 없다. 완료 전에 먼저 기록해
  // 생성 중에도 내려받을 수 있게 한다.
  setCardPath: db.prepare('UPDATE orders SET card_path=@cardPath WHERE job_id=@jobId'),
  markDone: db.prepare(`
    UPDATE orders SET status='done', result_path=@resultPath, card_path=@cardPath,
      llm_cost_usd=@llmCostUsd, result_text=@resultText, finished_at=datetime('now')
    WHERE job_id=@jobId
  `),
  markError: db.prepare(`
    UPDATE orders SET status='error', error=@error, finished_at=datetime('now')
    WHERE job_id=@jobId
  `),
  listByUser: db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 100'),
  countDone: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'done'"),
  // 'pending'은 주문이 막 만들어진 순간부터 res.json() 직후 'generating'으로 넘어가기
  // 직전까지만 잠깐 머무는 상태라, 실제로 사용자가 중복 클릭하는 시점(생성/렌더링 중)엔
  // 이미 'pending'을 지나 있다 — 그래서 진행 중 상태 셋 전체를 봐야 "이미 생성 중" 확인이
  // 실제로 의미가 있다. 같은 이유로 재시작 복구(recoverPendingOrders)도 이 세 상태를 본다.
  findPendingByUserAndProduct: db.prepare(
    "SELECT * FROM orders WHERE user_id = ? AND product_key = ? AND status IN ('pending', 'generating', 'rendering') ORDER BY id DESC LIMIT 1"
  ),
  // 'recovering'도 포함한다 — claim은 했는데 환불·error 처리 전에 프로세스가 또 죽으면
  // 그 주문이 'recovering'에 영원히 멈춰서 다음 재시작 때도 안 잡히는 사각지대가 생긴다.
  listAllPending: db.prepare("SELECT * FROM orders WHERE status IN ('pending', 'generating', 'rendering', 'recovering')"),
  // 재시작 복구 전용 — 여러 프로세스가 동시에 뜨는 극단적인 상황에서도 한 프로세스만
  // 이 주문을 처리하게 선점한다. WHERE 조건까지 만족해야 바뀌므로, 이미 다른 프로세스가
  // 'recovering'으로 바꿔놨다면(=선점됐다면) changes가 0이 되어 알 수 있다. 'recovering'
  // 자체도 다시 선점 가능하게 둔다 — 그래야 위 사각지대(claim 후 죽음)를 다음 재시작이
  // 복구할 수 있다.
  claimForRecovery: db.prepare(
    "UPDATE orders SET status='recovering' WHERE job_id=@jobId AND status IN ('pending', 'generating', 'rendering', 'recovering')"
  ),
  updateStatus: db.prepare('UPDATE orders SET status=@status WHERE job_id=@jobId'),
  updateProgress: db.prepare('UPDATE orders SET progress_current=@current, progress_total=@total WHERE job_id=@jobId'),
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

function markDone(jobId, { resultPath, cardPath, llmCostUsd, resultText }) {
  stmts.markDone.run({
    jobId, resultPath: resultPath || null, cardPath: cardPath || null,
    llmCostUsd: llmCostUsd != null ? llmCostUsd : null, resultText: resultText || null
  });
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

function listAllPending() {
  return stmts.listAllPending.all();
}

function claimForRecovery(jobId) {
  const info = stmts.claimForRecovery.run({ jobId });
  return info.changes === 1;
}

function updateStatus(jobId, status) {
  stmts.updateStatus.run({ jobId, status });
}

function setCardPath(jobId, cardPath) {
  stmts.setCardPath.run({ jobId, cardPath });
}

function updateProgress(jobId, progress) {
  stmts.updateProgress.run({ jobId, current: progress.current, total: progress.total });
}

function listRecentDone({ limit = 50, offset = 0 } = {}) {
  return stmts.listRecentDone.all(limit, offset);
}

function costSummaryByProduct() {
  return stmts.costSummaryByProduct.all();
}

module.exports = {
  createOrder, findByJobId, markDone, markError, listByUser, countDone, findPendingByUserAndProduct,
  listAllPending, claimForRecovery, updateStatus, updateProgress, listRecentDone, costSummaryByProduct,
  setCardPath
};
