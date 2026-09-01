'use strict';
const express = require('express');
const { getJob } = require('../../jobs/jobManager');

const router = express.Router();

router.get('/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job을 찾을 수 없습니다.' });
  res.json({
    status: job.status,
    progress: job.progress,
    error: job.error
  });
});

module.exports = router;
