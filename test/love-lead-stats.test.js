'use strict';
/* 백업 메일 본문의 무료 분석 이메일 집계 — 숫자만 싣고, 집계가 실패해도 백업은 나간다. */
process.env.LOVE_TIMING_ENABLED = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const fx = require('./helpers/account-fixtures');
const tmpDir = fx.makeTempEnv('saju-lead-stats-');
const m = fx.load();
const loveLeads = require('../src/db/loveLeads');
const { backupDbToEmail, leadStatsHtml } = require('../src/jobs/backupDb');
test.after(() => { m.db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

const NOW = new Date('2026-11-17T03:00:00Z');
const KEY_HEX = 'ab'.repeat(32);
const birth = (day) => ({ year: 1995, month: 5, day, hour: 14, minute: 30, gender: '여' });
function seed() {
  m.db.exec('DELETE FROM love_leads');
  const mk = (email, day, marketing, at) => loveLeads.upsert({ email, name: '비밀이름' + day, birth: birth(day), situation: 'single', startYm: '2026-11', top1Ym: '2027-03', marketing }, at);
  const old = new Date(NOW.getTime() - 3 * 86400000);
  const a = mk('secret-a@example.com', 1, true, old).id;
  const b = mk('secret-b@example.com', 2, true, NOW).id;
  const c = mk('secret-c@example.com', 3, false, NOW).id;
  const iso = (ms) => new Date(ms).toISOString();
  m.db.prepare('UPDATE love_leads SET result_mail_sent_at=?, followup1_sent_at=?, unsubscribed_at=? WHERE id=?').run(iso(old.getTime() + 60000), iso(NOW.getTime() - 2 * 86400000), iso(NOW.getTime() - 3600000), a);
  m.db.prepare('UPDATE love_leads SET result_mail_sent_at=?, purchased_at=? WHERE id=?').run(iso(NOW.getTime() - 600000), iso(NOW.getTime() - 300000), b);
  m.db.prepare('UPDATE love_leads SET mail_fail_count=?, top1_alert_sent_at=?, followup3_sent_at=? WHERE id=?').run(loveLeads.MAX_FAILS, iso(NOW.getTime() - 86400000 * 2), iso(NOW.getTime() - 86400000 * 5), c);
}

test('집계는 전체와 최근 24시간 숫자를 각각 센다', () => {
  seed();
  const s = loveLeads.stats(NOW);
  assert.deepEqual(s.saved, { all: 3, day: 2 });
  assert.deepEqual(s.marketing, { all: 2, day: 1 });
  assert.deepEqual(s.result, { all: 2, day: 1 });
  assert.deepEqual(s.d1, { all: 1, day: 0 });
  assert.deepEqual(s.d3, { all: 1, day: 0 });
  assert.deepEqual(s.top1, { all: 1, day: 0 });
  assert.deepEqual(s.unsubscribed, { all: 1, day: 1 });
  assert.deepEqual(s.purchased, { all: 1, day: 1 });
  assert.deepEqual(s.failed, { all: 1, day: 1 });
});

test('백업 메일 본문에 집계 숫자가 있고 이메일·이름·토큰은 없다', async () => {
  seed();
  const tokens = m.db.prepare('SELECT token FROM love_leads').all().map((r) => r.token);
  let sent;
  await backupDbToEmail({
    now: NOW, tempDir: os.tmpdir(), env: { BACKUP_ENCRYPTION_KEY: KEY_HEX },
    backup: async (target) => fs.writeFileSync(target, 'snapshot'), send: async (mail) => { sent = mail; }
  });
  const rows = [...sent.html.matchAll(/<tr><td>([^<]+)<\/td><td align="right">(\d+)<\/td><td align="right">(\d+)<\/td><\/tr>/g)].map((x) => [x[1], Number(x[2]), Number(x[3])]);
  assert.deepEqual(rows, [
    ['저장 행 수(무료 분석 이메일)', 3, 2], ['광고 동의', 2, 1], ['결과 메일 발송', 2, 1],
    ['D+1 메일 발송', 1, 0], ['D+3 메일 발송', 1, 0], ['1위 달 알림 발송', 1, 0],
    ['수신 거부', 1, 1], ['구매 표시', 1, 1], ['발송 실패(재시도 한도 도달)', 1, 1]
  ]);
  assert.match(sent.html, /app\.db AES-256-GCM/);
  assert.equal(/@|example\.com|비밀이름/.test(sent.html), false, '이메일 주소·이름 없음');
  for (const token of tokens) assert.equal(sent.html.includes(token), false);
  assert.equal(sent.attachments.length, 1);
});

test('집계가 실패해도 백업 메일은 나가고 본문에 집계 실패 한 줄만 남는다', async () => {
  let sent;
  await backupDbToEmail({
    leadStats: () => { throw new Error('boom secret-a@example.com'); }, tempDir: os.tmpdir(), env: { BACKUP_ENCRYPTION_KEY: KEY_HEX },
    backup: async (target) => fs.writeFileSync(target, 'snapshot'), send: async (mail) => { sent = mail; }
  });
  assert.match(sent.html, /집계 실패/);
  assert.equal(sent.html.includes('boom'), false);
  assert.equal(sent.html.includes('secret-a'), false);
  assert.match(leadStatsHtml({ leadStats: () => ({}) }), /집계 실패/);
});

test('방침 13조에 새 기능 수집 정보의 동의 시점 적용 문장이 있다', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'privacy.html'), 'utf8');
  assert.match(html, /다만 새 기능에서 처음 수집하는 정보는 그 화면에서 따로 동의를 받고, 동의한 때부터 적용합니다\./);
});
