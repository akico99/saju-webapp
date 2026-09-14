'use strict';
/* 로그인류 엔드포인트(관리자 로그인, 회원 로그인/가입/비밀번호 찾기)에 시도 횟수 제한을 건다.
   지금까지 이 엔드포인트들엔 제한이 전혀 없어서, 특히 관리자 로그인(비밀번호 하나만 맞으면
   회원 전체 정보·주문 내역에 접근 가능)은 이론상 무제한 브루트포스가 가능했다.

   별도 라이브러리(express-rate-limit 등) 없이 메모리 Map으로 직접 구현 — 이 서비스는
   Render 단일 인스턴스로만 운영되므로(SQLite 제약과 동일한 이유) 외부 저장소(Redis 등)
   없이도 충분하다. 서버 재시작 시 카운트가 초기화되는 건 감수한다(위협 모델상 큰 문제
   아님 — 재시작 자체가 자주 일어나지 않고, 그 순간을 노리는 것도 실익이 없다). */

const buckets = new Map(); // key -> { count, resetAt }

function makeLimiter({ max, windowMs, keyFn, message }) {
  return function rateLimit(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message || '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
    }
    next();
  };
}

// 아주 가끔 늘어나기만 하는 걸 막기 위한 정리 — 매 요청마다 청소하면 낭비이므로
// 일정 확률로만 만료된 항목을 정리한다.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 10 * 60 * 1000).unref();

const adminLoginLimiter = makeLimiter({
  max: 10, windowMs: 15 * 60 * 1000,
  keyFn: (req) => 'admin:' + req.ip,
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'
});

const userLoginLimiter = makeLimiter({
  max: 10, windowMs: 15 * 60 * 1000,
  // 이메일까지 키에 포함 — 같은 사무실/공유 IP에서 다른 계정으로 로그인하는 사람들이
  // 서로 때문에 막히지 않게 하면서도, 특정 계정을 겨냥한 무차별 대입은 여전히 막는다.
  keyFn: (req) => 'login:' + req.ip + ':' + String((req.body && req.body.email) || '').toLowerCase(),
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'
});

const signupLimiter = makeLimiter({
  max: 8, windowMs: 60 * 60 * 1000,
  keyFn: (req) => 'signup:' + req.ip,
  message: '가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'
});

const forgotPasswordLimiter = makeLimiter({
  max: 5, windowMs: 60 * 60 * 1000,
  keyFn: (req) => 'forgot:' + req.ip,
  message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
});

module.exports = { adminLoginLimiter, userLoginLimiter, signupLimiter, forgotPasswordLimiter };
