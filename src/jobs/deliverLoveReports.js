'use strict';
const delivery = require('../db/reportDelivery');
const { deliverLoveReport } = require('../email/loveReport');
let running = false;
async function deliverPendingLoveReports(send) {
  if (running) return;
  running = true;
  try {
    delivery.cleanup();
    for (const row of delivery.pendingJobs()) await deliverLoveReport(row.job_id, send);
  } finally { running = false; }
}
module.exports = { deliverPendingLoveReports };
