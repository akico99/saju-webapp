/* 사주보는 수달 공용 추적 — 모든 공개 페이지가 GA 태그 바로 뒤에 불러온다.

   1) 광고 유입값 저장: URL의 utm_* · fbclid · gclid를 localStorage에 "처음 유입"과 "마지막 유입"으로
      나눠 저장한다(서버가 시행일 이후임을 확인한 뒤에만). 결제 준비(PayFlow.checkout) 때 서버로 넘겨 주문에 붙이므로, 관리자 화면에서
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
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // ---- 1) 유입값 ----
  function captureAttribution() {
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
  }

  function attribution() {
    if (!cfg || cfg.attributionEnabled !== true) return null;
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

  // 한 광고 사업자의 외부 스크립트가 대기해도 다른 사업자의 이벤트를 막지 않는다.
  var kakaoState = 'off', kakaoQueue = [];
  function loadKakao(id) {
    kakaoState = 'loading';
    var s = document.createElement('script');
    s.async = true; s.src = 'https://t1.daumcdn.net/kas/static/kp.js';
    s.onload = function () {
      if (kakaoState !== 'loading') return;
      kakaoState = typeof window.kakaoPixel === 'function' ? 'ready' : 'failed';
      if (kakaoState === 'ready') { try { window.kakaoPixel(id).pageView(); } catch (e) {} }
      var pending = kakaoQueue; kakaoQueue = [];
      if (kakaoState === 'ready') pending.forEach(kakao);
    };
    s.onerror = function () { if (kakaoState === 'loading') { kakaoState = 'failed'; kakaoQueue = []; } };
    document.head.appendChild(s);
  }

  function kakao(fn) {
    if (kakaoState === 'loading') { if (kakaoQueue.length < 100) kakaoQueue.push(fn); return; }
    if (kakaoState === 'ready' && cfg && cfg.kakaoPixelId && window.kakaoPixel) { try { fn(window.kakaoPixel(cfg.kakaoPixelId)); } catch (e) {} }
  }
  function token(v) { return typeof v === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(v) ? v : null; }
  function eventData(key, data) {
    if (!token(key) || !cfg || cfg.attributionEnabled !== true) return data;
    var attr = attribution(), last = attr && (attr.last || attr.first), creative = token(last && last.utm_content);
    if (creative) data.creative_id = creative;
    // 화면 버전을 상품별로 보관해 같은 탭의 결제 화면으로 잇는다. 개인 식별자는 추가하지 않는다.
    var product = document.querySelector && document.querySelector('meta[name="so-product-key"]');
    var version = document.querySelector && document.querySelector('meta[name="so-page-version"]');
    var current = product && product.content === key && version && token(version.content);
    try {
      if (current) sessionStorage.setItem('so_page_version_' + key, current);
      current = current || token(sessionStorage.getItem('so_page_version_' + key));
    } catch (e) {}
    if (current) data.page_version = current;
    return data;
  }
  function meta() {
    if (cfg && cfg.metaPixelId && window.fbq) { try {
      var args = Array.prototype.slice.call(arguments), data = args[2];
      if (data && data.content_ids) args[2] = eventData(data.content_ids[0], data);
      window.fbq.apply(null, args);
    } catch (e) {} }
  }
  function ga() {
    if (window.gtag) { try {
      var args = Array.prototype.slice.call(arguments), data = args[2];
      if (data) args[2] = eventData(data.item_id || (data.items && data.items[0] && data.items[0].item_id), data);
      window.gtag.apply(null, args);
    } catch (e) {} }
  }

  fetch('/api/tracking-config', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (c) {
    cfg = c || {};
    // 브라우저 시계 대신 서버의 기존 TRACKING_START 판단을 따른다. 설정 실패 시에도 저장하지 않는다.
    if (cfg.attributionEnabled === true) captureAttribution();
    else { LS.remove('so_attr_first'); LS.remove('so_attr_last'); }
    if (cfg.metaPixelId) loadMeta(cfg.metaPixelId);
    if (cfg.kakaoPixelId) loadKakao(cfg.kakaoPixelId);
    flush(); autoViewItem();
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

  /* 결제 페이지에서 '결제하기'를 눌러 토스 결제창을 여는 순간. 결제 시작(InitiateCheckout = 결제 페이지 도착)과
     구매 사이에서 손님이 결제창 앞에서 멈췄는지, 결제창 안(카드 인증)에서 멈췄는지 가르는 기준이 된다. 주문당 한 번만. */
  function addPaymentInfo(p) {
    if (!p || !p.orderId) return;
    var key = 'so_payinfo_' + p.orderId;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    when(function () {
      ga('event', 'add_payment_info', { currency: 'KRW', value: p.value, items: [item(p)] });
      meta('track', 'AddPaymentInfo', { content_ids: [p.productKey], value: p.value, currency: 'KRW' });
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
    else if (path === '/new-year.html') key = 'new_year_2027';
    else if (path === '/love.html') key = 'love_timing';
    else if (path === '/reunion.html') key = 'reunion_v2';
    else if (path === '/couple.html') key = 'compat_v2';
    var p = key && cfg.products[key];
    if (p) viewItem({ productKey: key, name: p.name, value: p.price });
  }

  /* 무료 사주 분석 결과 표시(Lead)와 잠금 해제 버튼 클릭(UnlockClick).
     소액 광고는 구매만으로는 학습 신호가 모자라 무료 결과를 최적화 이벤트로 쓴다.
     로그인 복귀·재열람으로 부풀지 않게 상품별로 브라우저 세션당 한 번만 보낸다. 출생정보는 넣지 않는다. */
  function onceInSession(k) {
    try { if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); } catch (e) {}
    return true;
  }
  function productInfo(key) {
    var p = cfg && cfg.products && cfg.products[key];
    return { productKey: key, name: (p && p.name) || key, value: (p && p.price) || 0 };
  }
  function freeResult(key) {
    if (!key || !onceInSession('so_free_' + key)) return;
    when(function () {
      var p = productInfo(key);
      ga('event', 'generate_lead', { currency: 'KRW', value: 0, lead_source: 'free_result', items: [item(p)] });
      meta('track', 'Lead', { content_ids: [key], content_name: p.name, content_category: 'free_result', value: 0, currency: 'KRW' });
      kakao(function (k) { if (k.participation) k.participation('free_result'); });
    });
  }
  function inputStart(key) {
    if (!key || !onceInSession('so_input_' + key)) return;
    when(function () {
      ga('event', 'input_start', { item_id: key });
      meta('trackCustom', 'InputStart', { content_ids: [key] });
    });
  }
  /* from: 구매 창을 연 버튼 위치. 브라우저 세션 첫 클릭이며 고유 사람 수를 뜻하지 않는다. */
  function unlockClick(key, from) {
    if (!key || !onceInSession('so_unlock_' + key)) return;
    when(function () {
      var p = productInfo(key);
      var where = typeof from === 'string' && /^[a-z_]{1,24}$/.test(from) ? from : 'other';
      ga('event', 'unlock_click', { currency: 'KRW', value: p.value, unlock_from: where, items: [item(p)] });
      meta('trackCustom', 'UnlockClick', { content_ids: [key], content_name: p.name, value: p.value, currency: 'KRW', unlock_from: where });
    });
  }

  /* 무료 결과 스크롤 도달 위치(완독 여부 아님). 기존 FreeRead25·50·75·100 이름은 유지한다. */
  var DEPTHS = { 25: 1, 50: 1, 75: 1, 100: 1 };
  function readDepth(key, pct) {
    if (!key || !DEPTHS[pct] || !onceInSession('so_read_' + key + '_' + pct)) return;
    when(function () {
      ga('event', 'free_read_depth', { percent: pct, item_id: key });
      meta('trackCustom', 'FreeRead' + pct, { content_ids: [key] });
    });
  }

  window.SoTrack = { attribution: attribution, viewItem: viewItem, beginCheckout: beginCheckout, addPaymentInfo: addPaymentInfo, purchase: purchase, signUp: signUp, inputStart: inputStart, freeResult: freeResult, unlockClick: unlockClick, readDepth: readDepth };
})();

