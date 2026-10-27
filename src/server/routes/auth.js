'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const users = require('../../db/users');
const passwordResets = require('../../db/passwordResets');
const emailVerifications = require('../../db/emailVerifications');
const consents = require('../../db/consents');
const accountDeletion = require('../../db/accountDeletion');
const { resolveSocialUser } = require('../socialAccounts');
const { safeNext } = require('../loginReturn');
const { sendEmail } = require('../../email/resend');
const resend = require('../../email/resend');
const { passwordResetEmail, verifyEmailEmail, accountDeletionCodeEmail } = require('../../email/templates');
const { requireAuth } = require('../middleware/auth');
const { userLoginLimiter, signupLimiter, forgotPasswordLimiter, accountDeletionRequestLimiter, accountDeletionConfirmLimiter, resendVerificationLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const BASE_URL = process.env.BASE_URL || 'http://localhost:4500';

/** 소셜 로그인 뒤 갈 곳 — 상품 페이지에서 넘어왔으면 그 페이지로 돌려보낸다(입력값은 브라우저가 복원한다).
   현재 약관에 동의하지 않았으면(처음 가입했거나 약관이 바뀐 경우) 동의 페이지가 먼저다. */
function afterSocialLogin(user, wanted) {
  const next = wanted || (user.birth_year ? '/' : '/mypage.html');
  return consents.hasSignupConsent(user.id) ? next : '/consent.html?next=' + encodeURIComponent(next);
}

/** 소셜 로그인 시작 시 돌아갈 곳을 세션에 적어둔다. 제공사를 다녀오는 동안 쿼리는 사라지기 때문이다. */
function rememberNext(req) {
  const next = safeNext(req.query.redirect);
  if (next) req.session.oauthNext = next;
  else delete req.session.oauthNext;
}

/** 세션을 새로 만들기 전에 꺼낸다 — regenerate 뒤에는 남아 있지 않다. */
function takeNext(req) {
  const next = safeNext(req.session.oauthNext);
  delete req.session.oauthNext;
  return next;
}

function withConsent(row) {
  return { user: users.toPublicUser(row), needsConsent: !consents.hasSignupConsent(row.id) };
}

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

router.post('/auth/signup', signupLimiter, async (req, res) => {
  try {
    const { password, name } = req.body;
    const email = String(req.body.email || '').trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '이메일 형식이 올바르지 않습니다.' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다.' });
    }
    if (users.findByEmail(email)) {
      return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
    }
    if (!consents.signupAgreed(req.body)) {
      return res.status(400).json({ error: '이용약관, 개인정보 수집·이용, 만 14세 이상 확인에 모두 동의해야 가입할 수 있어요.', code: 'consent_required' });
    }
    const birth = parseBirth(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    const row = users.createUser({ email, passwordHash, name: (name || '').slice(0, 30), ...birth });
    consents.recordSignupConsents(row.id, req);

    // 세션 고정(session fixation) 방지 — 비로그인 상태에서 만들어져 있던 세션 ID를 그대로
    // 승격시키지 않고 새 세션으로 갈아탄다.
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ error: '가입 처리 중 오류가 발생했습니다.' });
      req.session.userId = row.id;
      res.json(withConsent(row));

      // 가입 자체는 인증 메일 발송 성공 여부와 무관하게 완료시킨다 — 응답은 이미 보냈으니
      // 이 아래는 실패해도 사용자 경험에 영향 없이 로그로만 남는다.
      sendVerificationEmail(row).catch((e2) => console.error('가입 인증 메일 발송 실패:', e2.message));
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/login', userLoginLimiter, async (req, res) => {
  const { email, password } = req.body;
  const row = users.findByEmail(email || '');
  if (!row) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  const ok = await bcrypt.compare(password || '', row.password_hash);
  if (!ok) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' });

  if (row.status === 'suspended') {
    return res.status(403).json({ error: '이용이 제한된 계정입니다. 문의: sooky2001@gmail.com' });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    req.session.userId = row.id;
    res.json(withConsent(row));
  });
});

// 가입 동의를 아직 하지 않은 로그인 회원(소셜 첫 가입, 약관 변경 후)이 consent.html에서 동의한다.
router.post('/auth/consent', requireAuth, (req, res) => {
  if (!consents.signupAgreed(req.body)) {
    return res.status(400).json({ error: '필수 항목에 모두 동의해 주세요.', code: 'consent_required' });
  }
  if (!consents.hasSignupConsent(req.session.userId)) consents.recordSignupConsents(req.session.userId, req);
  res.json({ ok: true, version: consents.CONSENT_VERSION });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/auth/me', (req, res) => {
  if (!req.session || !req.session.userId) return res.json({ user: null });
  const row = users.findById(req.session.userId);
  if (!row) return res.json({ user: null });
  res.json(withConsent(row));
});

/* ---------- 비밀번호 재설정 ---------- */
// 가입 여부와 무관하게 항상 같은 응답을 준다 — "이 이메일은 가입돼 있지 않아요" 같은
// 메시지는 그 자체로 회원 여부를 노출하는 정보 유출이라 절대 구분해서 알려주지 않는다.
const GENERIC_MSG = '해당 이메일로 가입된 계정이 있다면, 비밀번호 재설정 링크를 보내드렸어요.';

router.post('/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
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

router.post('/auth/resend-verification', requireAuth, resendVerificationLimiter, async (req, res) => {
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
  rememberNext(req);

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
    // 네이버가 넘겨주는 이메일은 네이버가 인증한 주소다(제공 동의를 받은 경우에만 온다).
    const user = resolveSocialUser({
      provider: 'naver', providerId: naverProfile.id,
      email: naverProfile.email, emailVerified: !!naverProfile.email,
      name: naverProfile.name || naverProfile.nickname
    });

    if (user.status === 'suspended') {
      return res.redirect('/login.html?error=' + encodeURIComponent('이용이 제한된 계정입니다. 문의: sooky2001@gmail.com'));
    }

    const wanted = takeNext(req);
    req.session.regenerate((err) => {
      if (err) return res.redirect('/login.html?error=' + encodeURIComponent('로그인 처리 중 오류가 발생했어요.'));
      req.session.userId = user.id;
      res.redirect(afterSocialLogin(user, wanted));
    });
    return;
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
  rememberNext(req);

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

    const user = resolveSocialUser({
      provider: 'google', providerId: googleProfile.id,
      email: googleProfile.email,
      emailVerified: googleProfile.verified_email === true || googleProfile.email_verified === true,
      name: googleProfile.name
    });

    if (user.status === 'suspended') {
      return res.redirect('/login.html?error=' + encodeURIComponent('이용이 제한된 계정입니다. 문의: sooky2001@gmail.com'));
    }

    const wanted = takeNext(req);
    req.session.regenerate((err) => {
      if (err) return res.redirect('/login.html?error=' + encodeURIComponent('로그인 처리 중 오류가 발생했어요.'));
      req.session.userId = user.id;
      res.redirect(afterSocialLogin(user, wanted));
    });
    return;
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
  rememberNext(req);

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
    // 카카오는 이메일이 유효하고(is_email_valid) 인증된(is_email_verified) 경우만 확인된 것으로 본다.
    const user = resolveSocialUser({
      provider: 'kakao', providerId: kakaoProfile.id,
      email: account.email,
      emailVerified: account.is_email_valid === true && account.is_email_verified === true,
      name: account.profile ? account.profile.nickname : null
    });

    if (user.status === 'suspended') {
      return res.redirect('/login.html?error=' + encodeURIComponent('이용이 제한된 계정입니다. 문의: sooky2001@gmail.com'));
    }

    const wanted = takeNext(req);
    req.session.regenerate((err) => {
      if (err) return res.redirect('/login.html?error=' + encodeURIComponent('로그인 처리 중 오류가 발생했어요.'));
      req.session.userId = user.id;
      res.redirect(afterSocialLogin(user, wanted));
    });
    return;
  } catch (e) {
    res.redirect('/login.html?error=' + encodeURIComponent('카카오 로그인 중 문제가 발생했어요: ' + e.message));
  }
});

/* ---------- 회원 탈퇴 ----------
   본인 확인: 이메일 가입 계정은 현재 비밀번호, 소셜 계정은 인증된 이메일로 받은 1회용 코드(마이페이지에 입력 — URL에 넣지 않는다).
   진행 중인 주문·결제가 있으면 아무것도 바꾸지 않고 막는다. 비밀번호·코드·이메일은 로그에 남기지 않는다. */
const DELETION_BLOCKED_MESSAGE = '진행 중인 주문이나 결제가 있어 지금은 탈퇴할 수 없어요. 리포트 생성과 결제·환불 처리가 끝난 뒤 마이페이지에서 다시 시도해 주세요.';
const isPlaceholderEmail = (email) => /@social\.sajusudal\.local$/i.test(String(email || ''));

function deletionBlocked(res, blockers) {
  return res.status(409).json({ error: DELETION_BLOCKED_MESSAGE, code: 'deletion_blocked', blockers });
}

router.post('/auth/account/delete/request', requireAuth, accountDeletionRequestLimiter, async (req, res) => {
  const user = users.findById(req.session.userId);
  if (user.provider === 'local') {
    return res.status(400).json({ error: '이메일 가입 계정은 현재 비밀번호를 입력해 탈퇴할 수 있어요.', code: 'password_required' });
  }
  const blockers = accountDeletion.findBlockers(user.id);
  if (blockers.length) return deletionBlocked(res, blockers);
  if (!user.email_verified || isPlaceholderEmail(user.email)) {
    return res.status(409).json({
      error: '인증된 이메일이 없는 계정은 화면에서 탈퇴할 수 없어요. sooky2001@gmail.com 으로 문의해 주세요.',
      code: 'email_not_verified'
    });
  }
  const code = accountDeletion.issueDeletionCode(user.id);
  try {
    await resend.sendEmail({
      to: user.email,
      subject: '[사주보는 수달] 회원 탈퇴 확인 코드',
      html: accountDeletionCodeEmail({ code, ttlMinutes: accountDeletion.CODE_TTL_MINUTES })
    });
  } catch (e) {
    accountDeletion.revokeDeletionCodes(user.id);
    console.error('탈퇴 확인 메일 발송 실패');
    return res.status(502).json({ error: '확인 메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.', code: 'deletion_email_failed' });
  }
  res.json({ ok: true, method: 'email_code', ttlMinutes: accountDeletion.CODE_TTL_MINUTES });
});

router.post('/auth/account/delete/confirm', requireAuth, accountDeletionConfirmLimiter, async (req, res) => {
  const user = users.findById(req.session.userId);
  let codeId = null;
  if (user.provider === 'local') {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!password) return res.status(400).json({ error: '현재 비밀번호를 입력해 주세요.', code: 'password_required' });
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(403).json({ error: '비밀번호가 올바르지 않습니다.', code: 'invalid_credentials' });
    }
  } else {
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    if (!code) return res.status(400).json({ error: '이메일로 받은 확인 코드를 입력해 주세요.', code: 'code_required' });
    const verified = accountDeletion.verifyDeletionCode(user.id, code);
    if (!verified.ok) {
      return res.status(403).json({
        error: verified.code === 'code_expired' ? '확인 코드가 만료되었어요. 코드를 다시 받아 주세요.' : '확인 코드가 올바르지 않습니다. 코드를 다시 받아 입력해 주세요.',
        code: verified.code
      });
    }
    codeId = verified.codeId;
  }

  let result;
  try {
    result = accountDeletion.deleteAccount(user.id, { codeId });
  } catch (e) {
    console.error('[탈퇴] 처리 실패 (변경 사항 없음):', e && e.code);
    return res.status(500).json({ error: '탈퇴 처리 중 오류가 발생했어요. 데이터는 그대로 있으니 잠시 후 다시 시도해 주세요.', code: 'deletion_failed' });
  }
  if (!result.ok) {
    if (result.code === 'deletion_blocked') return deletionBlocked(res, result.blockers);
    if (result.code === 'invalid_code') return res.status(403).json({ error: '확인 코드가 올바르지 않거나 이미 사용되었어요. 코드를 다시 받아 주세요.', code: 'invalid_code' });
    return res.status(404).json({ error: '계정을 찾을 수 없습니다.', code: result.code });
  }
  // 계정 데이터는 이미 지워졌다. 생성 파일이 아직 남았다면 "모두 삭제했다"고 말하지 않는다.
  const filesPending = result.files ? result.files.pending : 0;
  const filesNeedReview = result.rejected || 0;
  if (filesNeedReview > 0) console.error('[탈퇴] 자동 삭제할 수 없는 생성 파일 ' + filesNeedReview + '건 — 운영자 확인 필요');
  let message = '탈퇴가 완료되었어요. 계정 정보와 생성한 리포트는 삭제했습니다.';
  if (filesNeedReview > 0) message = '계정 정보는 삭제했어요. 다만 생성 파일 일부는 자동으로 지울 수 없어 운영자가 확인해 삭제합니다.';
  else if (filesPending > 0) message = '계정 정보는 삭제했어요. 생성 파일 일부는 잠시 후 자동으로 삭제됩니다.';
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({
      ok: true,
      keptTransactionRecords: result.retained,
      filesPending,
      filesNeedReview,
      message
    });
  });
});

module.exports = router;
