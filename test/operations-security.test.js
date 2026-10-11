'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.RESEND_API_KEY = 'test-resend-key';

const originalFetch = global.fetch;
let capturedEmail;
global.fetch = async (url, init) => String(url).startsWith('https://api.resend.com')
  ? (capturedEmail = JSON.parse(init.body), new Response('{"id":"mail_test"}', { status: 200 }))
  : originalFetch(url, init);

const KEY = crypto.randomBytes(32);
const KEY_HEX = KEY.toString('hex');

test.after(() => { global.fetch = originalFetch; });

test('backup is encrypted and decryptable with the configured key', async () => {
  const { backupDbToEmail, decryptBackupAttachment, parseBackupKey } = require('../src/jobs/backupDb');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-backup-test-'));
  const snapshot = Buffer.from('SQLite test snapshot with recognizable private marker');
  let sent;
  try {
    const result = await backupDbToEmail({
      tempDir,
      env: { BACKUP_ENCRYPTION_KEY: KEY_HEX },
      backup: async (target) => fs.writeFileSync(target, snapshot),
      send: async (mail) => { sent = mail; }
    });
    const attachment = (sent || capturedEmail).attachments[0];
    assert.deepEqual(parseBackupKey(KEY.toString('base64')), KEY, 'base64 keys decode to exactly 32 bytes');
    assert.match(attachment.filename, /\.db\.enc$/);
    assert.equal(attachment.content.includes(snapshot.toString('base64')), false);
    assert.deepEqual(decryptBackupAttachment(attachment.content, KEY), snapshot);
    assert.equal(result.encrypted, true);
    assert.deepEqual(fs.readdirSync(tempDir), [], 'snapshot temp file is removed after success');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('missing or malformed backup key prevents email and removes temporary files', async () => {
  const { backupDbToEmail } = require('../src/jobs/backupDb');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-backup-test-'));
  let backupCalls = 0;
  let emailCalls = 0;
  try {
    for (const key of ['', 'not-a-valid-key', Buffer.alloc(31).toString('hex')]) {
      await assert.rejects(backupDbToEmail({
        tempDir,
        env: { BACKUP_ENCRYPTION_KEY: key },
        backup: async () => { backupCalls++; },
        send: async () => { emailCalls++; }
      }), /BACKUP_ENCRYPTION_KEY/);
      assert.deepEqual(fs.readdirSync(tempDir), []);
    }
    assert.equal(backupCalls, 0);
    assert.equal(emailCalls, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('email failure also removes temporary files', async () => {
  const { backupDbToEmail } = require('../src/jobs/backupDb');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-backup-test-'));
  try {
    await assert.rejects(backupDbToEmail({
      tempDir,
      env: { BACKUP_ENCRYPTION_KEY: KEY_HEX },
      backup: async (target) => fs.writeFileSync(target, 'database snapshot'),
      send: async () => { throw new Error('mail unavailable'); }
    }), /mail unavailable/);
    assert.deepEqual(fs.readdirSync(tempDir), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('production refuses insecure session secret and missing or unwritable OUTPUT_DIR', () => {
  const { validateRuntimeConfig } = require('../src/config/validateRuntimeConfig');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-runtime-test-'));
  const filePath = path.join(tempDir, 'not-a-directory');
  fs.writeFileSync(filePath, 'file');
  try {
    assert.doesNotThrow(() => validateRuntimeConfig({
      NODE_ENV: 'production', SESSION_SECRET: crypto.randomBytes(48).toString('base64'), OUTPUT_DIR: tempDir
    }));
    for (const env of [
      { NODE_ENV: 'production', SESSION_SECRET: 'dev-only-insecure-secret-change-me', OUTPUT_DIR: tempDir },
      { NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(48) },
      { NODE_ENV: 'production', SESSION_SECRET: crypto.randomBytes(48).toString('base64'), OUTPUT_DIR: '.' },
      { NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(48), OUTPUT_DIR: filePath }
    ]) {
      assert.throws(() => validateRuntimeConfig(env), (error) => {
        assert.match(error.message, /SESSION_SECRET|OUTPUT_DIR/);
        assert.equal(error.message.includes('s'.repeat(48)), false, 'secret value is not included in diagnostics');
        return true;
      });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('development defaults remain available', () => {
  const { validateRuntimeConfig } = require('../src/config/validateRuntimeConfig');
  assert.doesNotThrow(() => validateRuntimeConfig({ NODE_ENV: 'development' }));
});

test('server validates production configuration before loading or listening to the app', () => {
  const repo = path.join(__dirname, '..');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saju-startup-test-'));
  const outputDir = path.join(tempDir, 'output');
  fs.mkdirSync(outputDir);
  const secret = 'short-production-secret';
  try {
    const child = spawnSync(process.execPath, ['server.js'], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SESSION_SECRET: secret,
        OUTPUT_DIR: outputDir,
        SAJU_DB_PATH: path.join(tempDir, 'app.db'),
        RESEND_API_KEY: ''
      }
    });
    const output = (child.stdout || '') + (child.stderr || '');
    assert.equal(child.status, 1, output || child.error);
    assert.match(output, /SESSION_SECRET/);
    assert.equal(output.includes(secret), false);
    assert.doesNotMatch(output, /서버 실행 중/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
