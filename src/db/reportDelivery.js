'use strict';
const db = require('./index');
// 주문과 함께 삭제된다. 수신 주소는 마케팅이나 회원 이메일 변경에 사용하지 않는다.
db.exec(`CREATE TABLE IF NOT EXISTS report_delivery (
  job_id TEXT PRIMARY KEY REFERENCES orders(job_id) ON DELETE CASCADE,
  email TEXT NOT NULL, consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  attempted_at INTEGER, provider_id TEXT
)`);
function parseDelivery(body = {}) {
  const email = typeof body.deliveryEmail === 'string' ? body.deliveryEmail.trim() : '';
  if (!email || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new Error('PDF를 받을 이메일을 정확히 입력해 주세요.');
  if (body.deliveryConsent !== true && body.deliveryConsent !== 'on') throw new Error('PDF 이메일 전달에 동의해 주세요.');
  return email;
}
const get = jobId => db.prepare('SELECT * FROM report_delivery WHERE job_id=?').get(jobId);
const create = (jobId, email) => db.prepare('INSERT INTO report_delivery(job_id,email) VALUES (?,?)').run(jobId,email);
function claim(jobId, now = Date.now()) {
  return db.prepare(`UPDATE report_delivery SET status='sending',attempts=attempts+1,attempted_at=?
    WHERE job_id=? AND attempts<3 AND (status IN ('pending','failed') OR (status='sending' AND attempted_at<?))
    AND (attempted_at IS NULL OR attempted_at<?)`)
    .run(now, jobId, now - 120000, now - 60000).changes === 1;
}
function finish(jobId, sent, providerId) {
  db.prepare('UPDATE report_delivery SET status=?,provider_id=? WHERE job_id=?').run(sent ? 'sent' : 'failed',providerId || null,jobId);
}
function publicState(jobId) {
  const row = get(jobId);
  if (!row) return null;
  return { status: row.status, exhausted: row.attempts >= 3, canRetry: row.attempts < 3 && row.status !== 'sent' && (!row.attempted_at || Date.now()-row.attempted_at >= (row.status === 'sending' ? 120000 : 60000)) };
}
function pendingJobs(now = Date.now()) {
  return db.prepare(`SELECT d.job_id FROM report_delivery d JOIN orders o ON o.job_id=d.job_id
    WHERE o.status='done' AND o.result_path IS NOT NULL AND d.attempts<3
    AND (d.status IN ('pending','failed') OR (d.status='sending' AND d.attempted_at<?))
    AND (d.attempted_at IS NULL OR d.attempted_at<?) ORDER BY d.consent_at LIMIT 10`).all(now-120000,now-60000);
}
function cleanup() {
  db.prepare("UPDATE report_delivery SET status='failed' WHERE status='sending' AND attempts>=3 AND attempted_at<?").run(Date.now()-120000);
  db.prepare("DELETE FROM report_delivery WHERE consent_at < datetime('now','-30 days')").run();
  // 카드 승인 대기 중에는 폼 복원에 필요하다. 결제 원장의 사본도 같은 기간 후 제거한다.
  db.prepare(`UPDATE card_payments SET form_json=json_remove(form_json,'$.deliveryEmail','$.deliveryConsent')
    WHERE product_key='love_timing' AND created_at < datetime('now','-30 days') AND json_valid(form_json)
    AND json_type(form_json,'$.deliveryEmail') IS NOT NULL`).run();
}
module.exports = { parseDelivery, get, create, claim, finish, publicState, pendingJobs, cleanup };
