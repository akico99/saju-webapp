'use strict';
require('dotenv').config();
const { validateRuntimeConfig } = require('./src/config/validateRuntimeConfig');
try {
  validateRuntimeConfig();
} catch (error) {
  // The validator reports setting names only; never print secret values.
  console.error(`[설정 오류] ${error.message}`);
  process.exit(1);
}
const app = require('./src/server/app');
const { recoverPendingOrders, recoverPaidPayments } = require('./src/jobs/recoverPendingOrders');
const { backupDbToEmail } = require('./src/jobs/backupDb');
const { runPrivacyMaintenance } = require('./src/jobs/privacyMaintenance');

// 새 요청을 받기 전에 먼저 실행 — 재시작 전 끝내지 못한 작업을 환불 처리한다.
recoverPendingOrders();
// 보존 기한이 지난 거래 기록과 삭제하지 못한 생성 파일을 정리한다 — 아래 60초 타이머에서도 이어서 부른다.
runPrivacyMaintenance();
recoverPaidPayments().catch((e) => console.error('[결제 복구] 실패:', e.message));
const paymentRecoveryTimer = setInterval(() => {
  recoverPaidPayments().catch((e) => console.error('[결제 복구] 실패:', e.message));
  runPrivacyMaintenance();
}, 60 * 1000);
paymentRecoveryTimer.unref();

// DB 외부(관리자 메일함) 백업 — 부팅 2분 후 1회, 이후 24시간마다 반복. 배포가 잦은
// 시기엔 배포할 때마다 최신 백업이 하나씩 쌓이고, 안정화된 뒤에는 하루 한 번씩 쌓인다.
if (process.env.RESEND_API_KEY) {
  setTimeout(() => {
    backupDbToEmail().catch((e) => console.error('[DB 백업] 실패:', e.message));
    setInterval(() => {
      backupDbToEmail().catch((e) => console.error('[DB 백업] 실패:', e.message));
    }, 24 * 60 * 60 * 1000);
  }, 2 * 60 * 1000);
} else {
  console.warn('[DB 백업] RESEND_API_KEY가 없어 자동 백업이 꺼져 있습니다.');
}

const PORT = process.env.PORT || 4500;
app.listen(PORT, () => {
  console.log(`saju-webapp 서버 실행 중: http://localhost:${PORT}`);
});
