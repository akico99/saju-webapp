/* 생년월일 한 번 입력 — 성별·생년월일·양음력·태어난 시각을 이 기기(localStorage)에만 저장해 두고,
   상품·무료 페이지의 입력 칸을 미리 채운 채 시작하게 한다. 서버로는 보내지 않는다.

   - 저장은 본인이 "이 기기에 기억하기"를 켰을 때만 한다(메인의 입력 상자 또는 각 폼 제출 버튼 위 체크).
   - 이름은 저장하지 않는다. 언제든 "지우기"로 없앨 수 있다.
   - 로그인 복귀 복원(pay-flow.js)과 결제 복귀(?jobId=)가 우선이다. 그런 경우와 이미 값이 들어 있는 칸은 건드리지 않는다.
   - 폼 칸 이름은 상품마다 다르다: 한 사람 폼은 year·gender…, 두 사람 폼은 aYear·aGender…(나 = a).
     값을 넣은 뒤 input/change 이벤트를 보내고, 성별·양음력처럼 버튼으로 고르는 칸은 버튼 표시도 맞춘다. */
(function () {
  'use strict';
  var KEY = 'sajuotter:birth:v1';
  var MAX_AGE_MS = 400 * 24 * 3600 * 1000;
  var path = location.pathname;
  var params = new URLSearchParams(location.search);
  var resumePending = false;
  try { resumePending = !!sessionStorage.getItem('form:resume:' + path); } catch (e) {}

  function num(v, lo, hi) { if (v === '' || v == null) return null; var n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; }

  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var year = num(raw.year, 1900, 2100), month = num(raw.month, 1, 12), day = num(raw.day, 1, 31);
    if (!year || !month || !day) return null;
    var hour = raw.hourUnknown ? null : num(raw.hour, 0, 23);
    var minute = hour == null ? null : (num(raw.minute, 0, 59) || 0);
    return {
      v: 1,
      savedAt: Number(raw.savedAt) || Date.now(),
      gender: raw.gender === '여' || raw.gender === '남' ? raw.gender : '',
      calendar: raw.calendar === '음력' ? '음력' : '양력',
      isLeap: raw.calendar === '음력' && !!raw.isLeap,
      year: year, month: month, day: day,
      hourUnknown: hour == null,
      hour: hour, minute: minute
    };
  }

  function read() {
    try {
      var rec = clean(JSON.parse(localStorage.getItem(KEY) || 'null'));
      if (rec && Date.now() - rec.savedAt > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
      return rec;
    } catch (e) { return null; }
  }
  function save(raw) {
    var rec = clean(Object.assign({}, raw, { savedAt: Date.now() }));
    if (!rec) return null;
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { return null; }
    return rec;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* ---------- 폼 찾기 ---------- */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function nameOf(p, base) { return p ? p + cap(base) : base; }
  function field(form, p, base) {
    var el = form.elements.namedItem(nameOf(p, base));
    if (el && !el.tagName && el.length) el = el[0];
    return el || null;
  }
  function locate() {
    var forms = Array.prototype.slice.call(document.forms);
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      if (f.getAttribute('data-birth-prefill') === 'off') continue;
      if (field(f, '', 'year') && field(f, '', 'month') && field(f, '', 'day')) return { form: f, p: '' };
      if (field(f, 'a', 'year') && field(f, 'a', 'month') && field(f, 'a', 'day')) return { form: f, p: 'a' };
    }
    return null;
  }

  function fire(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function setValue(el, v) {
    if (!el) return;
    v = v == null ? '' : String(v);
    if (el.type === 'checkbox') { var c = v === 'true'; if (el.checked !== c) { el.checked = c; fire(el); } return; }
    if (el.tagName === 'SELECT' && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) return;
    if (el.value !== v) { el.value = v; fire(el); }
  }
  function personOf(btn) {
    if (btn.dataset.person) return btn.dataset.person;
    if (btn.dataset.calendar === 'a' || btn.dataset.calendar === 'b') return btn.dataset.calendar;
    var m = /^([ab])[A-Z]/.exec(btn.dataset.pick || '');
    return m ? m[1] : '';
  }
  // 성별·양음력처럼 버튼으로 고르는 칸: 같은 묶음 버튼의 선택 표시를 맞춘다. 양음력 버튼은 눌러서 화면(윤달 줄)까지 맞춘다.
  // 성별 버튼은 누르면 다음 질문으로 넘어가므로 누르지 않고 표시만 바꾼다.
  function markButtons(form, p, base, value) {
    var sel = base === 'gender' ? '[data-gender],[data-pick="' + nameOf(p, 'gender') + '"]' : '[data-calendar]';
    var group = Array.prototype.filter.call(form.querySelectorAll(sel), function (b) { return personOf(b) === p; });
    if (!group.length) return false;
    var valueOf = function (b) { return b.dataset.value || (base === 'gender' ? b.dataset.gender : b.dataset.calendar); };
    var on = group.filter(function (b) { return valueOf(b) === value; })[0];
    if (!on) return false;
    if (base === 'calendar') { if (!on.classList.contains('on')) on.click(); return true; }
    group.forEach(function (b) { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', String(b === on)); });
    return true;
  }

  function fill(form, p, rec) {
    var y = field(form, p, 'year'), m = field(form, p, 'month'), d = field(form, p, 'day');
    if (!y || !m || !d || y.value || m.value || d.value) return false; // 이미 들어 있으면(복원·자동완성) 그대로 둔다
    var g = field(form, p, 'gender');
    if (rec.gender && g) {
      if (g.tagName === 'SELECT') setValue(g, rec.gender);
      else if (!g.value) { g.value = rec.gender; fire(g); }
      markButtons(form, p, 'gender', rec.gender);
    }
    var cal = field(form, p, 'calendar');
    markButtons(form, p, 'calendar', rec.calendar);
    if (cal) setValue(cal, rec.calendar);
    setValue(y, rec.year); setValue(m, rec.month); setValue(d, rec.day);
    setValue(field(form, p, 'isLeap'), String(!!rec.isLeap));
    var unknown = field(form, p, 'hourUnknown');
    if (rec.hourUnknown) {
      setValue(unknown, 'true');
    } else {
      setValue(unknown, 'false');
      setValue(field(form, p, 'hour'), rec.hour);
      setValue(field(form, p, 'minute'), rec.minute);
    }
    return true;
  }

  function collect(form, p) {
    var get = function (base) { var el = field(form, p, base); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; };
    return {
      gender: get('gender'), calendar: get('calendar') || '양력', isLeap: get('isLeap') === true,
      year: get('year'), month: get('month'), day: get('day'),
      hourUnknown: get('hourUnknown') === true || get('hour') === '', hour: get('hour'), minute: get('minute')
    };
  }

  /* ---------- 폼 안의 작은 안내(동의·지우기) ---------- */
  function attach(form, p, prefilled) {
    if (form.querySelector('.birth-prefill-remember')) return;
    var submit = form.querySelector('[type=submit]');
    var label = document.createElement('label');
    label.className = 'birth-prefill-remember';
    label.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin:10px 0;font-size:12.5px;line-height:1.55;opacity:.86;text-align:left;cursor:pointer;font-weight:400;';
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!read();
    box.style.cssText = 'width:16px;height:16px;min-height:0;margin:2px 0 0;flex:none;';
    var text = document.createElement('span');
    text.textContent = '다음 풀이에서 다시 입력하지 않도록 이 기기에 내 성별·생년월일·시각을 기억해 둘게요. (이 브라우저에만 저장, 언제든 지울 수 있어요)';
    label.appendChild(box); label.appendChild(text);
    if (prefilled) {
      var note = document.createElement('p');
      note.className = 'birth-prefill-note';
      note.setAttribute('role', 'status');
      note.style.cssText = 'margin:8px 0 0;font-size:12.5px;line-height:1.5;opacity:.86;';
      note.appendChild(document.createTextNode('저장해 둔 생년월일을 불러왔어요.'));
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'birth-prefill-clear';
      del.textContent = '지우기';
      del.style.cssText = 'all:unset;cursor:pointer;text-decoration:underline;margin-left:6px;font-weight:700;';
      del.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        clear(); box.checked = false;
        note.textContent = '저장해 둔 생년월일을 지웠어요. 지금 칸에 들어간 값은 그대로예요.';
      });
      note.appendChild(del);
      var y = field(form, p, 'year');
      var host = y && (y.closest('.wizard-date, .row, .field') || y.parentNode);
      if (host && host.parentNode) host.parentNode.insertBefore(note, host.nextSibling);
    }
    if (submit && submit.parentNode) submit.parentNode.insertBefore(label, submit);
    else form.appendChild(label);
    // 제출할 때 체크되어 있으면 저장, 꺼 두었으면 지운다. 앱 스크립트가 기본 동작을 막아도 캡처 단계에서 먼저 지난다.
    form.addEventListener('submit', function () {
      if (box.checked) save(collect(form, p)); else if (read()) clear();
    }, true);
  }

  function run() {
    var target = locate();
    if (!target) return;
    var rec = (params.has('jobId') || resumePending) ? null : read();
    var prefilled = rec ? fill(target.form, target.p, rec) : false;
    attach(target.form, target.p, prefilled);
  }

  window.BirthPrefill = { read: read, save: save, clear: clear, fill: fill, KEY: KEY };
  var me = document.currentScript;
  if (me && me.hasAttribute('data-manual')) return;
  // pay-flow.js의 로그인 복귀 복원(load 직후 0ms)과 각 페이지 앱의 초기화가 끝난 뒤에 채운다.
  function later() { setTimeout(run, 40); }
  if (document.readyState === 'complete') later();
  else window.addEventListener('load', later);
})();

