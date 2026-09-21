'use strict';
/* 생성 페이지(index/quick/compat) 공통 — 로그인 여부·포인트 잔액·이 상품 가격을 안내한다.
   window.POINT_NOTICE_PRICE 와 window.POINT_NOTICE_LABEL 를 각 페이지에서 먼저 지정해두고 로드한다. */
(function () {
  const el = document.getElementById('pointNotice');
  if (!el) return;
  const price = window.POINT_NOTICE_PRICE || 0;
  const label = window.POINT_NOTICE_LABEL || '이 리포트';
  // 받침 유무로 은/는을 고른다 — '심층 리딩는' 같은 어색한 조사를 막는다.
  const last = label.charCodeAt(label.length - 1);
  const hasBatchim = last >= 0xAC00 && last <= 0xD7A3 && (last - 0xAC00) % 28 !== 0;
  const topic = label + (hasBatchim ? '은' : '는');

  // PG 심사·전자상거래법 요구사항 — 구매자가 결제 전에 제공 방식과 기간을 알 수 있어야 한다.
  // 모든 유료 상품은 결제(포인트 차감) 즉시 자동 생성되는 디지털 콘텐츠이고 정기결제가 없다.
  const delivery = document.createElement('p');
  delivery.className = 'delivery-note';
  delivery.textContent = (window.POINT_NOTICE_DELIVERY || '결제 후 자동 생성되어 최대 10분 내 웹·PDF로 제공됩니다') + ' · 단건 결제(정기결제 없음) · 마이페이지에서 언제든 다시 받을 수 있어요.';
  el.insertAdjacentElement('afterend', delivery);

  fetch('/api/auth/me').then((r) => r.json()).then((data) => {
    if (!data.user) {
      el.innerHTML = `${topic} <b>${price.toLocaleString('ko-KR')}원</b>(카드 결제)이에요. <a href="/login.html?redirect=${encodeURIComponent(location.pathname + location.search)}">로그인하고 계속하기 →</a>`;
      return;
    }
    if (data.user.pointBalance < price) {
      el.innerHTML = `${label} <b>${price.toLocaleString('ko-KR')}원</b> — 제출하면 카드 결제창이 열리고, 결제 즉시 생성이 시작됩니다.${data.user.pointBalance > 0 ? ` (보유 크레딧 ${data.user.pointBalance.toLocaleString('ko-KR')}P는 가격 이상일 때 자동으로 먼저 쓰여요)` : ''}`;
      return;
    }
    el.innerHTML = `${label} 가격 <b>${price.toLocaleString('ko-KR')}P</b> — 제출하면 보유 포인트(${data.user.pointBalance.toLocaleString('ko-KR')}P)에서 바로 차감됩니다.`;
  }).catch(() => {
    el.textContent = '로그인 상태를 확인하지 못했습니다.';
  });
})();
