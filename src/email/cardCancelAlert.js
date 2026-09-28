'use strict';
/* 카드 결제 자동 취소가 실패했을 때 운영자에게 바로 알린다 — 고객은 돈을 냈는데 리포트도 환불도
   못 받은 상태라 사람이 손으로 취소해야 한다. 절대 던지지 않는다. */
const { sendEmail } = require('./resend');

const ALERT_TO = process.env.ALERT_EMAIL_TO || process.env.BACKUP_EMAIL_TO || 'sooky2001@gmail.com';

function notifyCardCancelFailure(card, detail) {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `
    <div style="font-family:sans-serif;line-height:1.7;max-width:600px">
      <h2 style="margin:0 0 12px">카드 결제 자동 취소 실패 — 수동 환불 필요</h2>
      <p>리포트 생성에 실패해 결제를 취소하려 했지만 토스 취소 요청이 실패했습니다.</p>
      <p><b>주문번호</b> ${esc(card.order_id)}<br><b>상품</b> ${esc(card.order_name)}<br><b>금액</b> ${Number(card.amount_krw).toLocaleString('ko-KR')}원${card.test_mode ? ' (테스트 결제)' : ''}</p>
      <p><b>지금 하실 일</b><br>토스페이먼츠 상점관리자 → 결제 내역에서 위 주문번호를 찾아 전액 취소해 주세요.</p>
      <p style="color:#777;font-size:12px">${esc(detail)}</p>
    </div>`;
  try {
    sendEmail({ to: ALERT_TO, subject: '[사주보는 수달] ⚠ 카드 결제 자동 취소 실패 — 수동 환불 필요', html })
      .catch((e) => console.error('[취소 실패 알림] 메일 발송 실패:', e.message));
  } catch (e) {
    console.error('[취소 실패 알림] 메일 발송 실패:', e.message);
  }
}

module.exports = { notifyCardCancelFailure };
