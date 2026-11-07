'use strict';
/* 카드 결제가 승인되고 리포트 생성까지 시작된 순간 운영자에게 메일로 알린다.
   광고를 집행하는 동안 구매가 생기면 바로 알고, Meta 구매 이벤트·주문 기록과 대조하려는 용도다.

   - 리포트 시작 뒤에 보낸다. 승인 직후 시작에 실패하면 결제가 자동 취소되므로, 그 건을 '구매'로 알리지 않는다.
   - 고객 이름·생년월일 같은 입력값(form_json)은 담지 않는다. 주문번호·상품·금액·결제수단·광고 유입값만 보낸다.
   - 같은 주문은 Resend Idempotency-Key로 한 번만 발송한다(웹 확인과 재시작 복구가 겹쳐도).
   - 절대 던지지 않는다. 알림 실패가 결제·생성 흐름을 바꾸면 안 된다. */
const { sendEmail } = require('./resend');

const ALERT_TO = process.env.PURCHASE_ALERT_TO || process.env.ALERT_EMAIL_TO || process.env.BACKUP_EMAIL_TO || 'sooky2001@gmail.com';
const ADMIN_URL = 'https://sajuotter.com/admin-payments.html';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function parseAttribution(raw) {
  if (!raw) return null;
  try {
    const a = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return a && (a.first || a.last) ? a : null;
  } catch (e) {
    return null;
  }
}

function describeTouch(t) {
  if (!t) return '';
  const parts = [];
  if (t.utm_source) parts.push('source=' + t.utm_source);
  if (t.utm_medium) parts.push('medium=' + t.utm_medium);
  if (t.utm_campaign) parts.push('campaign=' + t.utm_campaign);
  if (t.utm_content) parts.push('content=' + t.utm_content);
  if (t.fbclid) parts.push('fbclid 있음');
  if (t.gclid) parts.push('gclid 있음');
  if (!parts.length && t.referrer) parts.push('referrer=' + t.referrer);
  if (t.landing) parts.push('landing=' + t.landing);
  return parts.join(' · ');
}

function formatWhen(approvedAt) {
  const d = approvedAt ? new Date(approvedAt) : new Date();
  if (Number.isNaN(d.getTime())) return String(approvedAt);
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function buildPurchaseAlert(row) {
  const amount = Number(row.amount_krw || 0).toLocaleString('ko-KR') + '원';
  const test = row.test_mode ? '(테스트 결제) ' : '';
  const attr = parseAttribution(row.attribution);
  const last = attr && (attr.last || attr.first);
  const first = attr && attr.first;
  const adTag = last && last.utm_content ? ' · ' + last.utm_content : '';
  const subject = `[사주보는 수달] ${test}결제 ${amount} · ${row.order_name || row.product_key}${adTag}`;
  const lastText = describeTouch(last);
  const firstText = describeTouch(first);
  const html = `
    <div style="font-family:sans-serif;line-height:1.7;max-width:600px">
      <h2 style="margin:0 0 12px">${esc(test)}새 결제 · 리포트 생성 시작</h2>
      <p><b>상품</b> ${esc(row.order_name || row.product_key)}<br><b>금액</b> ${esc(amount)}<br><b>결제수단</b> ${esc(row.method || '-')}<br><b>승인 시각</b> ${esc(formatWhen(row.approved_at))}<br><b>주문번호</b> ${esc(row.order_id)}</p>
      <p><b>유입(마지막)</b> ${esc(lastText || '기록 없음')}${firstText && firstText !== lastText ? `<br><b>유입(처음)</b> ${esc(firstText)}` : ''}</p>
      <p>Meta 이벤트 관리자의 구매(Purchase) 수와 이 주문을 대조해 주세요. 결제 내역: <a href="${ADMIN_URL}">${ADMIN_URL}</a></p>
      <p style="color:#777;font-size:12px">고객 입력값(이름·생년월일 등)은 이 메일에 담지 않습니다.</p>
    </div>`;
  return { to: ALERT_TO, subject, html, idempotencyKey: 'purchase-alert-' + row.order_id };
}

function notifyPurchase(row) {
  if (!row || !row.order_id) return;
  try {
    const mail = buildPurchaseAlert(row);
    Promise.resolve(sendEmail(mail))
      .then(() => console.log(`[결제 알림] ${row.order_id} → ${ALERT_TO}`))
      .catch((e) => console.error('[결제 알림] 메일 발송 실패:', e.message));
  } catch (e) {
    console.error('[결제 알림] 메일 준비 실패:', e.message);
  }
}

module.exports = { notifyPurchase, buildPurchaseAlert };
