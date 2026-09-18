'use strict';
const express = require('express');
const path = require('path');
const session = require('express-session');
const SqliteStore = require('better-sqlite3-session-store')(session);
const db = require('../db/index');

const generateRouter = require('./routes/generate');
const statusRouter = require('./routes/status');
const downloadRouter = require('./routes/download');
const compatRouter = require('./routes/compat');
const quickRouter = require('./routes/quick');
const authRouter = require('./routes/auth');
const pointsRouter = require('./routes/points');
const adminRouter = require('./routes/admin');
const fortuneRouter = require('./routes/fortune');
const freeRouter = require('./routes/free');
const ordersRouter = require('./routes/orders');
const bannersRouter = require('./routes/banners');
const lifeGraphRouter = require('./routes/lifeGraph');
const profilesRouter = require('./routes/profiles');
const dateSelectRouter = require('./routes/dateSelect');
const payRouter = require('./routes/pay');

const app = express();

// Render(등 대부분의 PaaS)는 리버스 프록시 뒤에서 앱을 실행한다 — 이 설정이 없으면
// req.ip가 항상 프록시의 IP로 찍혀서(모든 사용자가 "같은 IP"가 되어) IP 기반 rate
// limit이 무의미해지고, 쿠키의 secure 옵션도 프록시-앱 구간(http)만 보고 거부당한다.
app.set('trust proxy', 1);

app.use(express.json());

app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

app.use(express.static(path.join(__dirname, '..', '..', 'public')));
// 관리자가 업로드한 배너 이미지는 data/uploads/banners(영구 디스크)에 저장된다 — 기본
// 배너(public/banners에서 못 찾은 파일만 여기서 마저 찾도록 같은 /banners 경로에 추가로
// 연결한다). src/server/routes/banners.js 참고.
app.use('/banners', express.static(path.join(__dirname, '..', '..', 'data', 'uploads', 'banners')));
app.use('/api', generateRouter);
app.use('/api', statusRouter);
app.use('/api', downloadRouter);
app.use('/api', compatRouter);
app.use('/api', quickRouter);
app.use('/api', authRouter);
app.use('/api', pointsRouter);
app.use('/api', adminRouter);
app.use('/api', fortuneRouter);
app.use('/api', freeRouter);
app.use('/api', ordersRouter);
app.use('/api', bannersRouter);
app.use('/api', lifeGraphRouter);
app.use('/api', profilesRouter);
app.use('/api', dateSelectRouter);
app.use('/api', payRouter);

module.exports = app;
