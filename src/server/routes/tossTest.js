'use strict';
/* 토스페이먼츠 PG 심사 제출용 — 결제창 연동 데모(테스트/샌드박스 모드).
   실제 승인 전이라 진짜 카드결제는 아니지만, 토스 결제위젯 SDK로 실제와 동일한 흐름
   (주문서 → 결제위젯 → 결제요청 → 성공/실패 리다이렉트 → 서버 승인 API)을 그대로 보여준다.
   심사 메일이 요구한 "③ 결제창 연동"과 "④ 결제경로 파일" 스크린샷 자료를 여기서 만든다.

   클라이언트 키(test_ck_...)는 토스페이먼츠가 공식 튜토리얼에 공개해둔 범용 테스트 키라
   그대로 하드코딩해도 안전하다(브라우저에 노출되는 게 원래 용도인 키). 반면 시크릿 키는
   계정별로 발급되는 진짜 비밀 값이라 .env의 TOSS_TEST_SECRET_KEY로만 받는다 — 이건
   대표님이 토스페이먼츠 개발자센터(무료 가입, PG 심사와 무관)에서 직접 발급받아야 한다. */
const express = require('express');
const router = express.Router();

const TOSS_TEST_CLIENT_KEY = process.env.TOSS_TEST_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';
const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

// 체크아웃 페이지가 클라이언트 키를 받아가는 용도 — 시크릿 키는 여기서 절대 내려주지 않는다.
router.get('/toss-test/client-key', (req, res) => {
  res.json({ clientKey: TOSS_TEST_CLIENT_KEY });
});

// successUrl에서 돌아온 뒤 호출 — paymentKey/orderId/amount로 실제 결제 승인을 완료한다.
router.post('/toss-test/confirm', async (req, res) => {
  const secretKey = process.env.TOSS_TEST_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({ error: '.env에 TOSS_TEST_SECRET_KEY가 설정되어 있지 않습니다. 토스페이먼츠 개발자센터(무료 가입)에서 테스트 시크릿 키를 발급받아 넣어주세요.' });
  }
  const { paymentKey, orderId, amount } = req.body;
  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: 'paymentKey, orderId, amount가 모두 필요합니다.' });
  }

  const basicAuth = Buffer.from(`${secretKey}:`).toString('base64');
  try {
    const tossRes = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) })
    });
    const data = await tossRes.json();
    if (!tossRes.ok) {
      return res.status(tossRes.status).json({ error: data.message || '결제 승인에 실패했습니다.', code: data.code });
    }
    res.json({ payment: data });
  } catch (e) {
    res.status(500).json({ error: '토스페이먼츠 승인 API 호출 중 오류: ' + e.message });
  }
});

module.exports = router;
