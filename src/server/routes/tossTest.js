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
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// 토스페이먼츠 "주문서형·결제창형 연동 키" 카테고리의 문서 예제 키(누구나 개발자센터에서
// 동일하게 보게 되는 공용 테스트 키 — PG 심사/전자결제 신청과 무관하게 바로 쓸 수 있다).
// 실제 계약된 키는 전자결제 신청 승인 후 개발자센터에서 별도로 발급된다.
const TOSS_TEST_CLIENT_KEY = process.env.TOSS_TEST_CLIENT_KEY || 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm';
const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

// PG 심사용 데모라 실제 고객에게 노출될 이유가 없다 — 관리자 세션이 있을 때만 동작하게
// 막는다(체크아웃 페이지 자체는 public/이라 여전히 열리지만, 이 API가 막히면 결제위젯
// 초기화가 실패해 사실상 기능하지 않는다). PG 심사가 끝나면 라우트 자체를 통째로 지운다.
router.get('/toss-test/client-key', requireAdmin, (req, res) => {
  res.json({ clientKey: TOSS_TEST_CLIENT_KEY });
});

// successUrl에서 돌아온 뒤 호출 — paymentKey/orderId/amount로 실제 결제 승인을 완료한다.
router.post('/toss-test/confirm', requireAdmin, async (req, res) => {
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
