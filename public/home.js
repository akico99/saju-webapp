/* 메인(index.html) 전용 — 대표 상품 공개 여부 반영, 계정·메뉴, 생년월일 한 번 입력 상자. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- 공개된 대표 상품만 보이기 ----------
     서버 설정(/api/products/available)을 따른다. 응답을 못 받으면 HTML 기본값(연애·신년 표시, 재회 숨김,
     궁합은 예전 4,900원 페이지)을 그대로 둔다. */
  var COUPLE = { title: '두 사람의 궁합', desc: '서로 끌리는 이유와 앞으로 12개월', price: '14,900원 · 웹 + PDF', menu: '두 사람의 궁합 · 궁합' };
  function withQuery(path, legacy) {
    var q = (legacy || '').split('?')[1];
    return q ? path + '?' + q : path;
  }
  function applyAvailability(on) {
    document.querySelectorAll('[data-product]').forEach(function (el) {
      var key = el.getAttribute('data-product');
      if (key === 'couple') {
        if (!on.couple) return;
        el.setAttribute('href', withQuery('/couple.html', el.getAttribute('data-legacy-href')));
        var img = el.querySelector('img[data-src]');
        if (img) img.src = img.getAttribute('data-src');
        var t = el.querySelector('[data-couple-title]'); if (t) t.textContent = COUPLE.title;
        var d = el.querySelector('[data-couple-desc]'); if (d) d.textContent = COUPLE.desc;
        var p = el.querySelector('[data-couple-price]'); if (p) p.textContent = COUPLE.price;
        if (el.hasAttribute('data-couple-label')) el.textContent = COUPLE.menu;
        return;
      }
      var open = !!on[key];
      el.hidden = !open;
      if (open) {
        var lazy = el.querySelector('img[data-src]');
        if (lazy && !lazy.getAttribute('src')) lazy.src = lazy.getAttribute('data-src');
      }
    });
    document.body.setAttribute('data-products-ready', '1');
  }
  fetch('/api/products/available', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (on) { if (on) applyAvailability(on); else document.body.setAttribute('data-products-ready', '0'); })
    .catch(function () { document.body.setAttribute('data-products-ready', '0'); });

  /* ---------- 계정 ---------- */
  fetch('/api/auth/me').then(function (r) { return r.json(); }).then(function (data) {
    if (!data || !data.user) return;
    $('accountArea').innerHTML = '<a href="/mypage.html">마이페이지</a>';
    $('menuLogoutSection').classList.remove('hidden');
    // 로그인해서 생년월일이 있으면 입력 없이 바로 결과가 나오는 오늘의 운세로 보낸다.
    if (data.user.birth) {
      $('todayFortuneCard').href = '/today-fortune.html';
      $('menuTodayFortune').href = '/today-fortune.html';
    }
  }).catch(function () { /* 계정 확인이 실패해도 페이지는 그대로 */ });
  $('menuLogoutBtn').addEventListener('click', function () {
    fetch('/api/auth/logout', { method: 'POST' }).finally(function () { location.href = '/'; });
  });

  /* ---------- 전체 메뉴 ---------- */
  (function () {
    var overlay = $('menuOverlay'), drawer = $('menuDrawer');
    function open() { overlay.classList.add('open'); drawer.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function close() { overlay.classList.remove('open'); drawer.classList.remove('open'); document.body.style.overflow = ''; }
    $('menuBtn').addEventListener('click', open);
    $('menuCloseBtn').addEventListener('click', close);
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    drawer.addEventListener('click', function (e) { if (e.target.closest('a[href^="/#"]')) close(); });
  })();

  /* ---------- 생년월일 한 번 입력 ---------- */
  var BP = window.BirthPrefill;
  var form = $('birthForm');
  if (!BP || !form) return;
  var f = function (name) { return form.elements.namedItem(name); };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  function summary(rec) {
    var s = (rec.gender ? (rec.gender === '여' ? '여자' : '남자') + ' · ' : '') +
      rec.year + '.' + pad(rec.month) + '.' + pad(rec.day) + ' (' + rec.calendar + (rec.isLeap ? ' 윤달' : '') + ')' +
      ' · ' + (rec.hourUnknown ? '시각 모름' : pad(rec.hour) + ':' + pad(rec.minute || 0));
    return '이 기기에 저장된 생년월일: ' + s;
  }
  function syncForm() {
    var lunar = form.querySelector('input[name=calendar]:checked').value === '음력';
    $('birthLeapRow').classList.toggle('hidden', !lunar);
    if (!lunar) f('isLeap').checked = false;
    var unknown = f('hourUnknown').checked;
    f('hour').disabled = unknown; f('minute').disabled = unknown;
    if (unknown) { f('hour').value = ''; f('minute').value = ''; }
  }
  function fillForm(rec) {
    form.querySelectorAll('input[name=gender]').forEach(function (r) { r.checked = r.value === rec.gender; });
    form.querySelectorAll('input[name=calendar]').forEach(function (r) { r.checked = r.value === rec.calendar; });
    f('isLeap').checked = !!rec.isLeap;
    f('year').value = rec.year; f('month').value = rec.month; f('day').value = rec.day;
    f('hourUnknown').checked = !!rec.hourUnknown;
    f('hour').value = rec.hourUnknown ? '' : rec.hour; f('minute').value = rec.hourUnknown ? '' : rec.minute;
    f('consent').checked = true;
    syncForm();
  }
  function render() {
    var rec = BP.read();
    $('birthSaved').classList.toggle('hidden', !rec);
    form.classList.toggle('hidden', !!rec);
    if (rec) $('birthSavedText').textContent = summary(rec);
  }
  function fail(msg) { $('birthError').textContent = msg; $('birthError').classList.remove('hidden'); }

  form.addEventListener('change', syncForm);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    $('birthError').classList.add('hidden');
    var g = form.querySelector('input[name=gender]:checked');
    var y = Number(f('year').value), m = Number(f('month').value), d = Number(f('day').value);
    if (!(y >= 1900 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return fail('태어난 해·월·일을 확인해 주세요.');
    if (!f('hourUnknown').checked && f('hour').value === '') return fail('태어난 시각을 적거나 "시각 모름"을 골라 주세요.');
    if (!f('consent').checked) return fail('이 기기에 저장하는 데 동의해 주셔야 저장할 수 있어요.');
    var rec = BP.save({
      gender: g ? g.value : '',
      calendar: form.querySelector('input[name=calendar]:checked').value,
      isLeap: f('isLeap').checked,
      year: y, month: m, day: d,
      hourUnknown: f('hourUnknown').checked,
      hour: f('hour').value, minute: f('minute').value || 0
    });
    if (!rec) return fail('이 브라우저에서는 저장할 수 없어요. 개인 정보 보호 모드인지 확인해 주세요.');
    render();
  });
  $('birthEdit').addEventListener('click', function () {
    var rec = BP.read();
    if (rec) fillForm(rec);
    $('birthSaved').classList.add('hidden');
    form.classList.remove('hidden');
  });
  $('birthClear').addEventListener('click', function () {
    BP.clear();
    form.reset();
    syncForm();
    render();
  });
  syncForm();
  render();
})();

