/* 사주보는 수달 공용 추적 — 모든 공개 페이지가 GA 태그 바로 뒤에 불러온다.

   1) 광고 유입값 저장: URL의 utm_* · fbclid · gclid를 localStorage에 "처음 유입"과 "마지막 유입"으로
      나눠 저장한다. 결제 준비(PayFlow.checkout) 때 서버로 넘겨 주문에 붙이므로, 관리자 화면에서
      캠페인별 매출을 볼 수 있다.
   2) 픽셀: /api/tracking-config가 메타·카카오 픽셀 ID를 주면 그때만 불러온다(ID가 없거나 개인정보
      처리방침 시행일 전이면 서버가 null을 준다).
   3) 이벤트: GA4 권장 이벤트 이름(view_item, begin_checkout, purchase)을 기준으로 메타(ViewContent,
      InitiateCheckout, Purchase)와 카카오(viewContent, purchase 등)에 같은 값을 보낸다.
      구매는 주문번호마다 한 번만 보낸다(새로고침·재방문 중복 방지). */
(function () {
  'use strict';
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'];
  var LS = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---- 1) 유입값 ----
  (function captureAttribution() {
    var q = new URLSearchParams(location.search);
    var hit = {};
    ATTR_KEYS.forEach(function (k) { var v = q.get(k); if (v) hit[k] = v.slice(0, 120); });
    if (!Object.keys(hit).length) {
      // 광고 파라미터 없이 외부 사이트에서 처음 들어온 경우 — 참조 도메인만 남긴다.
      if (!LS.get('so_attr_first') && document.referrer && document.referrer.indexOf(location.host) < 0) {
        try { hit.referrer = new URL(document.referrer).hostname; } catch (e) {}
      }
      if (!Object.keys(hit).length) return;
    }
    hit.landing = location.pathname;
    hit.at = new Date().toISOString();
    if (!LS.get('so_attr_first')) LS.set('so_attr_first', hit);
    LS.set('so_attr_last', hit);
  })();

  function attribution() {
    var first = LS.get('so_attr_first'), last = LS.get('so_attr_last');
    return first || last ? { first: first, last: last } : null;
  }

  // ---- 2) 설정·픽셀 ----
  var cfg = null, ready = false, queue = [];
  function flush() { ready = true; var q = queue; queue = []; q.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  function loadMeta(id) {
    /* 메타 공식 기본 코드(fbevents.js)를 그대로 옮긴 것 */
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', id);
    window.fbq('track', 'PageView');
  }

  function loadKakao(id, done) {
    var s = document.createElement('script');
    s.async = true; s.src = 'https://t1.daumcdn.net/kas/static/kp.js';
    s.onload = function () { try { window.kakaoPixel(id).pageView(); } catch (e) {} done(); };
    s.onerror = done;
    document.head.appendChild(s);
  }

  function kakao(fn) { if (cfg && cfg.kakaoPixelId && window.kakaoPixel) { try { fn(window.kakaoPixel(cfg.kakaoPixelId)); } catch (e) {} } }
  function meta() { if (cfg && cfg.metaPixelId && window.fbq) { try { window.fbq.apply(null, arguments); } catch (e) {} } }
  function ga() { if (window.gtag) { try { window.gtag.apply(null, arguments); } catch (e) {} } }

  fetch('/api/tracking-config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (c) {
    cfg = c || {};
    if (cfg.metaPixelId) loadMeta(cfg.metaPixelId);
    if (cfg.kakaoPixelId) loadKakao(cfg.kakaoPixelId, function () { flush(); autoViewItem(); });
    else { flush(); autoViewItem(); }
  }).catch(function () { cfg = {}; flush(); });

  function when(fn) { ready ? fn() : queue.push(fn); }

  // ---- 3) 이벤트 ----
  function item(p) { return { item_id: p.productKey || p.id || 'unknown', item_name: p.name || p.productKey || '', price: p.value, quantity: 1 }; }

  function viewItem(p) {
    when(function () {
      ga('event', 'view_item', { currency: 'KRW', value: p.value, items: [item(p)] });
      meta('track', 'ViewContent', { content_ids: [p.productKey], content_name: p.name, content_type: 'product', value: p.value, currency: 'KRW' });
      kakao(function (k) { k.viewContent({ id: p.productKey }); });
    });
  }

  function beginCheckout(p) {
    var key = 'so_checkout_' + p.orderId;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    when(function () {
      ga('event', 'begin_checkout', { currency: 'KRW', value: p.value, items: [item(p)] });
      meta('track', 'InitiateCheckout', { content_ids: [p.productKey], value: p.value, currency: 'KRW', num_items: 1 });
      kakao(function (k) { k.viewCart(); });
    });
  }

  function purchase(p) {
    if (!p || !p.orderId) return;
    var key = 'so_purchase_' + p.orderId;
    if (LS.get(key)) return;
    LS.set(key, 1);
    when(function () {
      // 토스 테스트 모드 결제(카드 청구 없음)는 광고 플랫폼에 구매로 보내지 않는다 — 광고 학습이 가짜
      // 구매로 오염되지 않게. GA에는 따로 purchase_test로 남겨 결제 흐름 점검에만 쓴다.
      if (p.testMode) { ga('event', 'purchase_test', { transaction_id: p.orderId, currency: 'KRW', value: p.value, items: [item(p)] }); return; }
      ga('event', 'purchase', { transaction_id: p.orderId, currency: 'KRW', value: p.value, items: [item(p)] });
      // eventID를 주문번호로 두면 나중에 서버 전환 API를 붙여도 메타가 중복을 걸러낸다.
      meta('track', 'Purchase', { content_ids: [p.productKey], content_name: p.name, content_type: 'product', value: p.value, currency: 'KRW' }, { eventID: p.orderId });
      kakao(function (k) { k.purchase({ total_quantity: '1', total_price: String(p.value), currency: 'KRW', products: [{ id: p.productKey, name: p.name, quantity: '1', price: String(p.value) }] }); });
    });
  }

  function signUp(method) {
    when(function () {
      ga('event', 'sign_up', { method: method || 'email' });
      meta('track', 'CompleteRegistration', { status: true });
      kakao(function (k) { k.completeRegistration(); });
    });
  }

  /* 상품 페이지는 주소만으로 무슨 상품인지 알 수 있어 여기서 자동으로 view_item을 보낸다.
     가격은 서버(points.PRICES)가 준 값을 쓴다. */
  function autoViewItem() {
    if (!cfg || !cfg.products) return;
    var q = new URLSearchParams(location.search), path = location.pathname, key = null;
    if (q.get('jobId')) return; // 결제 뒤 결과를 보러 돌아온 경우는 상품 조회가 아니다
    if (path === '/quick.html') key = 'deep_' + (q.get('topic') || 'intro');
    else if (path === '/compat.html') key = 'compat';
    else if (path === '/date-select.html') key = 'date_select_' + (q.get('occasion') || 'moving');
    else if (path === '/lifetime-report.html') key = 'full';
    var p = key && cfg.products[key];
    if (p) viewItem({ productKey: key, name: p.name, value: p.price });
  }

  window.SoTrack = { attribution: attribution, viewItem: viewItem, beginCheckout: beginCheckout, purchase: purchase, signUp: signUp };
})();

