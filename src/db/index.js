'use strict';
/* 최소 DB — SQLite(better-sqlite3, 동기 API). 파일 하나(data/app.db)로 운영한다.
   사용자, 포인트 신청(수동 승인), 포인트 거래 내역 세 테이블만 둔다. */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'app.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    point_balance INTEGER NOT NULL DEFAULT 0,
    gender TEXT,
    birth_year INTEGER,
    birth_month INTEGER,
    birth_day INTEGER,
    birth_hour INTEGER,
    birth_minute INTEGER,
    is_lunar INTEGER NOT NULL DEFAULT 0,
    is_leap INTEGER NOT NULL DEFAULT 0,
    city TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS point_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    amount_krw INTEGER NOT NULL,
    points INTEGER NOT NULL,
    depositor_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS point_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_type TEXT,
    ref_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    product_key TEXT NOT NULL,
    label TEXT,
    job_id TEXT NOT NULL UNIQUE,
    result_path TEXT,
    card_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS saved_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    label TEXT NOT NULL,
    name TEXT,
    gender TEXT,
    birth_year INTEGER NOT NULL,
    birth_month INTEGER NOT NULL,
    birth_day INTEGER NOT NULL,
    birth_hour INTEGER,
    birth_minute INTEGER,
    is_lunar INTEGER NOT NULL DEFAULT 0,
    is_leap INTEGER NOT NULL DEFAULT 0,
    city TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
/* 세션 테이블(sessions)은 better-sqlite3-session-store가 자체 스키마로 직접 생성한다
   (sid/sess/expire) — 여기서 미리 만들지 않는다(컬럼 충돌 방지). */

/* 소셜 로그인 컬럼 — 기존 users 테이블(이메일 가입자 데이터 포함)에 추가하는 마이그레이션.
   ADD COLUMN은 "이미 있으면 에러"라 컬럼 존재 여부를 먼저 확인하고 없을 때만 실행한다. */
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('provider')) {
  db.exec("ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'local'");
}
if (!userColumns.includes('provider_id')) {
  db.exec('ALTER TABLE users ADD COLUMN provider_id TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id) WHERE provider_id IS NOT NULL');

/* 관리자 회원관리(정지 처리)용 컬럼 — 기존과 같은 방식으로 없을 때만 추가 */
if (!userColumns.includes('status')) {
  db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
}

module.exports = db;
