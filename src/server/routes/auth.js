'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const users = require('../../db/users');
const passwordResets = require('../../db/passwordResets');
const emailVerifications = require('../../db/emailVerifications');
const { sendEmail } = require('../../email/resend');
const { passwordResetEmail, verifyEmailEmail } = require('../../email/templates');
const { requireAuth } = require('../middleware/auth');

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
  const noLonCorrection = !!body.noLonCorrection;
  return { birthYear: year, birthMonth: month, birthDay: day, birthHour: hour, birthMinute: minute, gender, isLunar, isLeap, city, noLonCorrection };
}

// 가입 직후·재발송 요청 양쪽에서 쓰는 공용 함수 — 발송 실패는 호출한 쪽에서 조용히
// 넘어갈 수 있도록 그대로 던진다(가입 자체는 막지 않되, 재발송 API는 실패를 알려줘야 하므로).
async function sendVerificationEmail(user) {
  const token = emailVerifications.createToken(user.id);
  const verifyUrl = `${BASE_URL}/api/auth/verify-email?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: '[사주보는 수달] 이메일 인증',
    html: verifyEmailEmail({ verifyUrl, ttlHours: emailVerifications.TOKEN_TTL_HOURS })
  });
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

    // 가입 자체는 인증 메일 발송 성공 여부와 무관하게 완료시킨다 — 응답은 이미 보냈으니
    // 이 아래는 실패해도 사용자 경험에 영향 없이 로그로만 남는다.
    sendVerificationEmail(row).catch((e) => console.error('가입 인증 메일 발송 실패:', e.message));
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

/* ---------- 비밀번호 재설정 ---------- */
// 가입 여부와 무관하게 항상 같은 응답을 준다 — "이 이메일은 가입돼 있지 않아요" 같은
// 메시지는 그 자체로 회원 여부를 노출하는 정보 유출이라 절대 구분해서 알려주지 않는다.
const GENERIC_MSG = '해당 이메일로 가입된 계정이 있다면, 비밀번호 재설정 링크를 보내드렸어요.';

router.post('/auth/forgot-password', async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (!email) return res.status(400).json({ error: '이메일을 입력해주세요.' });

  const user = users.findByEmail(email);
  // 소셜 로그인 계정은 원래 비밀번호가 없으니(무작위 값) 재설정 대상에서 제외한다.
  if (user && user.provider === 'local') {
    const token = passwordResets.createToken(user.id);
    const resetUrl = `${BASE_URL}/reset-password.html?token=${token}`;
    try {
      await sendEmail({
        to: user.email,
        subject: '[사주보는 수달] 비밀번호 재설정',
        html: passwordResetEmail({ resetUrl, ttlMinutes: passwordResets.TOKEN_TTL_MINUTES })
      });
    } catch (e) {
      // 발송 실패는 사용자에게 정보를 흘리지 않고 서버 로그로만 남긴다.
      console.error('비밀번호 재설정 메일 발송 실패:', e.message);
    }
  }

  res.json({ message: GENERIC_MSG });
});

router.post('/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token) return res.status(400).json({ error: '유효하지 않은 요청입니다.' });
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
  }

  const row = passwordResets.findValidToken(token);
  if (!row) {
    return res.status(400).json({ error: '링크가 만료되었거나 이미 사용됐어요. 다시 요청해주세요.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.updatePasswordHash(row.user_id, passwordHash);
  passwordResets.markUsed(row.id);

  res.json({ ok: true });
});

/* ---------- 이메일 인증 ---------- */
// 이메일 속 버튼이 GET으로 직접 여는 링크라 JSON이 아니라 페이지로 응답(리다이렉트)한다.
router.get('/auth/verify-email', (req, res) => {
  const { token } = req.query;
  const row = token && emailVerifications.findValidToken(token);
  if (!row) {
    return res.redirect('/login.html?error=' + encodeURIComponent('인증 링크가 만료되었거나 이미 사용됐어요.'));
  }
  users.markEmailVerified(row.user_id);
  emailVerifications.markUsed(row.id);
  res.redirect('/mypage.html?verified=1');
});

router.post('/auth/resend-verification', requireAuth, async (req, res) => {
  const user = users.findById(req.session.userId);
  if (user.email_verified) return res.json({ ok: true, alreadyVerified: true });
  try {
    await sendVerificationEmail(user);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '메일 발송에 실패했어요. 잠시 후 다시 시도해주세요.' });
  }
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

/* ---------- 구글 로그인 ---------- */
router.get('/auth/google/start', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).send('구글 로그인이 아직 설정되지 않았습니다.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.googleOAuthState = state;

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/google/callback`);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

router.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/login.html?error=' + encodeURIComponent('구글 로그인이 취소되었습니다.'));
  if (!state || state !== req.session.googleOAuthState) {
    return res.redirect('/login.html?error=' + encodeURIComponent('로그인 요청이 만료되었어요. 다시 시도해주세요.'));
  }
  delete req.session.googleOAuthState;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/api/auth/google/callback`,
        code
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || '토큰 발급 실패');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const googleProfile = await profileRes.json();
    if (!googleProfile.id) throw new Error('프로필 조회 실패');

    // provider_id로 못 찾으면 이메일로 기존 계정에 병합(이메일/비번 가입자가 구글로도 로그인하는 경우 대비).
    let user = users.findByProvider('google', googleProfile.id);
    if (!user) {
      const email = googleProfile.email || `google_${googleProfile.id}@social.sajusudal.local`;
      user = users.findByEmail(email);
      if (!user) {
        user = users.createSocialUser({
          email, name: googleProfile.name,
          provider: 'google', providerId: googleProfile.id
        });
      }
    }

    if (user.status === 'suspended') {
      return res.redirect('/login.html?error=' + encodeURIComponent('이용이 제한된 계정입니다. 문의: sooky2001@gmail.com'));
    }

    req.session.userId = user.id;
    res.redirect(user.birth_year ? '/' : '/mypage.html');
  } catch (e) {
    res.redirect('/login.html?error=' + encodeURIComponent('구글 로그인 중 문제가 발생했어요: ' + e.message));
  }
});

/* ---------- 카카오 로그인 ---------- */
router.get('/auth/kakao/start', (req, res) => {
  if (!process.env.KAKAO_CLIENT_ID) {
    return res.status(503).send('카카오 로그인이 아직 설정되지 않았습니다.');
  }
  const state = crypto.randomBytes(16).toString('hex');
  req.session.kakaoOAuthState = state;

  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.KAKAO_CLIENT_ID);
  url.searchParams.set('redirect_uri', `${BASE_URL}/api/auth/kakao/callback`);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

router.get('/auth/kakao/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.redirect('/login.html?error=' + encodeURIComponent('카카오 로그인이 취소되었습니다.'));
  if (!state || state !== req.session.kakaoOAuthState) {
    return res.redirect('/login.html?error=' + encodeURIComponent('로그인 요청이 만료되었어요. 다시 시도해주세요.'));
  }
  delete req.session.kakaoOAuthState;

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.KAKAO_CLIENT_ID,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        redirect_uri: `${BASE_URL}/api/auth/kakao/callback`,
        code
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || '토큰 발급 실패');
    }

    const profileRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const kakaoProfile = await profileRes.json();
    if (!kakaoProfile.id) throw new Error('프로필 조회 실패');

    const account = kakaoProfile.kakao_account || {};
    // provider_id로 못 찾으면 이메일로 기존 계정에 병합(이메일/비번 가입자가 카카오로도 로그인하는 경우 대비).
    let user = users.findByProvider('kakao', kakaoProfile.id);
    if (!user) {
      const email = account.email || `kakao_${kakaoProfile.id}@social.sajusudal.local`;
      user = users.findByEmail(email);
      if (!user) {
        user = users.createSocialUser({
          email, name: account.profile ? account.profile.nickname : null,
          provider: 'kakao', providerId: kakaoProfile.id
        });
      }
    }

    if (user.status === 'suspended') {
      return res.redirect('/login.html?error=' + encodeURIComponent('이용이 제한된 계정입니다. 문의: sooky2001@gmail.com'));
    }

    req.session.userId = user.id;
    res.redirect(user.birth_year ? '/' : '/mypage.html');
  } catch (e) {
    res.redirect('/login.html?error=' + encodeURIComponent('카카오 로그인 중 문제가 발생했어요: ' + e.message));
  }
});

module.exports = router;
