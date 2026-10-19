'use strict';
/* 로그인 뒤 돌아갈 곳 — 결제하려다 로그인으로 넘어온 사람을 원래 상품 페이지로 돌려보낸다.
   이 사이트 안의 경로(/로 시작)만 받는다. //example.com 같은 주소로 밖으로 보내는 것을 막는다. */
function safeNext(raw) {
  const s = typeof raw === 'string' ? raw : '';
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return null;
  if (s.length > 512 || /[\u0000-\u001f\\]/.test(s)) return null;
  return s;
}

module.exports = { safeNext };
