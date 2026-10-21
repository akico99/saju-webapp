'use strict';
/* 연애 시기 리포트 화면 — 대화형 입력 → 무료 첫 장(/api/love/preview) → 잠금 해제(/api/love,
   로그인·카드 결제는 pay-flow.js) → 결과(/api/status/:jobId).
   입력값은 한 <form id="loveForm"> 안에 모두 있다. 그래야 로그인으로 넘어갈 때 PayFlow.toLogin이
   통째로 저장하고, 돌아와서 복원한 뒤 무료 첫 장을 다시 열 수 있다.
   서버 응답 문자열은 innerHTML로 넣지 않는다(textContent). 예외는 서버가 엔진 숫자만으로 만든
   12개월 막대(result_visual)뿐이다. */
(function () {
  const form = document.getElementById('loveForm');
  const steps = Array.from(form.querySelectorAll('.stage-step'));
  const dots = Array.from(document.querySelectorAll('#dots i'));
  const backBtn = document.getElementById('backBtn');
  const stageError = document.getElementById('stageError');
  const freeResult = document.getElementById('freeResult');
  const paidResult = document.getElementById('paidResult');
  const unlockBtn = document.getElementById('unlockBtn');
  const errorBlock = document.getElementById('errorBlock');
  const SITUATION_LABEL = { single: '솔로', some: '썸', dating: '연애 중', breakup: '이별 후' };
  let step = 0;
  let startYm = null; // 무료 첫 장의 12개월 시작 달 — 결제 요청에 실어 같은 12개월로 풀이를 받는다

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const field = (name) => form.elements[name];

  /* ---------- 입력 무대 ---------- */
  function show(i) {
    step = i;
    steps.forEach((s, k) => { s.hidden = k !== i; });
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
    backBtn.disabled = i === 0;
    stageError.hidden = true;
    const first = steps[i].querySelector('input:not([type=hidden]):not([type=checkbox])');
    if (first && i > 0) setTimeout(() => first.focus({ preventScroll: true }), 50);
  }
  function stageFail(msg) {
    stageError.querySelector('.q').textContent = msg;
    stageError.hidden = false;
  }
  function validate(i) {
    if (i === 0 && !field('situation').value) return '지금 상황을 하나 골라 주세요.';
    if (i === 1 && !field('gender').value) return '성별을 골라 주세요. 연애운 계산에 쓰여요.';
    const intIn = (v, lo, hi) => /^\d+$/.test(String(v).trim()) && Number(v) >= lo && Number(v) <= hi;
    if (i === 2) {
      const yv = field('year').value, mv = field('month').value, dv = field('day').value;
      if (!intIn(yv, 1900, new Date().getFullYear()) || !intIn(mv, 1, 12) || !intIn(dv, 1, 31)) return '태어난 해·달·날을 숫자로 적어 주세요.';
      if (field('calendar').value !== '음력') {
        const d = new Date(Date.UTC(Number(yv), Number(mv) - 1, Number(dv)));
        if (d.getUTCMonth() !== Number(mv) - 1) return `${mv}월에는 ${dv}일이 없어요. 날짜를 다시 확인해 주세요.`;
      }
    }
    if (i === 3 && !field('hourUnknown').checked) {
      if (!intIn(field('hour').value, 0, 23)) return '태어난 시(0~23)를 적거나 "시각을 몰라요"를 골라 주세요.';
      const mi = field('minute').value;
      if (mi !== '' && !intIn(mi, 0, 59)) return '태어난 분은 0~59로 적어 주세요. 모르면 비워 두세요.';
    }
    return null;
  }
  function next() {
    const err = validate(step);
    if (err) return stageFail(err);
    if (step < steps.length - 1) show(step + 1);
  }

  function markOn(buttons, on) { buttons.forEach((b) => b.classList.toggle('on', b === on)); }
  const situationBtns = Array.from(form.querySelectorAll('[data-situation]'));
  situationBtns.forEach((b) => b.addEventListener('click', () => {
    field('situation').value = b.dataset.situation;
    markOn(situationBtns, b);
    setTimeout(next, 120);
  }));
  const genderBtns = Array.from(form.querySelectorAll('[data-gender]'));
  genderBtns.forEach((b) => b.addEventListener('click', () => { field('gender').value = b.dataset.gender; markOn(genderBtns, b); stageError.hidden = true; }));
  const calendarBtns = Array.from(form.querySelectorAll('[data-calendar]'));
  const leapRow = form.querySelector('.leap-row');
  function setCalendar(value) {
    field('calendar').value = value;
    markOn(calendarBtns, calendarBtns.find((b) => b.dataset.calendar === value));
    leapRow.hidden = value !== '음력';
    if (value !== '음력') field('isLeap').checked = false;
  }
  calendarBtns.forEach((b) => b.addEventListener('click', () => setCalendar(b.dataset.calendar)));
  form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', next));
  backBtn.addEventListener('click', () => { if (step > 0) show(step - 1); });
  field('hourUnknown').addEventListener('change', () => {
    const off = field('hourUnknown').checked;
    field('hour').disabled = off; field('minute').disabled = off;
    if (off) { field('hour').value = ''; field('minute').value = ''; }
  });
  // 입력칸에서 엔터를 누르면 다음 단계로(마지막 단계는 제출).
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < steps.length - 1) { e.preventDefault(); next(); }
  });

  function body() {
    return {
      situation: field('situation').value,
      name: field('name').value.trim(),
      gender: field('gender').value,
      calendar: field('calendar').value,
      isLeap: field('isLeap').checked,
      year: field('year').value, month: field('month').value, day: field('day').value,
      hour: field('hour').value, minute: field('minute').value,
      hourUnknown: field('hourUnknown').checked,
      startYm
    };
  }

  /* ---------- 무료 첫 장 ---------- */
  function renderFree(r, b) {
    const who = b.name || '고객';
    document.getElementById('foldedText').textContent =
      `${SITUATION_LABEL[b.situation] || ''} · ${b.year}.${b.month}.${b.day}${b.calendar === '음력' ? ' (음력)' : ''} · ${b.gender}`;
    document.getElementById('freeTitle').textContent = `${who}님의 연애 첫 장`;
    document.getElementById('freeLead').textContent = r.strongCount > 0
      ? `앞으로 12개월 중 인연 신호가 강한 달이 ${r.strongCount}번 있어요. 그중 가장 강한 세 달이 언제인지는 전체 풀이에서 알려 드릴게요.`
      : '앞으로 12개월은 잔잔한 흐름이 길어요. 그래도 그중 가장 나은 세 달은 분명히 있어요. 전체 풀이에서 알려 드릴게요.';

    const pillars = document.getElementById('pillars');
    pillars.replaceChildren();
    pillars.classList.toggle('three', r.pillars.length === 3);
    r.pillars.forEach((p) => {
      const box = el('div', 'love-pillar' + (p.key === 'day' ? ' day' : ''));
      box.append(el('span', null, p.key === 'day' ? '일주 · 나' : p.ko), el('b', null, p.hanja), el('small', null, p.ganzi));
      pillars.appendChild(box);
    });
    document.getElementById('pillarNote').textContent = r.note || '가운데 금색 칸(일주)의 아래 글자가 연인을 보는 자리예요.';

    document.getElementById('charmHeadline').textContent = r.charm.headline;
    document.getElementById('charmBase').textContent = r.charm.base.text;
    const charmList = document.getElementById('charmList');
    charmList.replaceChildren();
    r.charm.found.slice(0, 3).forEach((f) => {
      const li = el('li');
      li.append(el('b', null, f.title), document.createTextNode(f.core));
      charmList.appendChild(li);
    });

    document.getElementById('balanceLead').textContent = r.balance.headline + '. ' + r.balance.lead;
    const bars = document.getElementById('balanceBars');
    bars.replaceChildren();
    r.balance.bars.forEach((x) => {
      const row = el('div', 'love-oh');
      const name = el('span'); name.append(el('b', null, x.ko + ' ' + x.el), document.createTextNode(' ' + x.word.split('·')[0]));
      const track = el('div', 'track'); const fill = el('i'); fill.style.width = x.pct + '%'; fill.style.background = x.color; track.appendChild(fill);
      row.append(name, track, el('span', null, x.count + '개'));
      bars.appendChild(row);
    });

    startYm = r.startYm || null;
    document.getElementById('seasonLead').textContent = r.seasonLead;
    const seasons = document.getElementById('seasons');
    seasons.replaceChildren();
    r.seasons.forEach((s) => {
      const col = el('div', 'love-season lv-' + s.level);
      const bar = el('i'); bar.style.setProperty('--h', Math.max(12, Math.min(100, s.avg)) + '%');
      col.append(bar, el('b', null, s.level), el('small', null, s.label));
      seasons.appendChild(col);
    });

    const locked = document.getElementById('lockedList');
    locked.replaceChildren();
    r.locked.forEach((t) => locked.appendChild(el('li', null, t)));

    document.body.classList.add('done');
    document.getElementById('stage').classList.add('hidden');
    freeResult.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  async function preview(b) {
    const btn = document.getElementById('previewBtn');
    btn.disabled = true;
    try {
      const res = await fetch('/api/love/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '첫 장을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      renderFree(data.reading, b);
      return true;
    } catch (e) {
      stageFail(e.message);
      return false;
    } finally {
      btn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    for (let i = 0; i < steps.length; i++) {
      const err = validate(i);
      if (err) { show(i); stageFail(err); return; }
    }
    preview(body());
  });

  document.getElementById('redoBtn').addEventListener('click', () => {
    document.body.classList.remove('done');
    freeResult.classList.add('hidden');
    document.getElementById('stage').classList.remove('hidden');
    show(0);
    window.scrollTo(0, 0);
  });

  /* ---------- 잠금 해제(결제) ---------- */
  function showError(msg) {
    errorBlock.textContent = msg;
    errorBlock.classList.remove('hidden');
  }
  // 한 줄 고정 버튼은 결제 안내 상자로 데려가기만 한다. 안내 상자가 화면에 들어오면 숨긴다.
  const unlockBox = document.querySelector('.love-unlock');
  const stickyBar = document.getElementById('stickyBar');
  document.getElementById('stickyUnlock').addEventListener('click', () => unlockBox.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => entries.forEach((en) => stickyBar.classList.toggle('away', en.isIntersecting)), { threshold: 0.2 }).observe(unlockBox);
  }
  // 가격 안내(point-notice.js)의 "로그인하고 계속하기" 링크도 입력값을 저장하고 넘어가게 한다.
  document.getElementById('pointNotice').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/login.html"]');
    if (!a) return;
    e.preventDefault();
    PayFlow.toLogin(form);
  });
  unlockBtn.addEventListener('click', async () => {
    errorBlock.classList.add('hidden');
    const b = body();
    unlockBtn.disabled = true;
    try {
      const res = await fetch('/api/love', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return startPaid(data.jobId);
      if (data.code === 'already_pending' && data.jobId) return startPaid(data.jobId);
      if (res.status === 401) { PayFlow.toLogin(form); return; }
      if (res.status === 402) { await PayFlow.onInsufficient('love', b, data, showError); return; }
      showError(data.error || '요청을 처리하지 못했어요.');
    } catch (e) {
      showError('요청 실패: ' + e.message);
    } finally {
      unlockBtn.disabled = false;
    }
  });

  /* ---------- 결과 ---------- */
  function appendRich(node, s) {
    String(s || '').split(/\*\*/).forEach((part, i) => {
      if (!part) return;
      node.appendChild(i % 2 ? el('strong', 'hl', part) : document.createTextNode(part));
    });
    return node;
  }
  function parseSections(report) {
    const out = [];
    let cur = null;
    String(report || '').split(/\n/).forEach((line) => {
      const h = /^##\s+(.+)$/.exec(line);
      if (h) { cur = { title: h[1].trim(), lines: [] }; out.push(cur); return; }
      if (cur) cur.lines.push(line);
    });
    return out.map((s) => ({ title: s.title, text: s.lines.join('\n').trim() }));
  }
  function renderBlock(text, into) {
    text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((p) => {
      if (/^\s*[-•]\s/m.test(p)) {
        const ul = el('ul', 'fr-list');
        p.split('\n').forEach((l) => { const t = l.replace(/^\s*[-•]\s*/, '').trim(); if (t) ul.appendChild(appendRich(el('li'), t)); });
        into.appendChild(ul);
      } else {
        into.appendChild(appendRich(el('p'), p));
      }
    });
  }
  function renderPaid(report, visual) {
    const sections = parseSections(report);
    const answer = sections.find((s) => s.title === '한 줄 답');
    const months = sections.find((s) => s.title === '앞으로 12개월');
    document.getElementById('paidAnswer').textContent = answer ? answer.text.replace(/\*\*/g, '') : '';
    document.getElementById('loveVisual').innerHTML = visual || ''; // 서버가 엔진 숫자로만 만든 막대
    const box = document.getElementById('loveSections');
    box.replaceChildren();
    sections.filter((s) => s !== answer && s !== months).forEach((s) => {
      const sec = el('section', 'fr-section fr-prose');
      sec.appendChild(el('h3', 'fr-h', s.title));
      renderBlock(s.text, sec);
      box.appendChild(sec);
    });
    const list = document.getElementById('monthList');
    list.replaceChildren();
    if (months) {
      months.text.split('\n').forEach((l) => {
        const m = /^\s*-\s*(\d{1,2})월:\s*(.+)$/.exec(l);
        if (!m) return;
        const li = el('li'); li.append(el('b', null, m[1] + '월'), el('span', null, m[2]));
        list.appendChild(li);
      });
    }
    document.getElementById('monthsSection').classList.toggle('hidden', !list.children.length);
    document.getElementById('progressBlock').classList.add('hidden');
    document.getElementById('paidReading').classList.remove('hidden');
    document.getElementById('paidActions').classList.remove('hidden');
  }

  function paidFail(msg) {
    document.getElementById('progressBlock').classList.add('hidden');
    const e = document.getElementById('paidError');
    e.textContent = msg;
    e.classList.remove('hidden');
  }

  async function poll(jobId) {
    try {
      const res = await fetch('/api/status/' + encodeURIComponent(jobId));
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      if (!res.ok) return paidFail(data.error || '주문을 찾지 못했어요.');
      if (data.status === 'done') return renderPaid(data.report, data.visual);
      if (data.status === 'error') return paidFail(data.error || '생성 중 문제가 생겼어요. 결제는 자동으로 취소돼요.');
      setTimeout(() => poll(jobId), 2500);
    } catch (e) {
      setTimeout(() => poll(jobId), 4000);
    }
  }

  function startPaid(jobId) {
    document.body.classList.add('done');
    document.getElementById('stage').classList.add('hidden');
    freeResult.classList.add('hidden');
    paidResult.classList.remove('hidden');
    window.scrollTo(0, 0);
    poll(jobId);
  }

  /* ---------- 시작: 결제 후 복귀(?jobId=) 또는 로그인 후 복귀 ---------- */
  const resumed = window.PayFlow && PayFlow.resume();
  if (resumed) {
    startPaid(resumed.jobId);
  } else {
    show(0);
    // 새로고침 때 브라우저가 되살린 값도 버튼 선택 상태에 맞춰 둔다.
    const syncButtons = (b) => {
      situationBtns.forEach((x) => x.classList.toggle('on', x.dataset.situation === b.situation));
      genderBtns.forEach((x) => x.classList.toggle('on', x.dataset.gender === b.gender));
      setCalendar(b.calendar || '양력');
    };
    syncButtons(body());
    // 로그인하고 돌아오면 pay-flow.js가 load 직후 입력값을 복원하고 폼 안에 안내문(.form-resume-note)을
    // 남긴다. 그 표시가 있을 때만 단계를 다시 묻지 않고 무료 첫 장을 바로 연다.
    window.addEventListener('load', () => setTimeout(async () => {
      const restoredNote = form.querySelector('.form-resume-note');
      if (!restoredNote) return;
      restoredNote.remove();
      const b = body();
      if (!b.situation || !b.gender || !b.year) return;
      syncButtons(b);
      // 맨 위의 안내문부터 보이게 둔다. 결제 안내로는 아래 고정 버튼이 데려간다.
      if (await preview(b)) document.getElementById('resumeNote').classList.remove('hidden');
    }, 60));
  }
})();

