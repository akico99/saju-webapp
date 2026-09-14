'use strict';
require('dotenv').config();
const app = require('./src/server/app');
const { recoverPendingOrders } = require('./src/jobs/recoverPendingOrders');

// 새 요청을 받기 전에 먼저 실행 — 재시작 전 끝내지 못한 작업을 환불 처리한다.
recoverPendingOrders();

const PORT = process.env.PORT || 4500;
app.listen(PORT, () => {
  console.log(`saju-webapp 서버 실행 중: http://localhost:${PORT}`);
});
