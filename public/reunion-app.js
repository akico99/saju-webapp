'use strict';
/* 「다시, 우리」 화면 — 한 질문씩 입력 → 무료 첫 장(/api/reunion/preview, AI 호출 없음) → 구매 시트 →
   유료 생성(/api/reunion, 로그인·카드 결제는 pay-flow.js) → 결과(/api/status/:jobId).
   입력값은 <form id="reunionForm"> 하나에 모두 있다(PayFlow.toLogin이 통째로 저장·복원한다).
   서버 문자열은 textContent로만 넣는다. 예외는 서버가 엔진 숫자만으로 만든 12개월 막대(result_visual)뿐이다.
   유료 읽기 화면은 연애 상품의 LoveReadingModel/LoveReadingView를 그대로 쓴다. */
(function () {
  const form = document.getElementById('reunionForm');
  const steps = Array.from(form.querySelectorAll('.stage-step'));
  const total = steps.length;
  const wizardProgress = document.getElementById('wizardProgress');
  const backBtn = document.getElementById('backBtn');
  const stageError = document.getElementById('stageError');
  const landing = document.getElementById('landing');
  const stage = document.getElementById('stage');
  const freeResult = document.getElementById('freeResult');
  const paidResult = document.getElementById('paidResult');
  const unlockBtn = document.getElementById('unlockBtn');
  const stickyUnlock = document.getElementById('stickyUnlock');
  const errorBlock = document.getElementById('errorBlock');
  const LABEL = {
    since: { m1: '1개월 이내', m6: '1~6개월', y1: '6개월~1년', y1plus: '1년 이상' },
    initiator: { me: '내가 먼저', them: '그 사람이 먼저', mutual: '서로' },
    contact: { sometimes: '가끔 연락해요', cut: '연락이 끊겼어요', blocked: '차단됐어요' }
  };
  const PRICE = 14900;
  let step = 0;
  let startYm = null;
  let disposePaidReader = null;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const field = (name) => form.elements[name];
  const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const price = PRICE.toLocaleString('ko-KR') + '원';
  document.querySelectorAll('[data-price]').forEach((n) => { n.textContent = price; });
  unlockBtn.textContent = price + '으로 전체 풀이 열기';
  stickyUnlock.textContent = '전체 풀이 열기 · ' + price;

  function enterInput() {
    landing.classList.add('hidden');
    stage.classList.remove('hidden');
    show(step);
    toTop();
  }
  ['startBtn', 'startBtnBottom', 'startBtnDock'].forEach((id) => document.getElementById(id).addEventListener('click', enterInput));
  document.getElementById('closeInput').addEventListener('click', () => {
    stage.classList.add('hidden');
    landing.classList.remove('hidden');
    document.getElementById('startBtn').focus();
    toTop();
  });

  /* ---------- 입력 ---------- */
  function show(i) {
    step = i;
    steps.forEach((s, k) => { s.hidden = k !== i; });
    wizardProgress.style.width = ((i + 1) / total * 100) + '%';
    wizardProgress.parentElement.setAttribute('aria-valuenow', String(i + 1));
    document.getElementById('wizardCount').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
    if (i === total - 1) renderReview();
    backBtn.disabled = i === 0;
    stageError.hidden = true;
    const first = steps[i].querySelector('input:not([type=hidden]):not([type=checkbox])');
    if (first && i > 0) setTimeout(() => { if (step === i && !steps[i].contains(document.activeElement)) first.focus({ preventScroll: true }); }, 50);
  }
  function stageFail(msg) { stageError.querySelector('.q').textContent = msg; stageError.hidden = false; }
  const intIn = (v, lo, hi) => /^\d+$/.test(String(v).trim()) && Number(v) >= lo && Number(v) <= hi;
  function checkDate(p, who) {
    const yv = field(p + 'Year').value, mv = field(p + 'Month').value, dv = field(p + 'Day').value;
    if (!intIn(yv, 1900, new Date().getFullYear()) || !intIn(mv, 1, 12) || !intIn(dv, 1, 31)) return who + ' 태어난 해·달·날을 숫자로 적어 주세요.';
    if (field(p + 'Calendar').value !== '음력') {
      const d = new Date(Date.UTC(Number(yv), Number(mv) - 1, Number(dv)));
      if (d.getUTCMonth() !== Number(mv) - 1) return mv + '월에는 ' + dv + '일이 없어요. 날짜를 다시 확인해 주세요.';
      if (d.getTime() > Date.now()) return '아직 오지 않은 날짜예요. 다시 확인해 주세요.';
    }
    return null;
  }
  function checkHour(p) {
    if (field(p + 'HourUnknown').checked) return null;
    if (!intIn(field(p + 'Hour').value, 0, 23)) return '태어난 시(0~23)를 적거나 "시각을 몰라요"를 골라 주세요.';
    const mi = field(p + 'Minute').value;
    if (mi !== '' && !intIn(mi, 0, 59)) return '태어난 분은 0~59로 적어 주세요. 모르면 비워 두세요.';
    return null;
  }
  function validate(i) {
    switch (i) {
      case 0: return field('aGender').value ? null : '당신의 성별을 골라 주세요.';
      case 1: return checkDate('a', '당신이');
      case 2: return checkHour('a');
      case 3: return field('bGender').value ? null : '그 사람의 성별을 골라 주세요.';
      case 4: return checkDate('b', '그 사람이');
      case 5: return checkHour('b');
      case 7: return field('since').value ? null : '헤어진 지 얼마나 됐는지 골라 주세요.';
      case 8: return field('initiator').value ? null : '누가 먼저 이별을 말했는지 골라 주세요.';
      case 9: return field('contact').value ? null : '지금 연락 상태를 골라 주세요.';
      default: return null;
    }
  }
  function next() {
    const err = validate(step);
    if (err) return stageFail(err);
    if (step < total - 1) show(step + 1);
  }
  function markOn(buttons, on) { buttons.forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', String(b === on)); }); }
  const pickBtns = Array.from(form.querySelectorAll('[data-pick]'));
  function syncPicks() {
    const groups = {};
    pickBtns.forEach((b) => { (groups[b.dataset.pick] = groups[b.dataset.pick] || []).push(b); });
    Object.keys(groups).forEach((name) => markOn(groups[name], groups[name].find((b) => b.dataset.value === field(name).value)));
  }
  pickBtns.forEach((b) => b.addEventListener('click', () => {
    field(b.dataset.pick).value = b.dataset.value;
    syncPicks();
    stageError.hidden = true;
    next();
  }));
  function setCalendar(p, value) {
    field(p + 'Calendar').value = value;
    const btns = Array.from(form.querySelectorAll('[data-calendar="' + p + '"]'));
    markOn(btns, btns.find((b) => b.dataset.value === value));
    form.querySelector('[data-leap="' + p + '"]').hidden = value !== '음력';
    if (value !== '음력') field(p + 'IsLeap').checked = false;
  }
  form.querySelectorAll('[data-calendar]').forEach((b) => b.addEventListener('click', () => setCalendar(b.dataset.calendar, b.dataset.value)));
  ['a', 'b'].forEach((p) => field(p + 'HourUnknown').addEventListener('change', () => {
    const off = field(p + 'HourUnknown').checked;
    field(p + 'Hour').disabled = off; field(p + 'Minute').disabled = off;
    if (off) { field(p + 'Hour').value = ''; field(p + 'Minute').value = ''; }
  }));
  form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', next));
  backBtn.addEventListener('click', () => { if (step > 0) show(step - 1); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < total - 1) { e.preventDefault(); next(); }
  });

  const dateText = (p) => field(p + 'Year').value + '.' + field(p + 'Month').value.padStart(2, '0') + '.' + field(p + 'Day').value.padStart(2, '0') + ' · ' + field(p + 'Calendar').value + (field(p + 'IsLeap').checked ? ' 윤달' : '');
  const hourText = (p) => field(p + 'HourUnknown').checked ? '시각 모름' : field(p + 'Hour').value.padStart(2, '0') + ':' + (field(p + 'Minute').value || '0').padStart(2, '0');
  const genderText = (p) => field(p + 'Gender').value === '여' ? '여자' : '남자';
  function renderReview() {
    const a = field('aName').value.trim(), b = field('bName').value.trim();
    document.getElementById('reviewTitle').textContent = a ? a + '님, 이 정보가 맞나요?' : '이 정보로 읽어 드릴까요?';
    const rows = [
      ['나', genderText('a') + ' · ' + dateText('a'), 1], ['내 태어난 시각', hourText('a'), 2],
      ['그 사람', genderText('b') + ' · ' + dateText('b'), 4], ['그 사람의 시각', hourText('b'), 5],
      ['이름', (a || '입력하지 않음') + ' / ' + (b || '그 사람'), 6],
      ['헤어진 지', LABEL.since[field('since').value] || '', 7], ['먼저 말한 쪽', LABEL.initiator[field('initiator').value] || '', 8], ['지금 연락', LABEL.contact[field('contact').value] || '', 9]
    ];
    const box = document.getElementById('wizardReview'); box.replaceChildren();
    rows.forEach(([label, value, to]) => {
      const row = el('div'); row.appendChild(el('dt', null, label));
      const dd = el('dd'); dd.appendChild(el('span', null, value));
      const edit = el('button', null, '수정'); edit.type = 'button'; edit.setAttribute('aria-label', label + ' 수정'); edit.addEventListener('click', () => show(to));
      dd.appendChild(edit); row.appendChild(dd); box.appendChild(row);
    });
  }

  function body() {
    const out = { since: field('since').value, initiator: field('initiator').value, contact: field('contact').value, deliveryEmail: field('deliveryEmail').value.trim(), deliveryConsent: field('deliveryConsent').checked, startYm, name: field('aName').value.trim() };
    ['a', 'b'].forEach((p) => {
      ['Gender', 'Calendar', 'Year', 'Month', 'Day', 'Hour', 'Minute', 'Name'].forEach((k) => { out[p + k] = field(p + k).value.trim ? field(p + k).value.trim() : field(p + k).value; });
      out[p + 'IsLeap'] = field(p + 'IsLeap').checked;
      out[p + 'HourUnknown'] = field(p + 'HourUnknown').checked;
    });
    return out;
  }

  /* ---------- 무료 첫 장 ---------- */
  function section(title, cls) { const s = el('section', 'fr-section' + (cls ? ' ' + cls : '')); s.appendChild(el('h3', 'fr-h', title)); return s; }
  function pillarRow(pillars, label) {
    const wrap = el('div', 'reunion-pillar-row');
    wrap.appendChild(el('p', 'reunion-who', label));
    const row = el('div', 'love-pillars' + (pillars.length === 3 ? ' three' : ''));
    pillars.forEach((p) => {
      const box = el('div', 'love-pillar' + (p.key === 'day' ? ' day' : ''));
      box.append(el('span', null, p.key === 'day' ? '일주' : p.ko), el('b', null, p.hanja), el('small', null, p.ganzi));
      row.appendChild(box);
    });
    wrap.appendChild(row);
    return wrap;
  }
  function list(items, cls) { const ul = el('ul', cls); items.forEach((t) => ul.appendChild(el('li', null, t))); return ul; }
  function teaser(title, description) {
    const card = el('div', 'reunion-teaser');
    card.append(el('strong', null, title), el('p', null, description));
    const veil = el('div', 'reunion-veil'); veil.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) veil.appendChild(el('i'));
    card.appendChild(veil);
    const b = el('button', 'reunion-teaser-btn', '전체 풀이에서 이어 읽기'); b.type = 'button';
    b.setAttribute('aria-label', title + ' — 전체 풀이 구매 안내');
    b.addEventListener('click', openCheckout);
    card.appendChild(b);
    return card;
  }
  function renderFree(r, b) {
    const me = b.aName || '고객', them = b.bName || '그 사람';
    document.getElementById('foldedText').textContent = LABEL.since[b.since] + ' · ' + LABEL.initiator[b.initiator] + ' · ' + LABEL.contact[b.contact];
    const box = document.getElementById('freeReading');
    box.replaceChildren();
    const cover = el('section', 'fr-cover');
    cover.append(el('p', 'fr-eyebrow', '다시, 우리 · 무료 첫 장'), el('h2', 'fr-verdict', me + '님과 ' + them + ', 두 사람의 첫 장'), el('p', 'fr-lead-inv', r.safety));
    box.appendChild(cover);

    const s1 = section('두 사람의 네 기둥');
    s1.append(pillarRow(r.me.pillars, me + '님 · 나를 뜻하는 글자 ' + r.me.ilgan), pillarRow(r.them.pillars, them + ' · 나를 뜻하는 글자 ' + r.them.ilgan));
    if (r.note) s1.appendChild(el('p', 'love-small', r.note));
    box.appendChild(s1);

    const s2 = section('우리를 끌어당긴 것');
    s2.appendChild(list(r.bond.attraction, 'reunion-list is-pull'));
    if (r.bond.toMe) s2.appendChild(el('p', 'love-text', '사주로 보면 그 사람은 나에게 "' + r.bond.toMe + '"으로 다가오고, 나는 그 사람에게 "' + r.bond.toThem + '"으로 다가가요.'));
    box.appendChild(s2);

    const s3 = section('우리가 부딪힌 곳');
    s3.appendChild(list(r.bond.friction, 'reunion-list is-push'));
    s3.appendChild(teaser('같은 장면이 반복된 이유', '부딪힘이 실제로 어떤 장면에서 시작됐는지, 그때 서로 어떻게 반응하기 쉬웠는지 전체 풀이에서 이어 읽어요.'));
    box.appendChild(s3);

    startYm = r.startYm || null;
    const s4 = section('앞으로 12개월, 계절의 흐름');
    s4.appendChild(el('p', 'love-text', r.seasonLead));
    const seasons = el('div', 'love-seasons');
    r.seasons.forEach((s) => {
      const col = el('div', 'love-season lv-' + s.level);
      const bar = el('i'); bar.style.setProperty('--h', Math.max(12, Math.min(100, s.avg)) + '%');
      col.append(bar, el('b', null, s.level), el('small', null, s.label));
      seasons.appendChild(col);
    });
    s4.appendChild(seasons);
    s4.appendChild(teaser(r.story.boundary ? '마음의 흐름이 바뀌는 세 달' : '관계 신호가 강한 세 달', r.story.boundary ? '연락할 때가 아니라, 내 마음을 정리하고 관계를 돌아보기 좋은 달을 알려 드려요.' : '두 사람의 기운이 함께 움직이는 달과, 다가간다면 멈춰야 할 기준을 함께 알려 드려요.'));
    box.appendChild(s4);

    const s5 = section('전체 풀이에서 열리는 장', 'love-locked');
    const ol = el('ol', 'love-locked-list'); r.locked.forEach((t) => ol.appendChild(el('li', null, t)));
    s5.appendChild(ol);
    s5.appendChild(teaser('나를 위한 회복', '내 사주 기질에 맞는 회복 방법을 이번 주, 한 달 뒤로 나눠 드려요.'));
    box.appendChild(s5);

    document.getElementById('unlockTitle').textContent = r.story.boundary ? '경계를 지키며 나를 회복하는 방법까지' : '엇갈린 지점과 앞으로 12개월까지';
    document.body.classList.add('done');
    landing.classList.add('hidden');
    stage.classList.add('hidden');
    freeResult.classList.remove('hidden');
    toTop();
  }

  async function preview(b) {
    const btn = document.getElementById('previewBtn');
    btn.disabled = true; btn.textContent = '두 사람의 사주를 읽고 있어요…';
    form.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/api/reunion/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '첫 장을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      renderFree(data.reading, b);
      return true;
    } catch (e) {
      stageFail(e.message);
      return false;
    } finally {
      btn.disabled = false; btn.textContent = '두 사람의 첫 장 무료로 보기';
      form.removeAttribute('aria-busy');
    }
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    for (let i = 0; i < total; i++) { const err = validate(i); if (err) { show(i); stageFail(err); return; } }
    preview(body());
  });
  document.getElementById('redoBtn').addEventListener('click', () => {
    document.body.classList.remove('done');
    freeResult.classList.add('hidden');
    stage.classList.remove('hidden');
    show(0);
    toTop();
  });

  /* ---------- 구매 ---------- */
  function showError(msg) { errorBlock.textContent = msg; errorBlock.classList.remove('hidden'); errorBlock.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  const sheet = document.getElementById('checkoutSheet');
  const confirmBtn = document.getElementById('checkoutConfirm');
  let trigger = null, purchasing = false;
  function openCheckout(event) {
    if (purchasing || sheet.open) return;
    trigger = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;
    sheet.showModal();
    document.body.classList.add('checkout-open');
    document.getElementById('closeCheckout').focus({ preventScroll: true });
  }
  sheet.addEventListener('close', () => { document.body.classList.remove('checkout-open'); if (trigger && trigger.isConnected) trigger.focus({ preventScroll: true }); });
  sheet.addEventListener('click', (event) => {
    if (event.target !== sheet) return;
    const r = sheet.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) sheet.close();
  });
  document.getElementById('closeCheckout').addEventListener('click', () => sheet.close());
  unlockBtn.addEventListener('click', openCheckout);
  stickyUnlock.addEventListener('click', openCheckout);
  document.getElementById('pointNotice').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/login.html"]');
    if (!a) return;
    e.preventDefault();
    PayFlow.toLogin(form);
  });
  confirmBtn.addEventListener('click', async () => {
    if (purchasing) return;
    const email = field('deliveryEmail');
    const deliveryError = document.getElementById('deliveryError');
    const badEmail = !email.value.trim() || !email.checkValidity();
    if (badEmail || !field('deliveryConsent').checked) {
      deliveryError.textContent = badEmail ? 'PDF를 받을 이메일을 정확히 입력해 주세요.' : 'PDF 전달을 위한 이메일 사용에 동의해 주세요.';
      deliveryError.hidden = false;
      (badEmail ? email : field('deliveryConsent')).focus();
      return;
    }
    deliveryError.hidden = true;
    purchasing = true;
    sheet.close();
    errorBlock.classList.add('hidden');
    const b = body();
    [unlockBtn, stickyUnlock, confirmBtn].forEach((x) => { x.disabled = true; });
    try {
      const res = await fetch('/api/reunion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return startPaid(data.jobId);
      if (data.code === 'already_pending' && data.jobId) return startPaid(data.jobId);
      if (res.status === 401) { PayFlow.toLogin(form); return; }
      if (res.status === 402) { await PayFlow.onInsufficient('reunion', b, data, showError); return; }
      showError(data.error || '요청을 처리하지 못했어요.');
    } catch (e) {
      showError('요청 실패: ' + e.message);
    } finally {
      [unlockBtn, stickyUnlock, confirmBtn].forEach((x) => { x.disabled = false; });
      purchasing = false;
    }
  });

  /* ---------- 결과 ---------- */
  function appendRich(node, s) {
    String(s || '').split(/\*\*/).forEach((part, i) => { if (part) node.appendChild(i % 2 ? el('strong', 'hl', part) : document.createTextNode(part)); });
    return node;
  }
  function parseSections(report) {
    const out = []; let cur = null;
    String(report || '').split(/\n/).forEach((line) => {
      const h = /^##\s+(.+)$/.exec(line);
      if (h) { cur = { title: h[1].trim(), lines: [] }; out.push(cur); return; }
      if (cur) cur.lines.push(line);
    });
    return out.map((s) => ({ title: s.title, text: s.lines.join('\n').trim() }));
  }
  // 기본 읽기 화면 — 연애 읽기 화면 스크립트를 못 불러와도 본문은 읽을 수 있게 한다.
  function renderPlain(report) {
    const sections = parseSections(report);
    const answer = sections.find((s) => s.title === '한 줄 답');
    document.getElementById('paidAnswer').textContent = answer ? answer.text.replace(/\*\*/g, '') : '';
    const box = document.getElementById('paidSections'); box.replaceChildren();
    sections.filter((s) => s !== answer).forEach((s) => {
      const sec = el('section', 'fr-section fr-prose');
      sec.appendChild(el('h3', 'fr-h', s.title));
      s.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((p) => sec.appendChild(appendRich(el('p'), p)));
      box.appendChild(sec);
    });
  }
  function topMonthFlips(timeline, report) {
    const bars = Array.from(timeline.querySelectorAll('.love-bar[data-rank]')).sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank));
    if (!bars.length || !window.LoveReadingModel) return null;
    const months = window.LoveReadingModel.buildPaid(report).months || [];
    const box = el('section', 'lr-flips');
    box.setAttribute('aria-label', '관계 신호가 강한 세 달');
    const head = el('p', 'lr-flips-title', '관계 신호가 강한 세 달');
    head.appendChild(el('small', null, '재회 날짜가 아니에요 · 카드를 눌러 보세요'));
    box.appendChild(head);
    const row = el('div', 'lr-flip-row');
    bars.slice(0, 3).forEach((bar, i) => {
      const [year, month] = String(bar.dataset.ym || '').split('-').map(Number);
      const note = months.find((m) => m.month === month && (!m.year || m.year === year));
      const flow = note ? ((note.parts && note.parts[0] && note.parts[0].text) || note.text || '') : '';
      const first = (/^.*?[.!?](?=\s|$)/.exec(flow) || [flow])[0];
      const rank = ['가장 강한 달', '두 번째로 강한 달', '세 번째로 강한 달'][i];
      const card = el('button', 'lr-flip'); card.type = 'button';
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-label', rank + ' ' + year + '년 ' + month + '월. 눌러서 이 달의 흐름 보기');
      const inner = el('span', 'lr-flip-inner');
      const front = el('span', 'lr-flip-front');
      front.append(el('span', 'lr-flip-rank', String(i + 1)));
      const label = el('span', 'lr-flip-label'); label.append(el('small', null, rank), el('b', null, year + '년 ' + month + '월'));
      front.append(label, el('span', 'lr-flip-hint', '눌러서 보기'));
      const back = el('span', 'lr-flip-back'); back.setAttribute('aria-hidden', 'true');
      back.appendChild(appendRich(el('span', 'lr-flip-text'), first || '이 달의 풀이는 아래 12개월 장에서 읽을 수 있어요.'));
      inner.append(front, back); card.appendChild(inner);
      card.addEventListener('click', () => {
        const on = card.getAttribute('aria-pressed') !== 'true';
        card.setAttribute('aria-pressed', String(on)); back.setAttribute('aria-hidden', String(!on)); front.setAttribute('aria-hidden', String(on));
      });
      row.appendChild(card);
    });
    box.appendChild(row);
    return box;
  }
  function renderPaid(report, visual, reportId) {
    renderPlain(report);
    document.getElementById('reunionVisual').innerHTML = visual || ''; // 서버가 엔진 숫자로만 만든 막대
    const timeline = document.getElementById('paidTimeline');
    timeline.classList.toggle('hidden', !visual);
    document.getElementById('progressBlock').classList.add('hidden');
    document.getElementById('paidReading').classList.remove('hidden');
    document.getElementById('paidSafety').classList.remove('hidden');
    document.getElementById('paidActions').classList.remove('hidden');
    if (!window.LoveReadingModel || !window.LoveReadingView) return;
    const target = document.getElementById('paidReader');
    try {
      if (disposePaidReader) disposePaidReader();
      disposePaidReader = window.LoveReadingView.render(target, window.LoveReadingModel.buildPaid(report, { title: '다시, 우리' }), { reportId });
      target.classList.remove('hidden');
      document.getElementById('paidReading').classList.add('reader-replaced');
      const lead = target.querySelector('.lr-lead');
      if (lead) lead.after(document.getElementById('paidSafety'));
      if (lead && visual) {
        timeline.classList.add('lr-summary-chart');
        document.getElementById('paidSafety').after(timeline);
        const flips = topMonthFlips(timeline, report);
        if (flips) timeline.after(flips);
      }
    } catch (e) {
      target.replaceChildren(); target.classList.add('hidden');
      document.getElementById('paidReading').classList.remove('reader-replaced');
    }
  }

  let deliveryJobId = null, deliveryTimer = null;
  function updateDelivery(data, jobId) {
    deliveryJobId = jobId;
    const link = document.getElementById('pdfDownload');
    link.classList.toggle('hidden', !data.hasPdf);
    if (data.hasPdf) link.href = '/api/download/' + encodeURIComponent(jobId);
    const state = data.delivery;
    const message = document.getElementById('deliveryStatus');
    document.getElementById('retryDelivery').classList.toggle('hidden', !state || !state.canRetry);
    message.textContent = !state ? '' : state.exhausted && state.status !== 'sent' ? '이메일 전송을 완료했는지 확인할 수 없어요. PDF 내려받기를 이용하거나 sooky2001@gmail.com으로 문의해 주세요.' : state.status === 'sent' ? 'PDF 이메일 발송을 요청했어요. 받은편지함과 스팸함을 확인해 주세요.' : state.status === 'failed' ? '이메일 전송에 실패했어요. PDF는 바로 내려받을 수 있어요. 잠시 후 다시 보내기를 시도해 주세요.' : 'PDF 이메일을 보내고 있어요. PDF는 지금 내려받을 수 있어요.';
    clearTimeout(deliveryTimer);
    if (state && state.status !== 'sent' && !state.canRetry && !state.exhausted) {
      deliveryTimer = setTimeout(async () => {
        try { const res = await fetch('/api/status/' + encodeURIComponent(jobId)); if (res.ok) updateDelivery(await res.json(), jobId); }
        catch (_) { message.textContent = '전송 상태를 확인하지 못했어요. PDF를 내려받거나 페이지를 새로고침해 주세요.'; }
      }, state.status === 'failed' ? 60000 : 5000);
    }
  }
  document.getElementById('retryDelivery').addEventListener('click', async function () {
    this.disabled = true;
    try {
      const res = await fetch('/api/reunion/' + encodeURIComponent(deliveryJobId) + '/delivery', { method: 'POST' });
      if (!res.ok) throw new Error('retry failed');
      const data = await res.json();
      updateDelivery({ hasPdf: true, delivery: data.delivery }, deliveryJobId);
    } catch (_) { document.getElementById('deliveryStatus').textContent = '전송 요청에 실패했어요. PDF 내려받기를 이용해 주세요.'; }
    finally { this.disabled = false; }
  });
  function paidFail(msg) {
    document.getElementById('progressBlock').classList.add('hidden');
    const e = document.getElementById('paidError'); e.textContent = msg; e.classList.remove('hidden');
  }
  async function poll(jobId) {
    try {
      const res = await fetch('/api/status/' + encodeURIComponent(jobId));
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      if (!res.ok) return paidFail(data.error || '주문을 찾지 못했어요.');
      if (data.status === 'done') { renderPaid(data.report, data.visual, jobId); updateDelivery(data, jobId); return; }
      if (data.status === 'error') return paidFail(data.error || '생성 중 문제가 생겼어요. 결제는 자동으로 취소돼요.');
      setTimeout(() => poll(jobId), 2500);
    } catch (e) { setTimeout(() => poll(jobId), 4000); }
  }
  function startPaid(jobId) {
    document.body.classList.add('done');
    landing.classList.add('hidden'); stage.classList.add('hidden'); freeResult.classList.add('hidden');
    paidResult.classList.remove('hidden');
    toTop();
    poll(jobId);
  }

  /* ---------- 시작: 결제 후 복귀(?jobId=) 또는 로그인 후 복귀 ---------- */
  const resumed = window.PayFlow && PayFlow.resume();
  if (resumed) {
    startPaid(resumed.jobId);
  } else {
    show(0);
    const syncAll = () => { syncPicks(); setCalendar('a', field('aCalendar').value || '양력'); setCalendar('b', field('bCalendar').value || '양력'); };
    syncAll();
    window.addEventListener('load', () => setTimeout(async () => {
      const note = form.querySelector('.form-resume-note');
      if (!note) return;
      note.remove();
      const b = body();
      if (!b.aGender || !b.bGender || !b.aYear || !b.bYear || !b.since || !b.initiator || !b.contact) return;
      syncAll();
      if (await preview(b)) document.getElementById('resumeNote').classList.remove('hidden');
    }, 60));
  }
})();
