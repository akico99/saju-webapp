'use strict';
/* 상품 시작 함수(start)가 라우트 밖(카드 결제 승인 뒤)에서도 불리게 되면서, 응답 코드와 본문을
   res에 직접 쓰는 대신 예외로 던진다. 라우트는 handle()로 감싸 그대로 응답하고, 결제 승인
   쪽은 같은 예외를 잡아 환불 여부를 정한다. */
class HttpError extends Error {
  constructor(status, body) {
    super((body && body.error) || `HTTP ${status}`);
    this.status = status;
    this.body = body || { error: this.message };
  }
}

/** express 핸들러 어댑터 — start(userId, body)의 반환값을 JSON으로, HttpError는 그 코드로. */
function handle(start) {
  return async (req, res) => {
    try {
      res.json(await start(req.session.userId, req.body));
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json(e.body);
      console.error(e);
      res.status(500).json({ error: e.message || '서버 오류' });
    }
  };
}

module.exports = { HttpError, handle };
