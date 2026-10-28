'use strict';
/* app.db에는 회원·결제·주문·리포트 입력정보가 있으므로 외부 백업은 항상 암호화한다.
   DB 온라인 백업 후 gzip + AES-256-GCM envelope를 만들고, Resend에는 암호문만 보낸다. */
const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const db = require('../db/index');
const { sendEmail } = require('../email/resend');

const BACKUP_EMAIL_TO = process.env.BACKUP_EMAIL_TO || 'sooky2001@gmail.com';
const ENVELOPE_VERSION = 1;

function parseBackupKey(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte hex or base64 key.');
  }
  const encoded = value.trim();
  let key;
  if (/^[\da-f]{64}$/i.test(encoded)) {
    key = Buffer.from(encoded, 'hex');
  } else if (/^[A-Za-z\d+/]{43}=?$/.test(encoded)) {
    key = Buffer.from(encoded, 'base64');
    if (key.toString('base64').replace(/=+$/, '') !== encoded.replace(/=+$/, '')) key = Buffer.alloc(0);
  } else {
    key = Buffer.alloc(0);
  }
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a 32-byte hex or base64 key.');
  return key;
}

function createBackupEnvelope(compressed, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return {
    version: ENVELOPE_VERSION,
    algorithm: 'aes-256-gcm',
    compression: 'gzip',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptBackupAttachment(content, keyValue) {
  const key = Buffer.isBuffer(keyValue) ? keyValue : parseBackupKey(keyValue);
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be 32 bytes.');
  const envelope = JSON.parse(Buffer.from(content, 'base64').toString('utf8'));
  if (envelope.version !== ENVELOPE_VERSION || envelope.algorithm !== 'aes-256-gcm' || envelope.compression !== 'gzip') {
    throw new Error('Unsupported encrypted backup envelope.');
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  const authTag = Buffer.from(envelope.authTag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  if (iv.length !== 12 || authTag.length !== 16) throw new Error('Invalid encrypted backup envelope.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return zlib.gunzipSync(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}

async function backupDbToEmail(options = {}) {
  const env = options.env || process.env;
  // Key validation precedes even the SQLite snapshot, so a missing key can never fall back to plaintext.
  const key = parseBackupKey(env.BACKUP_ENCRYPTION_KEY);
  const tempDir = options.tempDir || os.tmpdir();
  const backupDir = fs.mkdtempSync(path.join(tempDir, 'saju-db-backup-'));
  const tmpPath = path.join(backupDir, 'app.db');
  const backup = options.backup || ((target) => db.backup(target));
  const send = options.send || sendEmail;

  try {
    await backup(tmpPath);
    const raw = fs.readFileSync(tmpPath);
    const compressed = zlib.gzipSync(raw);
    const envelope = createBackupEnvelope(compressed, key);
    const dateStr = new Date().toISOString().slice(0, 10);
    const content = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
    await send({
      to: options.to || env.BACKUP_EMAIL_TO || BACKUP_EMAIL_TO,
      subject: `[사주보는 수달] DB 암호화 백업 ${dateStr}`,
      html: `<p>app.db AES-256-GCM 암호화 백업입니다.</p><p>원본 ${(raw.length / 1024).toFixed(1)}KB → 암호화 전 압축 ${(compressed.length / 1024).toFixed(1)}KB</p>`,
      attachments: [{ filename: `app-db-${dateStr}.db.enc`, content }]
    });
    return { rawBytes: raw.length, compressedBytes: compressed.length, encrypted: true };
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
}

module.exports = { backupDbToEmail, parseBackupKey, createBackupEnvelope, decryptBackupAttachment };
