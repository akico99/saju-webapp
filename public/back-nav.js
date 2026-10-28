/* 상단 '←'(a.back) 공통 동작 — 같은 사이트에서 들어왔으면 실제로 왔던 페이지로 돌아간다.
   각 페이지의 href는 메인('/') 같은 고정 위치라, 상품 목록(/love-assets/home.html)에서 평생사주로 들어온 사람이
   '←'를 누르면 목록이 아니라 메인으로 가 버렸다(2026-10-28 제보). 새 탭·광고·북마크처럼 이력이 없거나,
   직전 화면이 결제·로그인 단계(되돌아가면 결제창이 다시 열리거나 로그인이 반복됨)면 원래 href를 그대로 쓴다.
   페이지가 이미 직접 처리한 클릭(defaultPrevented)은 건드리지 않는다. */
(function () {
  'use strict';
  var SKIP = /^\/(pay|pay-success|pay-fail|login|signup|consent|forgot-password|reset-password)\.html$/;
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.back');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (/^javascript:/i.test(a.getAttribute('href') || '')) return;
    var from;
    try { from = new URL(document.referrer); } catch (err) { return; }
    if (from.origin !== location.origin || SKIP.test(from.pathname) || history.length < 2) return;
    if (from.pathname === location.pathname && from.search === location.search) return;
    e.preventDefault();
    history.back();
  });
})();

