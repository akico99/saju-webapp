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
const adminRouter = require('./routes/admin');
const fortuneRouter = require('./routes/fortune');
const freeRouter = require('./routes/free');
const fieldGuideRouter = require('./routes/fieldGuide');
const ordersRouter = require('./routes/orders');
const bannersRouter = require('./routes/banners');
const lifeGraphRouter = require('./routes/lifeGraph');
const profilesRouter = require('./routes/profiles');
const dateSelectRouter = require('./routes/dateSelect');
const payRouter = require('./routes/pay');
const newYearRouter = require('./routes/newYear');
const newYearConfig = require('../config/newYear');

const app = express();

// Render(등 대부분의 PaaS)는 리버스 프록시 뒤에서 앱을 실행한다 — 이 설정이 없으면
// req.ip가 항상 프록시의 IP로 찍혀서(모든 사용자가 "같은 IP"가 되어) IP 기반 rate
// limit이 무의미해지고, 쿠키의 secure 옵션도 프록시-앱 구간(http)만 보고 거부당한다.
app.set('trust proxy', 1);

app.use(express.json());

// 신년운세는 카드사 승인 전까지 외부에서 보이지 않는다. 환경변수로 켰을 때만
// 페이지·정적 JS·API가 함께 열린다. 결제 준비 단계도 products.js에서 별도로 확인한다.
app.use((req, res, next) => {
  if (!newYearConfig.enabled && (/^\/new-year(?:\.html|-app\.js)?$/.test(req.path) || req.path === '/api/newyear')) {
    return res.sendStatus(404);
  }
  next();
});

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
// 리포트 그래프 조각(src/pdf/visuals.js)의 스타일 — PDF와 웹 결과 화면이 같은 CSS를 쓴다.
app.get('/report-visuals.css', (req, res) => {
  res.type('text/css').set('Cache-Control', 'public, max-age=3600').send(require('../pdf/visuals').WEB_VISUAL_CSS);
});
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
app.use('/api', adminRouter);
app.use('/api', fortuneRouter);
app.use('/api', freeRouter);
app.use('/api', fieldGuideRouter);
app.use('/api', ordersRouter);
app.use('/api', bannersRouter);
app.use('/api', lifeGraphRouter);
app.use('/api', profilesRouter);
app.use('/api', dateSelectRouter);
app.use('/api', payRouter);
app.use('/api', newYearRouter);
app.use('/api', require('./routes/tracking'));

module.exports = app;
