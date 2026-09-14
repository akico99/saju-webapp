'use strict';
/* SQLite DB(app.db)를 압축해서 관리자 이메일로 보내는 외부 백업 — Render 영구 디스크는
   재배포/재시작 후 파일을 지켜줄 뿐, 디스크 자체가 손상되거나 삭제되는 사고에는
   대비가 안 된다. 회원·포인트·주문 내역이 들어있는 이 파일 하나가 사실상 서비스의
   전부이므로, Render 바깥(관리자 메일함)에도 주기적으로 사본을 남겨둔다.

   db.backup()은 better-sqlite3의 온라인 백업 API — 서비스 중인 DB를 잠그지 않고도
   일관된 스냅샷을 뜬다(WAL 모드에서도 안전). */
const os = require('os');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const db = require('../db/index');
const { sendEmail } = require('../email/resend');

const BACKUP_EMAIL_TO = process.env.BACKUP_EMAIL_TO || 'sooky2001@gmail.com';

async function backupDbToEmail() {
  const tmpPath = path.join(os.tmpdir(), `saju-app-db-backup-${Date.now()}.db`);
  await db.backup(tmpPath);
  const raw = fs.readFileSync(tmpPath);
  fs.unlinkSync(tmpPath);
  const gz = zlib.gzipSync(raw);

  const dateStr = new Date().toISOString().slice(0, 10);
  await sendEmail({
    to: BACKUP_EMAIL_TO,
    subject: `[사주보는 수달] DB 자동 백업 ${dateStr}`,
    html: `<p>app.db 자동 백업입니다.</p><p>원본 ${(raw.length / 1024).toFixed(1)}KB → 압축 ${(gz.length / 1024).toFixed(1)}KB</p>`,
    attachments: [{ filename: `app-db-${dateStr}.db.gz`, content: gz.toString('base64') }]
  });

  return { rawBytes: raw.length, gzBytes: gz.length };
}

module.exports = { backupDbToEmail };
