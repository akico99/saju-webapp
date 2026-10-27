'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const readPage = (name) => fs.readFileSync(path.join(ROOT, 'public', name), 'utf8');

test('reset password page loads no analytics or advertising scripts and has a no-referrer policy', () => {
  const html = readPage('reset-password.html');
  const policy = html.match(/<meta\s+[^>]*name=["']referrer["'][^>]*>/i);
  assert.ok(policy, 'a referrer policy must be declared');
  assert.match(policy[0], /content=["']no-referrer["']/i);
  assert.doesNotMatch(html, /googletagmanager|google-analytics|doubleclick|\/track\.js/i);
});

test('pay success copies required parameters and removes query before loading analytics', () => {
  const html = readPage('pay-success.html');
  assert.match(html, /<meta\s+[^>]*name=["']referrer["'][^>]*content=["']no-referrer["']/i);
  const snapshot = html.indexOf('paymentKey: params.get');
  const scrub = html.indexOf('history.replaceState');
  const analytics = html.indexOf('googletagmanager');
  assert.ok(snapshot >= 0, 'required confirmation values must be copied in the first inline script');
  assert.ok(scrub > snapshot && scrub < analytics, 'the query must be removed before analytics loads');
  assert.match(html, /pathname\s*\+\s*location\.hash/);
  assert.match(html, /JSON\.stringify\(\{\s*paymentKey,\s*orderId,\s*amount\s*\}\)/);
  assert.match(html, /const \{ paymentKey, orderId, amount \} = confirmationParams/);
  assert.match(html, /confirmationParams\.done/);
});

test('admin users and orders do not interpolate API values into HTML', () => {
  const injection = '<img src=x onerror=alert(1)>';
  function node(tag) {
    return {
      tag, children: [], attributes: {}, className: '', textContent: '',
      appendChild(child) { this.children.push(child); return child; },
      append(child) { this.children.push(child); },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      set innerHTML(value) { if (value) throw new Error('row renderer must not parse HTML strings'); }
    };
  }
  const document = { createElement: node, createTextNode: (value) => ({ tag: '#text', textContent: String(value) }) };
  const textOf = (root) => [root.textContent || '', ...(root.children || []).flatMap(textOf)].join('');
  const tagsOf = (root) => [root.tag, ...(root.children || []).flatMap(tagsOf)];

  const usersHtml = readPage('admin-users.html');
  assert.doesNotMatch(usersHtml, /\.innerHTML\s*=\s*`[\s\S]*?\$\{(?:u|o|s)\./);
  const userRowSource = usersHtml.match(/function row\(u\) \{[\s\S]*?\n  \}/)[0];
  const userRow = vm.runInNewContext(`
    const PROVIDER_LABEL = { local: '이메일', naver: '네이버', google: '구글', kakao: '카카오' };
    const STATUS_CONFIG = { active: { label: '활성', className: 'active', actionLabel: '정지', actionClass: 'reject-btn' }, suspended: { label: '정지됨', className: 'suspended', actionLabel: '정지 해제', actionClass: 'approve-btn' } };
    ${userRowSource}
    row({ id: 4, name: ${JSON.stringify(injection)}, email: 'user&quot;@example.com', createdAt: '2026-10-11', provider: '" onmouseover="x', status: 'bad status\" onclick=alert(1)' });
  `, { document });
  assert.match(textOf(userRow), new RegExp(injection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(tagsOf(userRow).includes('img'), false);
  const userBadge = userRow.children[3].children[0];
  assert.equal(userBadge.className, 'status-badge');
  assert.equal(userBadge.textContent, '알 수 없음');

  const ordersHtml = readPage('admin-orders.html');
  assert.doesNotMatch(ordersHtml, /\.innerHTML\s*=\s*`[\s\S]*?\$\{(?:u|o|s)\./);
  const orderRowSource = ordersHtml.match(/function row\(o\) \{[\s\S]*?\n  \}/)[0];
  const orderRow = vm.runInNewContext(`
    const FX_KRW_PER_USD = 1400;
    const fmtUsd = (v) => v == null ? '-' : '$' + v.toFixed(3);
    const fmtKrw = (v) => v == null ? '-' : Math.round(v).toLocaleString('ko-KR') + '원';
    const fmtBytes = (v) => v == null ? '' : String(v);
    ${ordersHtml.match(/function addText\([\s\S]*?\n  \}/)[0]}
    ${orderRowSource}
    row({ id: 5, createdAt: '2026-10-11T12:00:00Z', label: ${JSON.stringify(injection)}, productKey: 'p', userEmail: '"<svg onload=x>', priceKrw: 1000, llmCostUsd: 0.1, fileExists: true, fileSizeBytes: 20, jobId: '" onclick="x' });
  `, { document });
  assert.ok(textOf(orderRow).includes(injection));
  assert.equal(tagsOf(orderRow).includes('img'), false);
});

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-browser-security-'));
process.env.SAJU_DB_PATH = path.join(tmpDir, 'test.db');
const express = require('express');
const session = require('express-session');
const db = require('../src/db/index');
let server;
let baseUrl;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
  app.use('/api', require('../src/server/routes/auth'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('signup rejects overlong or malformed email but accepts valid internationalized names', async () => {
  let seq = 0;
  const signup = async (email, name) => {
    seq += 1;
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, name, password: 'password123', year: 1990, month: 1, day: 15, gender: '여', agreeTerms: true, agreePrivacy: true, agreeAge: true })
    });
    return { status: res.status, data: await res.json() };
  };
  const malformed = await signup('bad@@example.com', '홍길동');
  assert.equal(malformed.status, 400);
  const overlong = await signup(`${'a'.repeat(245)}@example.com`, '홍길동');
  assert.equal(overlong.status, 400);
  const valid = await signup('  intl-user@example.com  ', '李 小龍 🐉');
  assert.equal(valid.status, 200);
  const users = require('../src/db/users');
  assert.equal(users.findByEmail('intl-user@example.com').name, '李 小龍 🐉');
});
