'use strict';
/* 개인정보 정기 점검 — 시작할 때와 server.js의 기존 60초 타이머에서 부른다.
   (1) 보존 기한이 지난 거래 기록 삭제 (2) 실패했던 생성 파일 삭제 재시도 (3) 쓰고 난 탈퇴 확인 코드 정리.
   로그에는 건수만 남기고 계정·경로·내용은 쓰지 않는다. */
const accountDeletion = require('../db/accountDeletion');

function runPrivacyMaintenance() {
  const out = { expired: 0, files: { removed: 0, rejected: 0, failed: 0 }, codes: 0 };
  try {
    out.expired = accountDeletion.expireRetained();
    out.files = accountDeletion.processPurgeQueue();
    out.codes = accountDeletion.purgeExpiredCodes();
    if (out.expired || out.files.removed || out.files.rejected || out.files.failed) {
      console.log('[개인정보 점검] 만료 거래 기록 ' + out.expired + '건 삭제, 생성 파일 정리 ' + out.files.removed + '건, 건너뜀 ' + out.files.rejected + '건, 재시도 대기 ' + out.files.failed + '건');
    }
  } catch (e) {
    console.error('[개인정보 점검] 실패:', e.message);
  }
  return out;
}

module.exports = { runPrivacyMaintenance };
