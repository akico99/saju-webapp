'use strict';
/* 간편 로그인(네이버·구글·카카오) 계정을 우리 회원과 연결하는 단 하나의 규칙.

   - 제공사가 "확인된 이메일"이라고 알려준 경우에만 같은 이메일의 기존 회원으로 로그인시킨다.
     확인되지 않은 이메일로 합치면, 남의 이메일을 적어 둔 제공사 계정으로 그 사람의 회원 계정에
     들어갈 수 있다(계정 탈취).
   - 확인되지 않았거나 이메일이 없으면 기존 계정과 합치지 않고, 로그인용 가짜 주소로 새 회원을 만든다.
     결과물을 받을 이메일은 결제할 때 따로 입력받아 인증한다. 가짜 주소 계정은 인증 완료로 두지 않는다.
   - 합치는 대상이 아직 이메일 인증을 하지 않은 이메일 가입 계정이면, 그 비밀번호를 무효로 만든다.
     다른 사람이 이 주소로 먼저 가입만 해 두었을 수 있기 때문이다(주인이 들어온 뒤에도 비밀번호로
     같이 들어오지 못하게). 주인은 간편 로그인이나 비밀번호 재설정으로 계속 쓸 수 있다.

   제공사별 "확인된 이메일" 판단은 각 콜백이 한다:
   - 구글: userinfo의 verified_email(또는 email_verified)이 true
   - 카카오: kakao_account.is_email_valid && is_email_verified
   - 네이버: 제공 동의를 받은 이메일은 네이버가 가입·변경 시 인증한 주소라 확인된 것으로 본다 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const users = require('../db/users');

function placeholderEmail(provider, providerId) {
  return `${provider}_${providerId}@social.sajusudal.local`;
}

function resolveSocialUser({ provider, providerId, email, emailVerified, name }) {
  const pid = String(providerId);
  const linked = users.findByProvider(provider, pid);
  if (linked) return linked;

  const cleanEmail = typeof email === 'string' ? email.trim() : '';
  if (cleanEmail && emailVerified === true) {
    const existing = users.findByEmail(cleanEmail);
    if (existing) {
      if (!existing.email_verified) {
        users.updatePasswordHash(existing.id, bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10));
        users.markEmailVerified(existing.id);
      }
      return users.findById(existing.id);
    }
    return users.createSocialUser({ email: cleanEmail, name, provider, providerId: pid, emailVerified: true });
  }

  const placeholder = placeholderEmail(provider, pid);
  return users.findByEmail(placeholder)
    || users.createSocialUser({ email: placeholder, name, provider, providerId: pid, emailVerified: false });
}

module.exports = { resolveSocialUser, placeholderEmail };

