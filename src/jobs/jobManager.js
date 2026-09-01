'use strict';
/* in-memory job 저장소 — 단일 로컬 사용자 도구이므로 서버 재시작 시 진행 중이던 job은
   유실된다(README에 명시할 제약). jobId별 상태: computing → generating → rendering → done|error */

const crypto = require('crypto');

const jobs = new Map();

function createJob() {
  const id = crypto.randomUUID();
  jobs.set(id, { id, status: 'computing', progress: { current: 0, total: 18 }, error: null, resultPath: null, engineSummary: null });
  return id;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

module.exports = { createJob, getJob, updateJob };
