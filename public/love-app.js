'use strict';
/* 연애 시기 리포트 화면 — 대화형 입력 → 무료 사주 분석(/api/love/preview, 개인 소개는 /api/love/intro로
   나중에 채운다) → 잠금 해제(/api/love,
   로그인·카드 결제는 pay-flow.js) → 결과(/api/status/:jobId).
   입력값은 한 <form id="loveForm"> 안에 모두 있다. 그래야 로그인으로 넘어갈 때 PayFlow.toLogin이
   통째로 저장하고, 돌아와서 복원한 뒤 무료 사주 분석을 다시 열 수 있다.
   서버 응답 문자열은 innerHTML로 넣지 않는다(textContent). 예외는 서버가 엔진 숫자만으로 만든
   12개월 막대(result_visual)뿐이다. */
(function () {
  const form = document.getElementById('loveForm');
  const steps = Array.from(form.querySelectorAll('.stage-step'));
  const wizardProgress = document.getElementById('wizardProgress');
  const backBtn = document.getElementById('backBtn');
  const stageError = document.getElementById('stageError');
  const freeResult = document.getElementById('freeResult');
  const paidResult = document.getElementById('paidResult');
  const unlockBtn = document.getElementById('unlockBtn');
  const errorBlock = document.getElementById('errorBlock');
  const SITUATION_LABEL = { single: '솔로', some: '썸', dating: '연애 중', breakup: '이별 후' };
  let step = 0;
  let startYm = null; // 무료 사주 분석의 12개월 시작 달 — 결제 요청에 실어 같은 12개월로 풀이를 받는다

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const field = (name) => form.elements[name];
  // 화면 전환 때는 부드러운 스크롤 없이 바로 맨 위로 옮긴다. 긴 소개 아래에서 시작해도 첫 질문이 바로 보인다.
  const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const brand = window.LoveBrand;
  const landing = document.getElementById('loveLanding');
  const stage = document.getElementById('stage');
  let disposeFreeReader = null;
  let disposePaidReader = null;
  function enhanceReading(targetId, legacyId, buildModel, options) {
    const target = document.getElementById(targetId);
    const legacy = document.getElementById(legacyId);
    try {
      const model = buildModel();
      const cleanup = window.LoveReadingView.render(target, model, options);
      target.classList.remove('hidden');
      legacy.classList.add('reader-replaced');
      return cleanup;
    } catch (error) {
      target.replaceChildren();
      target.classList.add('hidden');
      legacy.classList.remove('reader-replaced');
      console.warn('결과 화면을 기본 읽기 방식으로 표시합니다.');
      return null;
    }
  }
  const price = brand.product.priceKrw.toLocaleString('ko-KR') + '원';
  document.querySelectorAll('[data-love-price]').forEach((node) => { node.textContent = price; });
  unlockBtn.textContent = price + '으로 전체 풀이 열기';
  document.getElementById('stickyUnlock').textContent = '전체 풀이 확인 · ' + price;
  document.getElementById('characterDisclosure').textContent = brand.character.disclosure;
  brand.product.chapters.forEach((title) => document.getElementById('productChapters').appendChild(el('li', null, title)));
  const portrait = document.getElementById('characterPortrait');
  // 캐릭터 원본이 없거나 로드 실패하면 장식 표지를 유지한다. 외부 이미지 추적 URL은 받지 않는다.
  if (typeof brand.character.portrait === 'string' && /^\/love-assets\/[a-zA-Z0-9/_-]+\.(webp|png|jpg)$/.test(brand.character.portrait)) {
    portrait.addEventListener('load', () => { portrait.hidden = false; document.getElementById('portraitWrap').classList.add('has-portrait'); });
    portrait.addEventListener('error', () => { portrait.hidden = true; document.getElementById('portraitWrap').classList.remove('has-portrait'); });
    portrait.src = brand.character.portrait;
  }
  function enterInput() {
    landing.classList.add('hidden');
    stage.classList.remove('hidden');
    show(step);
    toTop();
    const first = steps[step].querySelector('button, input:not([type=hidden])');
    if (first) first.focus({ preventScroll: true });
  }
  document.getElementById('startLove').addEventListener('click', enterInput);
  document.getElementById('startLoveBottom').addEventListener('click', enterInput);
  document.getElementById('startLoveDock').addEventListener('click', enterInput);
  const concern = new URLSearchParams(location.search).get('concern');
  if (Object.prototype.hasOwnProperty.call(SITUATION_LABEL, concern)) {
    field('situation').value = concern;
    form.querySelectorAll('[data-situation]').forEach(b => b.classList.toggle('on', b.dataset.situation === concern));
  }
  document.getElementById('closeInput').addEventListener('click', () => {
    stage.classList.add('hidden');
    landing.classList.remove('hidden');
    document.getElementById('startLove').focus();
    toTop();
  });

  /* ---------- 입력 무대 ---------- */
  function show(i) {
    step = i;
    steps.forEach((s, k) => { s.hidden = k !== i; });
    wizardProgress.style.width = ((i + 1) / steps.length * 100) + '%';
    wizardProgress.parentElement.setAttribute('aria-valuenow', String(i + 1));
    document.getElementById('wizardCount').textContent = String(i + 1).padStart(2, '0') + ' / 07';
    if (i === 4) renderFocusChoices();
    if (i === 6) renderReview();
    backBtn.disabled = i === 0;
    stageError.hidden = true;
    const first = steps[i].querySelector('input:not([type=hidden]):not([type=checkbox])');
    // 잠깐 뒤에 첫 칸으로 옮기되, 그사이 사용자가 이 단계의 다른 칸을 눌렀으면 그대로 둔다.
    if (first && i > 0) setTimeout(() => { if (step === i && !steps[i].contains(document.activeElement)) first.focus({ preventScroll: true }); }, 50);
  }
  function stageFail(msg) {
    stageError.querySelector('.q').textContent = msg;
    stageError.hidden = false;
  }
  function validate(i) {
    if (i === 3 && !field('situation').value) return '지금 상황을 하나 골라 주세요.';
    if (i === 0 && !field('gender').value) return '성별을 골라 주세요. 연애운 계산에 쓰여요.';
    const intIn = (v, lo, hi) => /^\d+$/.test(String(v).trim()) && Number(v) >= lo && Number(v) <= hi;
    if (i === 1) {
      const yv = field('year').value, mv = field('month').value, dv = field('day').value;
      if (!intIn(yv, 1900, new Date().getFullYear()) || !intIn(mv, 1, 12) || !intIn(dv, 1, 31)) return '태어난 해·달·날을 숫자로 적어 주세요.';
      if (field('calendar').value !== '음력') {
        const d = new Date(Date.UTC(Number(yv), Number(mv) - 1, Number(dv)));
        if (d.getUTCMonth() !== Number(mv) - 1) return `${mv}월에는 ${dv}일이 없어요. 날짜를 다시 확인해 주세요.`;
        if (d.getTime() > Date.now()) return '아직 오지 않은 날짜예요. 생년월일을 다시 확인해 주세요.';
      }
    }
    if (i === 2 && !field('hourUnknown').checked) {
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

  function markOn(buttons, on) { buttons.forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', String(b === on)); }); }
  const situationBtns = Array.from(form.querySelectorAll('[data-situation]'));
  situationBtns.forEach((b) => b.addEventListener('click', () => {
    field('situation').value = b.dataset.situation;
    markOn(situationBtns, b);
    renderFocusChoices();
    next();
  }));
  const genderBtns = Array.from(form.querySelectorAll('[data-gender]'));
  genderBtns.forEach((b) => b.addEventListener('click', () => { field('gender').value = b.dataset.gender; markOn(genderBtns, b); stageError.hidden = true; next(); }));
  const FOCUS = {
    single: [['timing', '다음 인연은 언제쯤 올까요?'], ['person', '어떤 사람과 서로 끌릴까요?'], ['pattern', '왜 비슷한 연애를 반복할까요?'], ['action', '새 인연을 위해 무엇부터 할까요?']],
    some: [['person', '서로 끌리는 지점이 궁금해요'], ['timing', '다가가기 좋은 흐름을 알고 싶어요'], ['pattern', '썸에서 늘 막히는 이유가 궁금해요'], ['action', '지금 어떻게 다가가면 좋을까요?']],
    dating: [['pattern', '반복되는 갈등을 돌아보고 싶어요'], ['person', '사랑할 때 내 모습을 알고 싶어요'], ['timing', '관계를 깊게 할 흐름이 궁금해요'], ['action', '지금 관계에 필요한 행동이 뭘까요?']],
    breakup: [['pattern', '지난 연애의 패턴을 돌아보고 싶어요'], ['timing', '새로운 인연의 흐름이 궁금해요'], ['person', '다음에는 어떤 사람에게 끌릴까요?'], ['action', '이별 뒤 무엇부터 하면 좋을까요?']]
  };
  function focusLabel() {
    const item = (FOCUS[field('situation').value] || FOCUS.single).find(x => x[0] === field('readingFocus').value);
    return item ? item[1] : '전체 이야기';
  }
  function renderFocusChoices() {
    const box = document.getElementById('focusChoices');
    box.replaceChildren();
    document.getElementById('focusKicker').textContent = ({ single:'새 인연을 기다리는 당신에게', some:'누군가를 마음에 둔 당신에게', dating:'지금 사랑하고 있는 당신에게', breakup:'이별을 지나고 있는 당신에게' })[field('situation').value] || '먼저 읽고 싶은 이야기';
    (FOCUS[field('situation').value] || FOCUS.single).forEach(([value, label]) => {
      const button = el('button', 'choice', label); button.type = 'button'; button.dataset.focus = value;
      button.classList.toggle('on', field('readingFocus').value === value);
      button.setAttribute('aria-pressed', String(field('readingFocus').value === value));
      button.addEventListener('click', () => { field('readingFocus').value = value; next(); });
      box.appendChild(button);
    });
  }
  document.getElementById('skipFocus').addEventListener('click', () => { field('readingFocus').value = ''; next(); });
  function renderReview() {
    const name = field('name').value.trim();
    document.getElementById('reviewTitle').textContent = name ? name + '님, 이 정보가 맞나요?' : '이 정보로 읽어 드릴까요?';
    const rows = [
      ['성별', field('gender').value === '여' ? '여자' : '남자', 0],
      ['생년월일', field('year').value + '.' + field('month').value.padStart(2,'0') + '.' + field('day').value.padStart(2,'0') + ' · ' + field('calendar').value + (field('isLeap').checked ? ' 윤달' : ''), 1],
      ['태어난 시각', field('hourUnknown').checked ? '시각 모름' : field('hour').value.padStart(2,'0') + ':' + (field('minute').value || '0').padStart(2,'0'), 2],
      ['지금의 연애', SITUATION_LABEL[field('situation').value] || '', 3],
      ['먼저 볼 이야기', focusLabel(), 4],
      ['이름', name || '입력하지 않음', 5]
    ];
    const box = document.getElementById('wizardReview'); box.replaceChildren();
    rows.forEach(([label, value, to]) => {
      const row = el('div'); row.appendChild(el('dt', null, label));
      const description = el('dd'); description.appendChild(el('span', null, value));
      const edit = el('button', null, '수정'); edit.type = 'button'; edit.dataset.edit = String(to); edit.setAttribute('aria-label', label + ' 수정'); edit.addEventListener('click', () => show(to));
      description.appendChild(edit); row.appendChild(description); box.appendChild(row);
    });
  }
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
      readingFocus: field('readingFocus').value,
      deliveryEmail: field('deliveryEmail').value.trim(),
      deliveryConsent: field('deliveryConsent').checked,
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

  /* ---------- 무료 사주 분석 ---------- */
  // 세 번째로 강한 달 카드와 AI 개인 소개 칸. 소개는 나중에 채워지고, 실패하면 칸이 사라진다.
  function addFreeExtras(r, b) {
    if (!window.FreeExtras) return;
    const intro = FreeExtras.introCard('/api/love/intro', { ...b, deliveryEmail: undefined }, { title: (b.name ? b.name + '님은' : '당신은') + ' 이런 사람이에요' });
    const third = FreeExtras.thirdCard(r.third, { title: '인연 신호가 세 번째로 강한 달', rankLabel: '좋은 세 달 중 3위' });
    const reader = document.querySelector('#freeReader:not(.hidden) .lr-reader');
    if (reader) {
      const lead = reader.querySelector('.lr-lead');
      if (lead) lead.after(intro); else reader.prepend(intro);
      // 3위 달 카드는 1·2위 잠금 카드 바로 앞에 둔다(잠금 카드가 "세 번째 달을 봤다면"으로 이어진다).
      const seasonsCh = reader.querySelector('[data-chapter-id="seasons"]');
      const lock = seasonsCh && seasonsCh.querySelector('.lr-teaser');
      if (third) { if (lock) lock.before(third); else (seasonsCh || reader).appendChild(third); }
    } else {
      document.getElementById('freeLead').after(intro);
      if (third) document.getElementById('seasons').after(third);
    }
  }

  function renderFree(r, b) {
    const who = b.name || '고객';
    document.getElementById('foldedText').textContent =
      `${SITUATION_LABEL[b.situation] || ''} · ${b.year}.${b.month}.${b.day}${b.calendar === '음력' ? ' (음력)' : ''} · ${b.gender}`;
    document.getElementById('freeTitle').textContent = `${who}님의 무료 사주 분석`;
    document.getElementById('freeLead').textContent = r.strongCount > 0
      ? `앞으로 12개월 중 인연 신호가 강한 달이 ${r.strongCount}번 있어요. 그중 세 번째로 강한 달은 아래에서 먼저 보여 드리고, 가장 강한 두 달은 전체 풀이에서 알려 드릴게요.`
      : '앞으로 12개월은 잔잔한 흐름이 길어요. 그래도 그중 나은 세 달은 분명히 있어요. 세 번째 달은 아래에서, 가장 나은 두 달은 전체 풀이에서 알려 드릴게요.';

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

    if (window.LoveReadingModel && window.LoveReadingView) {
      if (disposeFreeReader) disposeFreeReader();
      disposeFreeReader = enhanceReading('freeReader', 'legacyFreeReading', () => window.LoveReadingModel.buildFree(r, b), { onUnlock: openCheckout });
      if (window.SajuChart) SajuChart.replace(document.querySelector('#freeReader .lr-profile'), r.chart);
    }
    addFreeExtras(r, b);

    document.body.classList.add('done');
    landing.classList.add('hidden');
    document.getElementById('stage').classList.add('hidden');
    freeResult.classList.remove('hidden');
    if (window.SoTrack && SoTrack.freeResult) SoTrack.freeResult('love_timing');
    toTop();
  }

  async function preview(b) {
    const btn = document.getElementById('previewBtn');
    btn.disabled = true;
    btn.textContent = '당신의 사주를 읽고 있어요…';
    form.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/api/love/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '무료 사주 분석을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      renderFree(data.reading, b);
      return true;
    } catch (e) {
      stageFail(e.message);
      return false;
    } finally {
      btn.disabled = false;
      btn.textContent = '내 연애 무료 사주 분석 보기';
      form.removeAttribute('aria-busy');
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
    toTop();
  });

  /* ---------- 잠금 해제(결제) ---------- */
  function showError(msg) {
    errorBlock.textContent = msg;
    errorBlock.classList.remove('hidden');
    errorBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  const checkoutSheet = document.getElementById('checkoutSheet');
  const checkoutConfirm = document.getElementById('checkoutConfirm');
  let checkoutTrigger = null;
  let purchasing = false;
  function openCheckout(event) {
    if (purchasing || checkoutSheet.open) return;
    checkoutTrigger = event && event.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;
    checkoutSheet.showModal();
    if (window.SoTrack && SoTrack.unlockClick) SoTrack.unlockClick('love_timing');
    document.body.classList.add('checkout-open');
    document.getElementById('closeCheckout').focus({ preventScroll: true });
  }
  function closeCheckout() { checkoutSheet.close(); }
  checkoutSheet.addEventListener('close', () => {
    document.body.classList.remove('checkout-open');
    if (checkoutTrigger && checkoutTrigger.isConnected) checkoutTrigger.focus({ preventScroll: true });
  });
  checkoutSheet.addEventListener('click', (event) => {
    if (event.target !== checkoutSheet) return;
    const rect = checkoutSheet.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeCheckout();
  });
  document.getElementById('closeCheckout').addEventListener('click', closeCheckout);
  unlockBtn.addEventListener('click', openCheckout);
  document.getElementById('stickyUnlock').addEventListener('click', openCheckout);
  freeResult.addEventListener('love:unlock', openCheckout);
  // 가격 안내(point-notice.js)의 "로그인하고 계속하기" 링크도 입력값을 저장하고 넘어가게 한다.
  document.getElementById('pointNotice').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/login.html"]');
    if (!a) return;
    e.preventDefault();
    PayFlow.toLogin(form);
  });
  checkoutConfirm.addEventListener('click', async () => {
    if (purchasing) return;
    const deliveryEmail = field('deliveryEmail');
    const deliveryError = document.getElementById('deliveryError');
    if (!deliveryEmail.value.trim() || !deliveryEmail.checkValidity() || !field('deliveryConsent').checked) {
      deliveryError.textContent = !deliveryEmail.value.trim() || !deliveryEmail.checkValidity() ? 'PDF를 받을 이메일을 정확히 입력해 주세요.' : 'PDF 전달을 위한 이메일 사용에 동의해 주세요.';
      deliveryError.hidden = false;
      (!deliveryEmail.value.trim() || !deliveryEmail.checkValidity() ? deliveryEmail : field('deliveryConsent')).focus();
      return;
    }
    deliveryError.hidden = true;
    purchasing = true;
    closeCheckout();
    errorBlock.classList.add('hidden');
    const b = body();
    unlockBtn.disabled = true;
    document.getElementById('stickyUnlock').disabled = true;
    checkoutConfirm.disabled = true;
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
      document.getElementById('stickyUnlock').disabled = false;
      checkoutConfirm.disabled = false;
      purchasing = false;
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
  // 강한 세 달 카드 — 순위는 서버가 엔진 숫자로 만든 그래프(data-rank)에서, 뒷면 문장은 이미 생성된 월별 풀이에서 가져온다.
  function topMonthFlips(timeline, report) {
    const bars = Array.from(timeline.querySelectorAll('.love-bar[data-rank]')).sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank));
    if (!bars.length || !window.LoveReadingModel) return null;
    const months = window.LoveReadingModel.buildPaid(report).months || [];
    const box = el('section', 'lr-flips');
    box.setAttribute('aria-label', '인연 신호가 강한 세 달');
    const head = el('p', 'lr-flips-title', '인연 신호가 강한 세 달');
    head.appendChild(el('small', null, '카드를 눌러 뒤집어 보세요'));
    box.appendChild(head);
    const row = el('div', 'lr-flip-row');
    bars.slice(0, 3).forEach((bar, i) => {
      const [year, month] = String(bar.dataset.ym || '').split('-').map(Number);
      const note = months.find((m) => m.month === month && (!m.year || m.year === year));
      const flow = note ? ((note.parts && note.parts[0] && note.parts[0].text) || note.text || '') : '';
      const first = (/^.*?[.!?](?=\s|$)/.exec(flow) || [flow])[0];
      const rank = ['가장 강한 달', '두 번째로 강한 달', '세 번째로 강한 달'][i];
      const card = el('button', 'lr-flip');
      card.type = 'button';
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-label', rank + ' ' + year + '년 ' + month + '월. 눌러서 이 달의 흐름 보기');
      const inner = el('span', 'lr-flip-inner');
      const front = el('span', 'lr-flip-front');
      front.append(el('span', 'lr-flip-rank', String(i + 1)));
      const label = el('span', 'lr-flip-label');
      label.append(el('small', null, rank), el('b', null, year + '년 ' + month + '월'));
      front.append(label, el('span', 'lr-flip-hint', '눌러서 보기'));
      const back = el('span', 'lr-flip-back');
      back.setAttribute('aria-hidden', 'true');
      // 글과 강조 구절을 한 덩어리로 감싼다. 뒷면은 가운데 정렬용 flex라 감싸지 않으면 조각마다 따로 놓인다.
      back.appendChild(appendRich(el('span', 'lr-flip-text'), first || '이 달의 풀이는 아래 12개월 장에서 읽을 수 있어요.'));
      inner.append(front, back);
      card.appendChild(inner);
      card.addEventListener('click', () => {
        const on = card.getAttribute('aria-pressed') !== 'true';
        card.setAttribute('aria-pressed', String(on));
        back.setAttribute('aria-hidden', String(!on));
        front.setAttribute('aria-hidden', String(on));
      });
      row.appendChild(card);
    });
    box.appendChild(row);
    // 카드가 처음 화면에 들어오면 첫 카드를 한 번 살짝 기울여 뒤집을 수 있다는 걸 보여 준다(동작 줄이기 설정이면 생략).
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const firstCard = row.querySelector('.lr-flip');
    if (!reduce && firstCard && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (firstCard.getAttribute('aria-pressed') === 'true') return;
        firstCard.classList.add('is-peek');
        firstCard.addEventListener('animationend', () => firstCard.classList.remove('is-peek'), { once: true });
      }, { threshold: 0.8 });
      io.observe(firstCard);
    }
    return box;
  }

  function renderPaid(report, visual, reportId) {
    const sections = parseSections(report);
    const answer = sections.find((s) => s.title === '한 줄 답');
    const months = sections.find((s) => s.title === '앞으로 12개월');
    document.getElementById('paidAnswer').textContent = answer ? answer.text.replace(/\*\*/g, '') : '';
    document.getElementById('loveVisual').innerHTML = visual || '';
    if (window.SajuChart) SajuChart.lift(document.getElementById('loveVisual')); // 서버가 엔진 숫자로만 만든 막대
    document.getElementById('paidTimeline').classList.toggle('hidden', !visual);
    const box = document.getElementById('loveSections');
    box.replaceChildren();
    const contents = document.getElementById('readingContents');
    contents.replaceChildren(el('p', 'love-eyebrow', '나의 풀이 목차'));
    sections.filter((s) => s !== answer && s !== months).forEach((s, index) => {
      const sec = el('section', 'fr-section fr-prose');
      sec.id = 'reading-chapter-' + index;
      const link = el('a', null, s.title);
      link.href = '#' + sec.id;
      contents.appendChild(link);
      sec.appendChild(el('h3', 'fr-h', s.title));
      renderBlock(s.text, sec);
      box.appendChild(sec);
    });
    const list = document.getElementById('monthList');
    list.replaceChildren();
    if (months) {
      months.text.split('\n').forEach((l) => {
        const m = /^\s*-\s*(?:\d{4}년\s*)?(\d{1,2})월:\s*(.+)$/.exec(l);
        if (!m) return;
        const li = el('li'); li.append(el('b', null, m[1] + '월'), el('span', null, m[2]));
        list.appendChild(li);
      });
    }
    document.getElementById('monthsSection').classList.toggle('hidden', !list.children.length);
    document.getElementById('progressBlock').classList.add('hidden');
    document.getElementById('paidReading').classList.remove('hidden');
    document.getElementById('paidActions').classList.remove('hidden');
    if (window.LoveReadingModel && window.LoveReadingView) {
      if (disposePaidReader) disposePaidReader();
      disposePaidReader = enhanceReading('paidReader', 'paidReading', () => window.LoveReadingModel.buildPaid(report), { reportId });
      // 12개월 그래프는 결론 바로 아래에 둔다. 맨 끝에 두면 다 읽은 뒤에야 강한 달을 볼 수 있다.
      const lead = document.querySelector('#paidReader .lr-lead');
      const timeline = document.getElementById('paidTimeline');
      if (lead && visual) {
        timeline.classList.add('lr-summary-chart');
        lead.after(timeline);
        const flips = topMonthFlips(timeline, report);
        if (flips) timeline.after(flips);
      }
    }
  }

  let deliveryJobId = null;
  let deliveryTimer = null;
  function updateDelivery(data, jobId) {
    deliveryJobId = jobId;
    const link = document.getElementById('lovePdfDownload');
    link.classList.toggle('hidden', !data.hasPdf);
    if (data.hasPdf) link.href = '/api/download/' + encodeURIComponent(jobId);
    const state = data.delivery;
    const message = document.getElementById('deliveryStatus');
    const retry = document.getElementById('retryDelivery');
    retry.classList.toggle('hidden', !state || !state.canRetry);
    message.textContent = !state ? '' : state.exhausted && state.status !== 'sent' ? '이메일 전송을 완료했는지 확인할 수 없어요. PDF 내려받기를 이용하거나 sooky2001@gmail.com으로 문의해 주세요.' : state.status === 'sent' ? 'PDF 이메일 발송을 요청했어요. 받은편지함과 스팸함을 확인해 주세요.' : state.status === 'failed' ? '이메일 전송에 실패했어요. PDF는 바로 내려받을 수 있어요. 잠시 후 다시 보내기를 시도해 주세요.' : 'PDF 이메일을 보내고 있어요. PDF는 지금 내려받을 수 있어요.';
    clearTimeout(deliveryTimer);
    if (state && state.status !== 'sent' && !state.canRetry && !state.exhausted) {
      deliveryTimer = setTimeout(async () => {
        try {
          const response = await fetch('/api/status/' + encodeURIComponent(jobId));
          if (response.ok) updateDelivery(await response.json(), jobId);
        } catch (_) { message.textContent = '전송 상태를 확인하지 못했어요. PDF를 내려받거나 페이지를 새로고침해 주세요.'; }
      }, state.status === 'failed' ? 60000 : 5000);
    }
  }
  document.getElementById('retryDelivery').addEventListener('click', async function () {
    this.disabled = true;
    try {
      const response = await fetch('/api/love/' + encodeURIComponent(deliveryJobId) + '/delivery', { method: 'POST' });
      if (!response.ok) throw new Error('retry failed');
      const data = await response.json();
      updateDelivery({ hasPdf: true, delivery: data.delivery }, deliveryJobId);
    } catch (_) { document.getElementById('deliveryStatus').textContent = '전송 요청에 실패했어요. PDF 내려받기를 이용해 주세요.'; }
    finally { this.disabled = false; }
  });

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
      if (data.status === 'done') {
        renderPaid(data.report, data.visual, jobId);
        updateDelivery(data, jobId);
        return;
      }
      if (data.status === 'error') return paidFail(data.error || '생성 중 문제가 생겼어요. 결제는 자동으로 취소돼요.');
      setTimeout(() => poll(jobId), 2500);
    } catch (e) {
      setTimeout(() => poll(jobId), 4000);
    }
  }

  function startPaid(jobId) {
    document.body.classList.add('done');
    landing.classList.add('hidden');
    document.getElementById('stage').classList.add('hidden');
    freeResult.classList.add('hidden');
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
    // 새로고침 때 브라우저가 되살린 값도 버튼 선택 상태에 맞춰 둔다.
    const syncButtons = (b) => {
      markOn(situationBtns, situationBtns.find(x => x.dataset.situation === b.situation));
      markOn(genderBtns, genderBtns.find(x => x.dataset.gender === b.gender));
      setCalendar(b.calendar || '양력');
    };
    syncButtons(body());
    // 로그인하고 돌아오면 pay-flow.js가 load 직후 입력값을 복원하고 폼 안에 안내문(.form-resume-note)을
    // 남긴다. 그 표시가 있을 때만 단계를 다시 묻지 않고 무료 사주 분석을 바로 연다.
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

