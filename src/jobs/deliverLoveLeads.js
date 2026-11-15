'use strict';
/* 연애 무료 분석 이메일 발송 — server.js가 10분마다 부른다(결과 메일은 저장 직후에도 한 번 시도한다).
   - 결과 메일: 저장되면 바로 대상이다(거래 정보).
   - 판매 메일(광고): 동의했고 수신 거부·구매 전인 행에만, 한국 시간 10:00~20:00 사이에만 보낸다. 한 번에 한 행에 한 통,
     같은 행의 광고 메일은 20시간 이상 띄운다. D+1은 D+3 전까지, D+3은 입력 3일 뒤부터, 1위 달 알림은 그 달 1일 10시 이후 그달 안에
     (입력 시점 이후에 시작되는 달일 때) 한 번만 보낸다.
   - 키가 없고 보내는 함수도 주지 않으면 아무것도 보내지 않고 기록도 늘리지 않는다(실제 발송 없음).
   - 이메일·토큰은 로그에 쓰지 않는다. 건수와 행 번호만 남긴다. */
const loveLeads = require('../db/loveLeads');
const { buildLovePreview } = require('../engine/loveTiming');
const { buildLeadMail } = require('../email/loveLead');

const H = 3600000;
const DAY = 24 * H;
const MIN_AD_GAP_MS = 20 * H;

const kstHour = (now) => new Date(now.getTime() + 9 * H).getUTCHours();
// 판매 메일은 한국 시간 10:00 이상 20:00 미만에만 보낸다.
const inMarketingWindow = (now) => { const h = kstHour(now); return h >= 10 && h < 20; };

function nextMonthStartMs(ym) {
  const [y, m] = ym.split('-').map(Number);
  return loveLeads.monthStartMs(m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0'));
}

// 이 행에 지금 보낼 판매 메일 종류(없으면 null). 시간 창·중복 간격은 호출 쪽에서 본다.
function dueMarketingKind(row, now) {
  if (!row.agree_marketing_at || row.unsubscribed_at || row.purchased_at) return null;
  const t = now.getTime();
  const anchor = Date.parse(row.agree_privacy_at);
  const sent = [row.followup1_sent_at, row.followup3_sent_at, row.top1_alert_sent_at].filter(Boolean).map(Date.parse);
  if (sent.length && t - Math.max(...sent) < MIN_AD_GAP_MS) return null;
  if (!row.top1_alert_sent_at && row.top1_ym) {
    const start = loveLeads.monthStartMs(row.top1_ym);
    if (start != null && start + 10 * H >= anchor && t >= start + 10 * H && t < nextMonthStartMs(row.top1_ym)) return 'top1';
  }
  if (!row.followup3_sent_at && t >= anchor + 3 * DAY) return 'd3';
  if (!row.followup1_sent_at && !row.followup3_sent_at && t >= anchor + DAY && t < anchor + 3 * DAY) return 'd1';
  return null;
}

function readingFor(row) {
  const birth = JSON.parse(row.birth_json);
  return buildLovePreview(birth, row.situation, new Date(row.agree_privacy_at));
}

/* 한 행에 한 종류를 보낸다. 성공하면 true. claim으로 같은 행의 동시 발송을 막고, 광고 메일은 보내기 직전에 다시 읽어 수신 거부를 확인한다. */
async function sendLeadMail(id, kind, { now = new Date(), send } = {}) {
  if (!loveLeads.claim(id, now)) return false;
  try {
    const row = loveLeads.get(id);
    if (!row || row.delete_after <= now.toISOString()) { loveLeads.release(id); return false; }
    if (kind !== 'result' && dueMarketingKind(row, now) !== kind) { loveLeads.release(id); return false; }
    if (kind === 'result' && row.result_mail_sent_at) { loveLeads.release(id); return false; }
    const needReading = kind === 'result' || kind === 'd1' || kind === 'd3';
    const mail = buildLeadMail(kind, { row, reading: needReading ? readingFor(row) : null });
    await send({ to: row.email, subject: mail.subject, html: mail.html, idempotencyKey: 'love-lead-' + row.id + '-' + kind + '-' + row.agree_privacy_at });
    loveLeads.markSent(id, kind, now);
    return true;
  } catch (_) {
    // 메일 제공자 오류에는 주소가 들어 있을 수 있어 원문을 남기지 않는다.
    loveLeads.markFailed(id);
    console.error('[연애 메일] 발송 실패 id=' + id + ' kind=' + kind);
    return false;
  }
}

function resolveSend(send) {
  if (send) return send;
  if (!process.env.RESEND_API_KEY) return null;
  return require('../email/resend').sendEmail;
}

let running = false;
async function deliverLoveLeadMails({ now = new Date(), send } = {}) {
  const out = { sent: { result: 0, d1: 0, d3: 0, top1: 0 }, failed: 0, purchased: 0, skipped: null };
  const sender = resolveSend(send);
  if (!sender) { out.skipped = 'no_key'; return out; }
  if (running) { out.skipped = 'running'; return out; }
  running = true;
  try {
    out.purchased = loveLeads.sweepPurchases(now);
    for (const row of loveLeads.mailCandidates(now)) {
      let kind = null;
      if (!row.result_mail_sent_at && !row.result_mail_skip) kind = 'result';
      else if (inMarketingWindow(now)) kind = dueMarketingKind(row, now);
      if (!kind) continue;
      if (await sendLeadMail(row.id, kind, { now, send: sender })) out.sent[kind]++; else out.failed++;
    }
    const total = out.sent.result + out.sent.d1 + out.sent.d3 + out.sent.top1;
    if (total || out.failed) console.log('[연애 메일] 발송 ' + total + '건, 실패 ' + out.failed + '건');
  } finally { running = false; }
  return out;
}

// 저장 직후 결과 메일을 바로 한 번 시도한다. 실패하면 10분 작업이 이어서 보낸다.
async function sendResultNow(id, { now = new Date(), send } = {}) {
  const sender = resolveSend(send);
  if (!sender) return false;
  return sendLeadMail(id, 'result', { now, send: sender });
}

module.exports = { deliverLoveLeadMails, sendResultNow, sendLeadMail, dueMarketingKind, inMarketingWindow, kstHour };
