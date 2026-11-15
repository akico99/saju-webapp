'use strict';
/* 연애 무료 분석 이메일 — 서버 계약: 검증·저장·다시 보기·수신 거부·발송 시간·구매자 중단·삭제·메일 본문. 메모리 성격의 임시 DB, 시간 주입. */
process.env.LOVE_TIMING_ENABLED = 'true';
delete process.env.RESEND_API_KEY;
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const fx = require('./helpers/account-fixtures');
const tmpDir = fx.makeTempEnv('saju-love-lead-');
const m = fx.load();
const loveLeads = require('../src/db/loveLeads');
const delivery = require('../src/db/reportDelivery');
const { deliverLoveLeadMails, dueMarketingKind, inMarketingWindow } = require('../src/jobs/deliverLoveLeads');
const { runPrivacyMaintenance } = require('../src/jobs/privacyMaintenance');
const nativeFetch = global.fetch;

let clock = new Date('2026-11-16T03:00:00Z'); // 한국 시간 2026-11-16 12:00
let server; let base;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.locals.loveNow = () => clock;
  app.locals.loveMailInline = false; // 저장 직후 즉시 발송을 끈다 — 발송은 deliverLoveLeadMails로만 확인한다.
  app.use(require('../src/server/routes/loveUnsubscribe'));
  app.use('/api', require('../src/server/routes/love'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => {
  await new Promise((r) => server.close(r));
  m.db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
test.beforeEach(() => { m.db.exec('DELETE FROM love_leads'); clock = new Date('2026-11-16T03:00:00Z'); });

const form = { situation: 'single', name: '수달', gender: '여', year: '1995', month: '5', day: '15', calendar: '양력', hour: '14', minute: '30', hourUnknown: false };
const lead = (extra) => ({ ...form, leadFlow: 2, leadEmail: 'Otter@Example.com', agreeLeadPrivacy: true, agreeMarketing: false, ...extra });
async function post(url, body) {
  const r = await nativeFetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null), raw: null };
}
async function get(url) {
  const r = await nativeFetch(base + url);
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (_) { /* html */ }
  return { status: r.status, body: json, text };
}
const rows = () => m.db.prepare('SELECT * FROM love_leads ORDER BY id').all();
const kst = (s) => new Date(s + '+09:00');

function sender() {
  const sent = [];
  const send = async (mail) => { sent.push(mail); return { id: 'test-' + sent.length }; };
  return { sent, send };
}

test('필수 동의가 없거나 이메일이 잘못되면 400과 한국어 안내를 주고 저장하지 않는다', async () => {
  for (const bad of [{ agreeLeadPrivacy: false }, { agreeLeadPrivacy: 'true' }, { agreeLeadPrivacy: undefined }]) {
    const r = await post('/api/love/preview', lead(bad));
    assert.equal(r.status, 400);
    assert.match(r.body.error, /동의/);
  }
  for (const email of ['', 'no-at-sign', 'a@b', 'a b@c.com', 'x@y.z<script>', 123, null, 'a'.repeat(250) + '@x.com']) {
    const r = await post('/api/love/preview', lead({ leadEmail: email }));
    assert.equal(r.status, 400, String(email));
    assert.match(r.body.error, /이메일/);
  }
  assert.equal(rows().length, 0);
});

test('구버전 요청(leadFlow 없음)은 예전과 같은 응답이고 아무것도 저장하지 않는다', async () => {
  const r = await post('/api/love/preview', form);
  assert.equal(r.status, 200);
  assert.ok(r.body.reading && r.body.reading.chart);
  assert.equal('lead' in r.body, false);
  // leadFlow가 2가 아니면 이메일이 와도 무시한다
  const r1 = await post('/api/love/preview', { ...form, leadFlow: 1, leadEmail: 'a@b.com' });
  assert.equal(r1.status, 200);
  assert.equal('lead' in r1.body, false);
  assert.equal(rows().length, 0);
});

test('leadFlow 2 정상 요청은 저장하고 결과 메일을 큐에 넣으며 응답에 토큰·1위 달을 싣지 않는다', async () => {
  const r = await post('/api/love/preview', lead({ agreeMarketing: true }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.lead, { saved: true, emailQueued: true });
  assert.ok(r.body.reading.chart && r.body.reading.third);
  const [row] = rows();
  assert.equal(row.email, 'otter@example.com');
  assert.ok(row.token.length >= 32);
  assert.match(row.top1_ym, /^\d{4}-\d{2}$/);
  assert.ok(row.agree_marketing_at);
  assert.equal(row.result_mail_sent_at, null);
  const json = JSON.stringify(r.body);
  assert.equal(json.includes(row.token), false);
  assert.equal(json.includes(row.top1_ym), false);
  assert.equal(json.includes('otter@'), false);
  // 삭제 기한: 마케팅 동의자는 1위 달 1일 + 30일(최대 13개월), 아니면 30일
  const top1End = loveLeads.monthStartMs(row.top1_ym) + 30 * 86400000;
  const expected = Math.max(clock.getTime() + 30 * 86400000, top1End);
  assert.equal(Date.parse(row.delete_after), Math.min(expected, Date.parse('2027-12-16T03:00:00Z')));
});

test('같은 이메일과 같은 입력은 새 행 대신 갱신하고, 다른 입력은 새 행이다', async () => {
  await post('/api/love/preview', lead());
  const r2 = await post('/api/love/preview', lead({ leadEmail: ' otter@example.com ', name: '새이름', agreeMarketing: true }));
  assert.deepEqual(r2.body.lead, { saved: true, emailQueued: true });
  assert.equal(rows().length, 1);
  assert.equal(rows()[0].name, '새이름');
  assert.ok(rows()[0].agree_marketing_at);
  await post('/api/love/preview', lead({ day: '16' }));
  assert.equal(rows().length, 2);
  assert.notEqual(rows()[0].token, rows()[1].token);
});

test('광고 동의를 다시 내서 해제하면 철회로 기록한다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  await post('/api/love/preview', lead({ agreeMarketing: false }));
  assert.equal(rows()[0].agree_marketing_at, null);
});

test('같은 이메일로 하루 4번째 새 입력은 결과 메일·광고 동의 없이 행만 남긴다', async () => {
  for (const day of ['10', '11', '12']) assert.equal((await post('/api/love/preview', lead({ day }))).body.lead.emailQueued, true);
  const r = await post('/api/love/preview', lead({ day: '13', agreeMarketing: true }));
  assert.deepEqual(r.body.lead, { saved: true, emailQueued: false });
  assert.equal(rows()[3].agree_marketing_at, null);
  assert.equal(r.status, 200);
});

test('토큰으로 같은 무료 결과(사주표 포함)를 다시 받는다. 없는·잘못된·지난 토큰은 404다', async () => {
  const first = await post('/api/love/preview', lead());
  const { token } = rows()[0];
  const again = await get('/api/love/lead/' + token);
  assert.equal(again.status, 200);
  assert.deepEqual(again.body.reading, first.body.reading);
  assert.equal(again.body.lead.input.year, 1995);
  assert.equal(again.body.lead.input.calendar, '양력');
  assert.equal(again.body.lead.input.situation, 'single');
  for (const bad of ['nope', 'x'.repeat(40), '..%2F..%2Fetc', token.slice(0, 10)]) assert.equal((await get('/api/love/lead/' + bad)).status, 404, bad);
  clock = new Date('2026-12-17T03:00:00Z'); // 30일 지남
  assert.equal((await get('/api/love/lead/' + token)).status, 404);
  m.db.exec('DELETE FROM love_leads');
  clock = new Date('2026-11-16T03:00:00Z');
  assert.equal((await get('/api/love/lead/' + token)).status, 404, '삭제된 토큰');
});

test('수신 거부 링크는 바로 처리하고 확인 화면을 보여 주며 같은 이메일의 모든 행에 적용한다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  await post('/api/love/preview', lead({ day: '20', agreeMarketing: true }));
  const [a] = rows();
  const r = await get('/unsubscribe?t=' + a.token);
  assert.equal(r.status, 200);
  assert.match(r.text, /수신 거부/);
  assert.equal(r.text.includes(a.token), false);
  for (const row of rows()) {
    assert.ok(row.unsubscribed_at);
    assert.ok(Date.parse(row.delete_after) <= clock.getTime() + 30 * 86400000);
  }
  assert.equal((await get('/unsubscribe?t=zzzz')).status, 404);
  assert.equal((await get('/unsubscribe')).status, 404);
  assert.equal((await get('/api/love/unsubscribe?t=' + a.token)).status, 200);
});

test('수신 거부한 사람에게는 광고 메일이 가지 않는다(결과 메일은 거래 정보라 간다)', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  await get('/unsubscribe?t=' + rows()[0].token);
  const s = sender();
  await deliverLoveLeadMails({ now: clock, send: s.send });
  assert.deepEqual(s.sent.map((x) => x.subject.startsWith('(광고)')), [false]);
  clock = new Date('2026-11-18T02:00:00Z');
  await deliverLoveLeadMails({ now: clock, send: s.send });
  await deliverLoveLeadMails({ now: new Date('2026-11-19T04:00:00Z'), send: s.send });
  assert.equal(s.sent.length, 1);
});

test('결과 메일은 광고가 아니고 1위 달의 정확한 연·월 없이 3위 달과 다시 보기 링크를 담는다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  const row = rows()[0];
  const s = sender();
  const out = await deliverLoveLeadMails({ now: clock, send: s.send });
  assert.equal(out.sent.result, 1);
  const mail = s.sent[0];
  assert.equal(mail.to, 'otter@example.com');
  assert.equal(mail.subject, '수달님의 무료 연애 사주 분석');
  assert.ok(!mail.subject.includes('(광고)'));
  assert.ok(mail.html.includes('/love.html?lead=' + row.token));
  assert.doesNotMatch(mail.html, /utm_/);
  const [y, mo] = row.top1_ym.split('-').map(Number);
  assert.equal(mail.html.includes(y + '년 ' + mo + '월'), false, '1위 달 연·월 노출 금지');
  assert.equal(mail.html.includes(row.top1_ym), false);
  assert.match(mail.html, /앞으로 (3개월 안|6개월 안|7~12개월 사이)/);
  assert.match(mail.html, /\d{4}년 \d{1,2}월/, '3위 달 라벨');
  // 한 번만 보낸다
  await deliverLoveLeadMails({ now: new Date(clock.getTime() + 600000), send: s.send });
  assert.equal(s.sent.length, 1);
  assert.ok(rows()[0].result_mail_sent_at);
});

test('판매 메일은 한국 시간 10:00~20:00에만 나가고 (광고)·보낸 곳·연락처·수신 거부 링크를 단다', async () => {
  assert.equal(inMarketingWindow(new Date('2026-11-17T00:59:00Z')), false); // 09:59
  assert.equal(inMarketingWindow(new Date('2026-11-17T01:00:00Z')), true); // 10:00
  assert.equal(inMarketingWindow(new Date('2026-11-17T10:59:00Z')), true); // 19:59
  assert.equal(inMarketingWindow(new Date('2026-11-17T11:00:00Z')), false); // 20:00
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  const row = rows()[0];
  const s = sender();
  await deliverLoveLeadMails({ now: clock, send: s.send }); // 결과 메일
  // D+1이 됐지만 한국 시간 새벽 2시 — 보내지 않는다
  const night = await deliverLoveLeadMails({ now: new Date('2026-11-17T17:00:00Z'), send: s.send });
  assert.equal(night.sent.d1, 0);
  assert.equal(s.sent.length, 1);
  // 같은 날 낮
  const day = await deliverLoveLeadMails({ now: new Date('2026-11-18T02:00:00Z'), send: s.send });
  assert.equal(day.sent.d1, 1);
  const d1 = s.sent[1];
  assert.ok(d1.subject.startsWith('(광고) 수달님, 가장 강한 달은 '));
  assert.match(d1.html, /사주보는 수달/);
  assert.match(d1.html, /sooky2001@gmail\.com/);
  assert.ok(d1.html.includes('/unsubscribe?t=' + row.token));
  assert.ok(d1.html.includes('utm_source=email&amp;utm_campaign=love_followup&amp;utm_content=d1'));
  assert.match(d1.html, /광고성 정보 수신에 동의/);
  const [y, mo] = row.top1_ym.split('-').map(Number);
  assert.equal(d1.html.includes(y + '년 ' + mo + '월'), false);
  // D+3
  const d3 = await deliverLoveLeadMails({ now: new Date('2026-11-19T04:00:00Z'), send: s.send });
  assert.equal(d3.sent.d3, 1);
  assert.ok(s.sent[2].subject.startsWith('(광고) '));
  assert.ok(s.sent[2].html.includes('utm_content=d3'));
  // 다시 돌려도 중복 없음
  await deliverLoveLeadMails({ now: new Date('2026-11-20T04:00:00Z'), send: s.send });
  assert.equal(s.sent.length, 3);
});

test('1위 달 알림은 그달 1일 10시 이후 한 번만, 이번 달로 표현하고 정확한 연·월은 쓰지 않는다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  m.db.prepare("UPDATE love_leads SET top1_ym='2027-02', result_mail_sent_at=?, followup1_sent_at=?, followup3_sent_at=?").run('2026-11-16T03:01:00Z', '2026-11-17T04:00:00Z', '2026-11-19T04:00:00Z');
  const s = sender();
  const early = await deliverLoveLeadMails({ now: kst('2027-02-01T09:30:00'), send: s.send });
  assert.equal(early.sent.top1, 0);
  const onTime = await deliverLoveLeadMails({ now: kst('2027-02-01T10:30:00'), send: s.send });
  assert.equal(onTime.sent.top1, 1);
  const mail = s.sent[0];
  assert.ok(mail.subject.startsWith('(광고) 지금이 수달님의 인연 신호가 가장 강한 달이에요'));
  assert.match(mail.html, /이번 달/);
  assert.equal(/2027년 2월|2027-02/.test(mail.html), false);
  assert.ok(mail.html.includes('utm_content=top1'));
  await deliverLoveLeadMails({ now: kst('2027-02-02T11:00:00'), send: s.send });
  assert.equal(s.sent.length, 1);
});

test('1위 달이 입력 전에 시작된 달이거나 이미 지난 달이면 알림을 보내지 않는다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  const row = rows()[0];
  m.db.prepare("UPDATE love_leads SET top1_ym='2026-11'").run(); // 입력(11월 16일)보다 앞선 1일
  assert.notEqual(dueMarketingKind(m.db.prepare('SELECT * FROM love_leads').get(), kst('2026-11-20T11:00:00')), 'top1');
  m.db.prepare("UPDATE love_leads SET top1_ym='2027-01'").run();
  assert.notEqual(dueMarketingKind({ ...row, top1_ym: '2027-01' }, kst('2027-02-03T11:00:00')), 'top1', '그달이 끝난 뒤에는 보내지 않는다');
  assert.equal(dueMarketingKind({ ...row, top1_ym: '2027-01' }, kst('2027-01-05T11:00:00')), 'top1', '그달 안에는 보낸다');
});

test('같은 이메일로 연애 시기 리포트를 구매한 사람에게는 판매 메일이 멈춘다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  await post('/api/love/preview', lead({ leadEmail: 'buyer@example.com', day: '9', agreeMarketing: true }));
  const user = m.users.createUser({ email: 'login@example.com', passwordHash: 'x', name: '회원' });
  m.db.prepare("INSERT INTO orders (user_id, product_key, job_id, status) VALUES (?, 'love_timing', 'job-lead-test', 'done')").run(user.id);
  delivery.create('job-lead-test', 'Buyer@Example.com'); // PDF 수신 이메일(대소문자 달라도 대조)
  const s = sender();
  await deliverLoveLeadMails({ now: clock, send: s.send });
  const buyerRow = rows().find((r) => r.email === 'buyer@example.com');
  assert.ok(buyerRow.purchased_at, '구매자로 표시');
  assert.equal(rows().find((r) => r.email === 'otter@example.com').purchased_at, null);
  await deliverLoveLeadMails({ now: new Date('2026-11-18T02:00:00Z'), send: s.send });
  const toBuyer = s.sent.filter((x) => x.to === 'buyer@example.com');
  assert.equal(toBuyer.length, 1, '결과 메일만');
  assert.equal(s.sent.filter((x) => x.to === 'otter@example.com').length, 2, '구매하지 않은 사람은 결과 메일과 D+1');
});

test('결제가 시작되면(startLove) 같은 이메일의 행이 바로 구매자로 표시된다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  assert.equal(loveLeads.markPurchasedByEmail('OTTER@example.com '), 1);
  assert.ok(rows()[0].purchased_at);
  assert.equal(dueMarketingKind(rows()[0], new Date('2026-11-18T02:00:00Z')), null);
});

test('회원 계정 이메일이나 승인된 카드 결제 폼의 이메일로도 구매자를 찾는다', async () => {
  await post('/api/love/preview', lead({ leadEmail: 'acct@example.com', agreeMarketing: true }));
  await post('/api/love/preview', lead({ leadEmail: 'card@example.com', day: '8', agreeMarketing: true }));
  const user = m.users.createUser({ email: 'acct@example.com', passwordHash: 'x', name: '회원' });
  m.db.prepare("INSERT INTO orders (user_id, product_key, job_id, status) VALUES (?, 'love_timing', 'job-acct', 'done')").run(user.id);
  m.db.prepare("INSERT INTO card_payments (user_id, order_id, order_name, amount_krw, status, product_key, form_json) VALUES (?, 'ord-card-1', 'x', 14900, 'paid', 'love_timing', ?)").run(user.id, JSON.stringify({ deliveryEmail: 'Card@example.com' }));
  assert.equal(loveLeads.sweepPurchases(clock), 2);
});

test('키도 보내는 함수도 없으면 아무것도 보내지 않고 기록하지 않는다', async () => {
  await post('/api/love/preview', lead());
  const out = await deliverLoveLeadMails({ now: clock });
  assert.equal(out.skipped, 'no_key');
  assert.equal(rows()[0].result_mail_sent_at, null);
  assert.equal(rows()[0].mail_fail_count, 0);
});

test('발송이 실패하면 보냄으로 기록하지 않고 로그에 이메일·토큰을 남기지 않는다', async () => {
  await post('/api/love/preview', lead({ agreeMarketing: true }));
  const row = rows()[0];
  const logs = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => logs.push(a.join(' '));
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const out = await deliverLoveLeadMails({ now: clock, send: async () => { throw new Error('provider said otter@example.com ' + row.token); } });
    assert.equal(out.failed, 1);
  } finally { console.log = orig.log; console.error = orig.error; }
  assert.equal(rows()[0].result_mail_sent_at, null);
  assert.equal(rows()[0].mail_fail_count, 1);
  assert.ok(logs.length > 0);
  for (const line of logs) {
    assert.equal(/otter@|example\.com/i.test(line) || line.includes(row.token), false, line);
  }
  // 다음 작업에서 다시 보낸다
  const s = sender();
  await deliverLoveLeadMails({ now: new Date(clock.getTime() + 600000), send: s.send });
  assert.equal(s.sent.length, 1);
});

test('보관 기한이 지난 행은 개인정보 점검에서 삭제한다(광고 동의자는 기한까지 남는다)', async () => {
  await post('/api/love/preview', lead({ leadEmail: 'plain@example.com' }));
  await post('/api/love/preview', lead({ leadEmail: 'ad@example.com', agreeMarketing: true }));
  const plain = rows().find((r) => r.email === 'plain@example.com');
  const ad = rows().find((r) => r.email === 'ad@example.com');
  assert.equal(Date.parse(plain.delete_after), clock.getTime() + 30 * 86400000);
  assert.equal(runPrivacyMaintenance(new Date(clock.getTime() + 29 * 86400000)).loveLeads, 0);
  const out = runPrivacyMaintenance(new Date(clock.getTime() + 30 * 86400000 + 1000));
  assert.ok(out.loveLeads >= 1);
  assert.equal(rows().some((r) => r.email === 'plain@example.com'), false);
  assert.equal(rows().some((r) => r.email === 'ad@example.com'), Date.parse(ad.delete_after) > clock.getTime() + 30 * 86400000 + 1000);
  runPrivacyMaintenance(new Date(Date.parse(ad.delete_after) + 1000));
  assert.equal(rows().length, 0);
});

test('광고 동의자의 보관은 최초 저장 뒤 13개월을 넘지 않는다', () => {
  const now = new Date('2026-11-16T03:00:00Z');
  const r = loveLeads.upsert({ email: 'cap@example.com', name: '', birth: { year: 1990, month: 1, day: 1, hour: null, minute: 0, gender: '여' }, situation: 'single', startYm: '2026-12', top1Ym: '2030-01', marketing: true }, now);
  assert.equal(Date.parse(rows().find((x) => x.id === r.id).delete_after), Date.parse('2027-12-16T03:00:00Z'));
});

test('개인정보처리방침이 2026년 11월 16일 개정과 광고성 정보 수신·수신 거부 방법을 안내한다', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
  assert.match(html, /2026년 11월 16일 개정·시행: 무료 분석 이메일 수집과 광고성 정보 수신\(선택\) 추가/);
  assert.match(html, /무료 연애 분석 이메일/);
  assert.match(html, /광고성 정보 수신 \(선택\)/);
  assert.match(html, /수신 거부/);
  assert.match(html, /13개월/);
});

test('server.js가 10분마다 이메일 발송 작업을 등록한다', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /deliverLoveLeadMails/);
  assert.match(server, /setInterval\(deliverLoveLeads, 10 \* 60 \* 1000\)/);
});
