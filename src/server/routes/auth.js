'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const users = require('../../db/users');

const router = express.Router();

const BASE_URL = process.env.BASE_URL || 'http://localhost:4500';

function parseBirth(body) {
  const year = Number(body.year), month = Number(body.month), day = Number(body.day);
  if (!year || !month || !day) throw new Error('생년월일을 올바르게 입력해주세요.');
  const hourGiven = body.hourUnknown !== 'true' && body.hourUnknown !== true;
  const hour = hourGiven && body.hour !== '' && body.hour != null ? Number(body.hour) : null;
  const minute = hourGiven && body.minute !== '' && body.minute != null ? Number(body.minute) : 0;
  const gender = body.gender === '여' || body.gender === '남' ? body.gender : null;
  const isLunar = body.calendar === '음력';
  const isLeap = !!body.isLeap;
  const city = body.city || null;
  return { birthYear: year, birthMonth: month, birthDay: day, birthHour: hour, birthMinute: minute, gender, isLunar, isLeap, city };
}

router.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    }
    if (users.findByEmail(email)) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }
    const birth = parseBirth(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const row = users.createUser({ email, passwordHash, name: (name || '').slice(0, 30), ...birth });

    req.session.userId = row.id;
    res.json({ user: users.toPublicUser(row) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const row = users.findByEmail(email || '');
  if (!row) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  const ok = await bcrypt.compare(password || '', row.password_hash);
  if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  if (row.status === 'suspended') {
    return res.status(403).json({ error: '이용이 제한된 계정입니다. 문의: sooky2001@gmail.com' });
  }

  req.session.userId = row.id;
  res.json({ user: users.toPublicUser(row) });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json({ user: null });
  const row = users.findById(req.session.userId);
  res.json({ user: users.toPublicUser(row) });
});

/* ---------- 네이버 로그인 ---------- */
router.get('/auth/naver/start', (req, res) => {
  if (!process.env.NAVER_CLIENT_ID) {
    return res.status(503).send('네이버 로그인이 아직 설정되지 않았습니다.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.naverOAuthState = state;

  const url = new URL('https://nid.naver.com/oauth2.0/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.NAVER_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/naver/callback`);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

router.get('/auth/naver/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/login.html?error=' + encodeURIComponent('네이버 로그인이 취소되었습니다.'));
  if (!state || state !== req.session.naverOAuthState) {
    return res.redirect('/login.html?error=' + encodeURIComponent('로그인 요청이 만료되었어요. 다시 시도해주세요.'));
  }
  delete req.session.naverOAuthState;

  try {
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', process.env.NAVER_CLIENT_ID);
    tokenUrl.searchParams.set('client_secret', process.env.NAVER_CLIENT_SECRET);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('state', state);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || '토큰 발급 실패');
    }

    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profileData = await profileRes.json();
    if (profileData.resultcode !== '00' || !profileData.response) {
      throw new Error('프로필 조회 실패');
    }

    const naverProfile = profileData.response;
    // provider_id로 못 찾으면 이메일로 기존 계정에 병합(이메일/비번 가입자가 네이버로도 로그인하는 경우 대비).
    let user = users.findByProvider('naver', naverProfile.id);
    if (!user) {
      const email = naverProfile.email || `naver_${naverProfile.id}@social.sajusudal.local`;
      user = users.findByEmail(email);
      if (!user) {
        user = users.createSocialUser({
          email, name: naverProfile.name || naverProfile.nickname,
          provider: 'naver', providerId: naverProfile.id
        });
      }
    }

    if (user.status === 'suspended') {
      return res.redirect('/login.html?error=' + encodeURIComponent('이용이 제한된 계정입니다. 문의: sooky2001@gmail.com'));
    }

    req.session.userId = user.id;
    res.redirect(user.birth_year ? '/' : '/mypage.html');
  } catch (e) {
    res.redirect('/login.html?error=' + encodeURIComponent('네이버 로그인 중 문제가 발생했어요: ' + e.message));
  }
});

module.exports = router;
