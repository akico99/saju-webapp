'use strict';
/* LLM 제공사(Anthropic) 쪽 장애를 운영자에게 메일로 알린다.

   2026-09-17에 API 선불 크레딧이 0이 되어 유료 상품 생성이 전부 실패했는데, 고객이 먼저
   겪고 운영자는 나중에 알았다. 포인트는 자동 환불되지만 그 사이 결제한 사람은 전부
   "사이트 고장"을 본 셈이다. 잔액 부족·인증 실패처럼 재시도로 안 풀리는 오류가 나면
   바로 메일을 보낸다.

   - 같은 종류의 알림은 6시간에 한 번만 보낸다. 장애 중에는 결제할 때마다 실패하므로,
     막지 않으면 메일함이 같은 메일로 채워진다.
   - 절대 던지지 않는다. 알림 실패가 생성 작업의 에러 경로를 바꾸면 안 된다.
   - 백업 메일과 같은 Resend 설정을 쓴다(RESEND_API_KEY 없으면 조용히 건너뜀). */
const { sendEmail } = require('./resend');

const ALERT_TO = process.env.ALERT_EMAIL_TO || process.env.BACKUP_EMAIL_TO || 'sooky2001@gmail.com';
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const lastSentAt = new Map(); // kind -> timestamp

function kindOf(error) {
  const msg = String((error && error.message) || error || '');
  if (/credit balance|insufficient credits|purchase credits|billing/i.test(msg)) return 'credit';
  const status = Number(error && error.status);
  if (status === 401 || status === 403) return 'auth';
  return null;
}

const COPY = {
  credit: {
    subject: '[사주보는 수달] ⚠ Anthropic 크레딧 소진 — 유료 상품 생성 중단',
    what: 'Anthropic API 선불 크레딧이 떨어졌습니다. 지금부터 빠른 리딩·주제별 리포트·평생사주 등 LLM을 쓰는 모든 상품이 실패합니다.',
    todo: 'console.anthropic.com → Plans & Billing에서 크레딧을 충전해주세요. 충전 즉시 복구되며 서버 재시작은 필요 없습니다. 같은 화면의 Auto-reload(자동 충전)를 켜두면 재발하지 않습니다.'
  },
  auth: {
    subject: '[사주보는 수달] ⚠ Anthropic API 인증 실패 — 유료 상품 생성 중단',
    what: 'Anthropic API 키가 거부됐습니다(401/403). 키가 폐기됐거나 Render 환경변수가 바뀐 것일 수 있습니다.',
    todo: 'Render → Environment의 ANTHROPIC_API_KEY와 console.anthropic.com의 API Keys를 대조해주세요.'
  }
};

function notifyProviderOutage(error) {
  const kind = kindOf(error);
  if (!kind) return;
  const now = Date.now();
  const last = lastSentAt.get(kind) || 0;
  if (now - last < COOLDOWN_MS) return;
  lastSentAt.set(kind, now);

  const c = COPY[kind];
  const when = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  const raw = String((error && error.message) || error || '').slice(0, 600);
  const html = `
    <div style="font-family:sans-serif;line-height:1.7;max-width:600px">
      <h2 style="margin:0 0 12px">${c.subject.replace('[사주보는 수달] ', '')}</h2>
      <p><b>발생 시각</b> ${when}</p>
      <p><b>무슨 일인가</b><br>${c.what}</p>
      <p><b>고객 영향</b><br>결제한 고객은 오류 화면을 보고, 차감된 포인트는 자동 환불됩니다. 복구 전까지는 결제할 때마다 같은 일이 반복됩니다.</p>
      <p><b>지금 하실 일</b><br>${c.todo}</p>
      <p style="color:#777;font-size:12px"><b>원문 오류</b><br><code>${raw.replace(/</g, '&lt;')}</code></p>
      <p style="color:#777;font-size:12px">이 알림은 같은 종류의 오류에 대해 6시간에 한 번만 발송됩니다.</p>
    </div>`;

  sendEmail({ to: ALERT_TO, subject: c.subject, html })
    .then(() => console.log(`[장애 알림] ${kind} 메일 발송 → ${ALERT_TO}`))
    .catch((e) => console.error('[장애 알림] 메일 발송 실패:', e.message));
}

module.exports = { notifyProviderOutage, kindOf };
