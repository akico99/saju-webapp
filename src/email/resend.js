'use strict';
/* Resend(https://resend.com) REST API로 트랜잭션 메일을 보낸다. SDK 없이 fetch로 직접
   호출 — 지금은 비밀번호 재설정 메일 하나뿐이라 의존성을 늘릴 필요가 없다.

   RESEND_FROM 도메인이 아직 인증 전이면 onboarding@resend.dev로만, 그것도 Resend
   가입 계정 본인 이메일로만 보낼 수 있다(무료 플랜 제약) — 실제 회원에게 보내려면
   .env의 RESEND_FROM을 인증된 도메인 주소로 바꿔야 한다. */
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || 'onboarding@resend.dev';
const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || '길잡이 여울';
// noreply@ 주소는 받은편지함이 없어 답장이 사라진다 — 실제로 확인 가능한 문의
// 메일함으로 Reply-To를 걸어서, 발신 표시는 noreply@로 유지하되 답장은 여기로 오게 한다.
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || 'sooky2001@gmail.com';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    throw new Error('이메일 발송이 아직 설정되지 않았습니다 (RESEND_API_KEY 없음).');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${RESEND_FROM_NAME} <${RESEND_FROM}>`, to, subject, html, reply_to: RESEND_REPLY_TO })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `이메일 발송 실패 (${res.status})`);
  }
  return data;
}

module.exports = { sendEmail };
