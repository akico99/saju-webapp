'use strict';
const users = require('../../db/users');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  const user = users.findById(req.session.userId);
  // 관리자가 정지시킨 계정은 이미 로그인된 세션이 있어도(최장 30일 유지) 즉시 막아야 한다 —
  // 세션이 만료될 때까지 계속 이용 가능하면 정지 처리가 사실상 무의미해진다.
  if (!user || user.status === 'suspended') {
    req.session.destroy(() => {});
    return res.status(403).json({ error: '이용이 제한된 계정입니다. 문의: sooky2001@gmail.com' });
  }
  next();
}

// 실제 돈이 오가는 액션(포인트 충전 신청) 앞에만 건다 — 상품 구매는 이미 보유한
// 포인트를 쓰는 것뿐이라 신규 금전 유입이 없으므로 이 체크 대상이 아니다.
function requireVerifiedEmail(req, res, next) {
  const user = users.findById(req.session.userId);
  if (!user || !user.email_verified) {
    return res.status(403).json({ error: '이메일 인증 후 이용할 수 있어요.', code: 'email_not_verified' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: '관리자 로그인이 필요합니다.' });
  }
  next();
}

module.exports = { requireAuth, requireVerifiedEmail, requireAdmin };
