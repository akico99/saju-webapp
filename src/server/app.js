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
const ordersRouter = require('./routes/orders');
const bannersRouter = require('./routes/banners');
const lifeGraphRouter = require('./routes/lifeGraph');
const newTopicsRouter = require('./routes/newTopics');
const profilesRouter = require('./routes/profiles');
const dateSelectRouter = require('./routes/dateSelect');
const lifeTopicsRouter = require('./routes/lifeTopics');

const app = express();
app.use(express.json());

app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
  secret: process.env.SESSION_SECRET || 'dev-only-insecure-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' } // 30일
}));

app.use(express.static(path.join(__dirname, '..', '..', 'public')));
app.use('/api', generateRouter);
app.use('/api', statusRouter);
app.use('/api', downloadRouter);
app.use('/api', compatRouter);
app.use('/api', quickRouter);
app.use('/api', authRouter);
app.use('/api', pointsRouter);
app.use('/api', adminRouter);
app.use('/api', fortuneRouter);
app.use('/api', ordersRouter);
app.use('/api', bannersRouter);
app.use('/api', lifeGraphRouter);
app.use('/api', newTopicsRouter);
app.use('/api', profilesRouter);
app.use('/api', dateSelectRouter);
app.use('/api', lifeTopicsRouter);

module.exports = app;
