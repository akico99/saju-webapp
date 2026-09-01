'use strict';
/* 생성 페이지(index/quick/compat) 공통 — 로그인 여부·포인트 잔액·이 상품 가격을 안내한다.
   window.POINT_NOTICE_PRICE 와 window.POINT_NOTICE_LABEL 를 각 페이지에서 먼저 지정해두고 로드한다. */
(function () {
  const el = document.getElementById('pointNotice');
  if (!el) return;
  const price = window.POINT_NOTICE_PRICE || 0;
  const label = window.POINT_NOTICE_LABEL || '이 리포트';

  fetch('/api/auth/me').then((r) => r.json()).then((data) => {
    if (!data.user) {
      el.innerHTML = `${label}는 <b>${price.toLocaleString('ko-KR')}P</b>가 필요해요. <a href="/login.html?redirect=${encodeURIComponent(location.pathname + location.search)}">로그인하고 계속하기 →</a>`;
      return;
    }
    if (data.user.pointBalance < price) {
      el.classList.add('warn');
      el.innerHTML = `${label} 가격은 <b>${price.toLocaleString('ko-KR')}P</b>인데, 보유 포인트가 <b>${data.user.pointBalance.toLocaleString('ko-KR')}P</b>로 부족해요. <a href="/mypage.html">충전하러 가기 →</a>`;
      return;
    }
    el.innerHTML = `${label} 가격 <b>${price.toLocaleString('ko-KR')}P</b> — 제출하면 보유 포인트(${data.user.pointBalance.toLocaleString('ko-KR')}P)에서 바로 차감됩니다.`;
  }).catch(() => {
    el.textContent = '로그인 상태를 확인하지 못했습니다.';
  });
})();
