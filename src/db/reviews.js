'use strict';
/* 유료 풀이 검토 기록. 주문(orders)에는 새 컬럼을 두지 않고 job_id로만 잇는다.

   reading_reviews  — 생성 직후 한 번 저장. evidence_json: 이름·생년월일을 가린 장별 본문과 숨김 근거, 생년월일 줄을 뺀
                      여덟 글자 표 HTML. checks_json: factCheck가 남긴 오류·경고(재생성 후에도 남은 것).
   reading_review_marks — 사주를 아는 검토자가 장마다 남기는 판정(ok·unclear·wrong)과 메모. 같은 장을 다시 판정하면 덮어쓴다.
   회원 탈퇴 때는 accountDeletion이 그 회원 주문의 job_id로 두 표를 함께 지운다. */
const db = require('./index');

db.exec(`
  CREATE TABLE IF NOT EXISTS reading_reviews (
    job_id TEXT PRIMARY KEY,
    evidence_json TEXT NOT NULL,
    checks_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS reading_review_marks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    section_key TEXT NOT NULL,
    verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'unclear', 'wrong')),
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (job_id, section_key)
  );
  CREATE INDEX IF NOT EXISTS idx_review_marks_job ON reading_review_marks(job_id);
`);

const VERDICTS = ['ok', 'unclear', 'wrong'];
const MAX_MEMO = 2000;

const stmts = {
  upsert: db.prepare(`
    INSERT INTO reading_reviews (job_id, evidence_json, checks_json) VALUES (?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET evidence_json = excluded.evidence_json, checks_json = excluded.checks_json
  `),
  get: db.prepare(`
    SELECT r.*, o.product_key, o.finished_at FROM reading_reviews r JOIN orders o ON o.job_id = r.job_id WHERE r.job_id = ?
  `),
  // 상품별로 최근 완료 주문 pool건 안에서 무작위로 고른다.
  sample: db.prepare(`
    SELECT * FROM (
      SELECT r.job_id, o.product_key, o.finished_at FROM reading_reviews r JOIN orders o ON o.job_id = r.job_id
      WHERE o.status = 'done' AND o.product_key = ? ORDER BY o.id DESC LIMIT ?
    ) ORDER BY random() LIMIT ?
  `),
  products: db.prepare(`
    SELECT o.product_key, COUNT(*) AS n FROM reading_reviews r JOIN orders o ON o.job_id = r.job_id
    WHERE o.status = 'done' GROUP BY o.product_key ORDER BY o.product_key
  `),
  marksFor: db.prepare('SELECT section_key, verdict, memo, updated_at FROM reading_review_marks WHERE job_id = ?'),
  mark: db.prepare(`
    INSERT INTO reading_review_marks (job_id, section_key, verdict, memo) VALUES (?, ?, ?, ?)
    ON CONFLICT(job_id, section_key) DO UPDATE SET verdict = excluded.verdict, memo = excluded.memo, updated_at = datetime('now')
  `),
  markSummary: db.prepare(`
    SELECT o.product_key, m.section_key, m.verdict, COUNT(*) AS n
    FROM reading_review_marks m JOIN orders o ON o.job_id = m.job_id GROUP BY o.product_key, m.section_key, m.verdict
  `),
  checkRows: db.prepare(`
    SELECT o.product_key, r.checks_json FROM reading_reviews r JOIN orders o ON o.job_id = r.job_id WHERE o.status = 'done'
  `),
  deleteForUser: [
    db.prepare('DELETE FROM reading_review_marks WHERE job_id IN (SELECT job_id FROM orders WHERE user_id = ?)'),
    db.prepare('DELETE FROM reading_reviews WHERE job_id IN (SELECT job_id FROM orders WHERE user_id = ?)')
  ]
};

const parse = (s, fallback) => { try { return JSON.parse(s); } catch (e) { return fallback; } };

function saveReading(jobId, evidence, checks) {
  stmts.upsert.run(String(jobId), JSON.stringify(evidence || {}), JSON.stringify(Array.isArray(checks) ? checks : []));
}

function getReading(jobId) {
  const row = stmts.get.get(String(jobId));
  if (!row) return null;
  const marks = {};
  for (const m of stmts.marksFor.all(row.job_id)) marks[m.section_key] = { verdict: m.verdict, memo: m.memo, updatedAt: m.updated_at };
  return { jobId: row.job_id, productKey: row.product_key, finishedAt: row.finished_at, createdAt: row.created_at,
    evidence: parse(row.evidence_json, {}), checks: parse(row.checks_json, []), marks };
}

/** 상품마다 최근 pool건 중 perProduct건을 무작위로 고른다. */
function sample({ perProduct = 3, pool = 200, productKey = null } = {}) {
  const keys = productKey ? [productKey] : stmts.products.all().map((r) => r.product_key);
  const out = [];
  for (const key of keys) for (const r of stmts.sample.all(key, pool, perProduct)) out.push({ jobId: r.job_id, productKey: r.product_key, finishedAt: r.finished_at });
  return out;
}

function saveMark(jobId, sectionKey, verdict, memo) {
  if (!VERDICTS.includes(verdict)) throw new Error('verdict는 ok·unclear·wrong 중 하나여야 합니다.');
  if (!/^[a-z0-9_]{1,40}$/i.test(String(sectionKey || ''))) throw new Error('잘못된 장 key입니다.');
  if (!stmts.get.get(String(jobId))) throw new Error('검토 기록이 없는 주문입니다.');
  stmts.mark.run(String(jobId), sectionKey, verdict, memo ? String(memo).slice(0, MAX_MEMO) : null);
}

/** 상품·장별 판정 수와 오류율(틀림 / 판정 수), 자동 오류·경고 수. */
function summary() {
  const rows = new Map();
  const at = (p, s) => {
    const k = p + '|' + s;
    if (!rows.has(k)) rows.set(k, { productKey: p, sectionKey: s, ok: 0, unclear: 0, wrong: 0, autoErrors: 0, autoWarnings: 0 });
    return rows.get(k);
  };
  for (const r of stmts.markSummary.all()) at(r.product_key, r.section_key)[r.verdict] += r.n;
  for (const r of stmts.checkRows.all()) for (const c of parse(r.checks_json, [])) {
    const row = at(r.product_key, c.section || 'unknown');
    if (c.level === 'error') row.autoErrors++; else row.autoWarnings++;
  }
  return [...rows.values()].map((r) => {
    const judged = r.ok + r.unclear + r.wrong;
    return { ...r, judged, wrongRate: judged ? r.wrong / judged : null };
  }).sort((a, b) => a.productKey.localeCompare(b.productKey) || a.sectionKey.localeCompare(b.sectionKey));
}

function deleteForUser(userId) { for (const s of stmts.deleteForUser) s.run(userId); }

module.exports = { saveReading, getReading, sample, saveMark, summary, deleteForUser, VERDICTS };

