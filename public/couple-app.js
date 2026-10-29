'use strict';
// 이 상품만의 그림(안내 인물·분위기가 연애 상품과 다르다). 공용 읽기 화면도 이 표를 쓴다.
window.LOVE_READING_ART = {"greeting":"/couple-assets/cover.webp","greeting-comic":"/couple-assets/cover.webp","cover-comic":"/couple-assets/cover.webp","empathy":"/couple-assets/attract.webp","thinking":"/couple-assets/attract.webp","thread-comic":"/couple-assets/attract.webp","explain":"/couple-assets/flow.webp","explain-comic":"/couple-assets/flow.webp","meeting":"/couple-assets/flow.webp","timing-comic":"/couple-assets/flow.webp","new-start":"/couple-assets/flow.webp","cheer":"/couple-assets/keep.webp","door-comic":"/couple-assets/keep.webp","conversation":"/couple-assets/keep.webp","distance":"/couple-assets/keep.webp","caution":"/couple-assets/keep.webp"};
/* 두 사람의 궁합 화면(/couple.html) — 대화형 입력 → 무료 사주 분석(/api/couple/preview) → 잠금 해제(/api/couple,
   로그인·카드 결제는 pay-flow.js) → 결과(/api/status/:jobId).
   입력값은 한 <form id="coupleForm"> 안에 모두 있다. 로그인으로 넘어갈 때 PayFlow.toLogin이 통째로 저장하고,
   돌아와서 복원한 뒤 무료 사주 분석을 다시 연다. 서버 응답 문자열은 innerHTML로 넣지 않는다(textContent).
   예외는 서버가 엔진 숫자만으로 만든 12개월 막대(result_visual)뿐이다.
   유료 결과는 연애 리포트와 같은 읽기 화면(LoveReadingView)을 쓴다. */
(function () {
  const PRICE = 14900;
  const RELATION_LABEL = { some: '썸', dating: '연애 중', married: '부부·예비부부', crush: '짝사랑' };
  const CHAPTERS = ['서로 끌리는 이유', '잘 맞는 결', '부딪히는 지점과 푸는 법', '연락·대화 방식', '두 사람의 흐름이 함께 좋은 세 달과 앞으로 3년', '관계를 지키는 행동', '앞으로 12개월, 달마다 흐름과 행동'];
  // 읽기 화면의 장 그림 — 공용 모델은 연애 리포트 제목으로 장면을 고르므로 이 상품의 제목에 맞춰 다시 정한다.
  const SCENE_OF = [[/한 줄 답/, 'greeting'], [/끌리는/, 'empathy'], [/잘 맞는/, 'conversation'], [/부딪히는/, 'distance'], [/연락|대화/, 'thinking'], [/12개월 흐름/, 'meeting'], [/지키는|행동/, 'cheer'], [/앞으로 12개월|월별/, 'new-start']];
  const form = document.getElementById('coupleForm');
  const steps = Array.from(form.querySelectorAll('.stage-step'));
  const wizardProgress = document.getElementById('wizardProgress');
  const backBtn = document.getElementById('backBtn');
  const stageError = document.getElementById('stageError');
  const freeResult = document.getElementById('freeResult');
  const paidResult = document.getElementById('paidResult');
  const unlockBtn = document.getElementById('unlockBtn');
  const errorBlock = document.getElementById('errorBlock');
  const landing = document.getElementById('coupleLanding');
  const stage = document.getElementById('stage');
  let step = 0;
  let startYm = null; // 무료 사주 분석의 12개월 시작 달 — 결제 요청에 실어 같은 12개월로 풀이를 받는다
  let disposePaidReader = null;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const field = (name) => form.elements[name];
  const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  const price = PRICE.toLocaleString('ko-KR') + '원';
  document.querySelectorAll('[data-couple-price]').forEach((n) => { n.textContent = price; });
  unlockBtn.textContent = price + '으로 전체 풀이 열기';
  document.getElementById('stickyUnlock').textContent = '함께 좋은 세 달 보기 · ' + price;
  if (window.LoveBrand) document.getElementById('characterDisclosure').textContent = window.LoveBrand.character.disclosure;
  CHAPTERS.forEach((t) => document.getElementById('productChapters').appendChild(el('li', null, t)));

  function enterInput() {
    landing.classList.add('hidden');
    stage.classList.remove('hidden');
    show(step);
    toTop();
    const first = steps[step].querySelector('button, input:not([type=hidden])');
    if (first) first.focus({ preventScroll: true });
  }
  ['startCouple', 'startCoupleBottom', 'startCoupleDock'].forEach((id) => document.getElementById(id).addEventListener('click', enterInput));
  document.getElementById('closeInput').addEventListener('click', () => {
    stage.classList.add('hidden');
    landing.classList.remove('hidden');
    document.getElementById('startCouple').focus();
    toTop();
  });

  /* ---------- 입력 무대 ---------- */
  function show(i) {
    step = i;
    steps.forEach((s, k) => { s.hidden = k !== i; });
    wizardProgress.style.width = ((i + 1) / steps.length * 100) + '%';
    wizardProgress.parentElement.setAttribute('aria-valuenow', String(i + 1));
    document.getElementById('wizardCount').textContent = String(i + 1).padStart(2, '0') + ' / ' + String(steps.length).padStart(2, '0');
    if (i === steps.length - 1) renderReview();
    backBtn.disabled = i === 0;
    stageError.hidden = true;
    const first = steps[i].querySelector('input:not([type=hidden]):not([type=checkbox])');
    if (first && i > 0) setTimeout(() => { if (step === i && !steps[i].contains(document.activeElement)) first.focus({ preventScroll: true }); }, 50);
  }
  function stageFail(msg) {
    stageError.querySelector('.q').textContent = msg;
    stageError.hidden = false;
  }
  const intIn = (v, lo, hi) => /^\d+$/.test(String(v).trim()) && Number(v) >= lo && Number(v) <= hi;
  function dateError(p, who) {
    const yv = field(p + 'Year').value, mv = field(p + 'Month').value, dv = field(p + 'Day').value;
    if (!intIn(yv, 1900, new Date().getFullYear()) || !intIn(mv, 1, 12) || !intIn(dv, 1, 31)) return who + ' 태어난 해·달·날을 숫자로 적어 주세요.';
    if (field(p + 'Calendar').value !== '음력') {
      const d = new Date(Date.UTC(Number(yv), Number(mv) - 1, Number(dv)));
      if (d.getUTCMonth() !== Number(mv) - 1) return mv + '월에는 ' + dv + '일이 없어요. 날짜를 다시 확인해 주세요.';
      if (d.getTime() > Date.now()) return '아직 오지 않은 날짜예요. 생년월일을 다시 확인해 주세요.';
    }
    return null;
  }
  function hourError(p) {
    if (field(p + 'HourUnknown').checked) return null;
    if (!intIn(field(p + 'Hour').value, 0, 23)) return '태어난 시(0~23)를 적거나 "시각을 몰라요"를 골라 주세요.';
    const mi = field(p + 'Minute').value;
    if (mi !== '' && !intIn(mi, 0, 59)) return '태어난 분은 0~59로 적어 주세요. 모르면 비워 두세요.';
    return null;
  }
  function validate(i) {
    if (i === 0 && !field('relation').value) return '두 사람의 관계를 하나 골라 주세요.';
    if (i === 1 && !field('aGender').value) return '당신의 성별을 골라 주세요.';
    if (i === 2) return dateError('a', '당신이');
    if (i === 3) return hourError('a');
    if (i === 4 && !field('bGender').value) return '그 사람의 성별을 골라 주세요.';
    if (i === 5) return dateError('b', '그 사람이');
    if (i === 6) return hourError('b');
    return null;
  }
  function next() {
    const err = validate(step);
    if (err) return stageFail(err);
    if (step < steps.length - 1) show(step + 1);
  }
  function markOn(buttons, on) { buttons.forEach((b) => { b.classList.toggle('on', b === on); b.setAttribute('aria-pressed', String(b === on)); }); }

  const relationBtns = Array.from(form.querySelectorAll('[data-relation]'));
  relationBtns.forEach((b) => b.addEventListener('click', () => { field('relation').value = b.dataset.relation; markOn(relationBtns, b); next(); }));
  const genderBtns = { a: Array.from(form.querySelectorAll('[data-gender][data-person="a"]')), b: Array.from(form.querySelectorAll('[data-gender][data-person="b"]')) };
  ['a', 'b'].forEach((p) => genderBtns[p].forEach((b) => b.addEventListener('click', () => { field(p + 'Gender').value = b.dataset.gender; markOn(genderBtns[p], b); next(); })));
  const calendarBtns = { a: Array.from(form.querySelectorAll('[data-calendar][data-person="a"]')), b: Array.from(form.querySelectorAll('[data-calendar][data-person="b"]')) };
  function setCalendar(p, value) {
    field(p + 'Calendar').value = value;
    markOn(calendarBtns[p], calendarBtns[p].find((b) => b.dataset.calendar === value));
    form.querySelector('[data-leap="' + p + '"]').hidden = value !== '음력';
    if (value !== '음력') field(p + 'IsLeap').checked = false;
  }
  ['a', 'b'].forEach((p) => {
    calendarBtns[p].forEach((b) => b.addEventListener('click', () => setCalendar(p, b.dataset.calendar)));
    field(p + 'HourUnknown').addEventListener('change', () => {
      const off = field(p + 'HourUnknown').checked;
      field(p + 'Hour').disabled = off; field(p + 'Minute').disabled = off;
      if (off) { field(p + 'Hour').value = ''; field(p + 'Minute').value = ''; }
    });
  });
  form.querySelectorAll('[data-next]').forEach((b) => b.addEventListener('click', next));
  backBtn.addEventListener('click', () => { if (step > 0) show(step - 1); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < steps.length - 1) { e.preventDefault(); next(); }
  });

  function birthText(p) {
    const time = field(p + 'HourUnknown').checked ? '시각 모름' : field(p + 'Hour').value.padStart(2, '0') + ':' + (field(p + 'Minute').value || '0').padStart(2, '0');
    return (field(p + 'Gender').value === '여' ? '여자' : '남자') + ' · ' + field(p + 'Year').value + '.' + field(p + 'Month').value.padStart(2, '0') + '.' + field(p + 'Day').value.padStart(2, '0') + ' ' + field(p + 'Calendar').value + (field(p + 'IsLeap').checked ? ' 윤달' : '') + ' · ' + time;
  }
  function renderReview() {
    const a = field('aName').value.trim(), b = field('bName').value.trim();
    document.getElementById('reviewTitle').textContent = a && b ? a + '님과 ' + b + '님, 이 정보가 맞나요?' : '이 정보로 읽어 드릴까요?';
    const rows = [
      ['두 사람의 관계', RELATION_LABEL[field('relation').value] || '', 0],
      ['나', birthText('a'), 2],
      ['그 사람', birthText('b'), 5],
      ['부를 이름', (a || '나') + ' · ' + (b || '그 사람'), 7]
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
    const out = { relation: field('relation').value, deliveryEmail: field('deliveryEmail').value.trim(), deliveryConsent: field('deliveryConsent').checked, startYm };
    ['a', 'b'].forEach((p) => {
      ['Gender', 'Calendar', 'Year', 'Month', 'Day', 'Hour', 'Minute'].forEach((k) => { out[p + k] = field(p + k).value; });
      out[p + 'Name'] = field(p + 'Name').value.trim();
      out[p + 'IsLeap'] = field(p + 'IsLeap').checked;
      out[p + 'HourUnknown'] = field(p + 'HourUnknown').checked;
    });
    return out;
  }

  /* ---------- 무료 사주 분석 (연애 리포트 읽기 화면과 같은 lr-* 디자인) ---------- */
  function art(file, cls, label) {
    const fig = el('figure', 'lr-art ' + cls);
    const img = document.createElement('img');
    img.src = window.LOVE_READING_ART[file] || '/love-assets/reading/' + file + '.webp'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => fig.remove());
    fig.appendChild(img);
    if (label) fig.appendChild(el('figcaption', 'lr-art-label', label));
    return fig;
  }
  function chapter(n, title, artFile, artCls, label) {
    const sec = el('article', 'lr-chapter lr-tone-' + (n % 2));
    const head = el('header', 'lr-head');
    head.appendChild(el('span', 'lr-num', String(n + 1).padStart(2, '0')));
    head.appendChild(el('h2', 'lr-title', title));
    sec.appendChild(head);
    if (artFile) { sec.classList.add('has-art'); sec.appendChild(art(artFile, artCls, label)); }
    return sec;
  }
  function paper(lines) {
    const p = el('div', 'lr-paper');
    lines.forEach(([type, text]) => { if (text) p.appendChild(el(type === 'h' ? 'h3' : 'p', type === 'h' ? 'lr-h3 lr-h3-label' : 'lr-pt', text)); });
    return p;
  }
  function pillarsPanel(person) {
    const box = el('div', 'lr-panel couple-person');
    box.appendChild(el('h3', 'lr-sub', person.name));
    const grid = el('div', 'lr-pillars');
    person.pillars.forEach((p) => {
      const cell = el('div', 'lr-pillar' + (p.key === 'day' ? ' is-day' : ''));
      cell.append(el('span', null, p.key === 'day' ? '일주 · 바탕' : p.ko), el('b', null, p.hanja), el('small', null, p.ganzi));
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    box.appendChild(el('p', 'lr-note', '바탕 글자 ' + person.ilgan.char + ' · ' + person.ilgan.plain + (person.hourUnknown ? ' · 시각 모름(세 기둥)' : '')));
    return box;
  }
  function barsPanel(person) {
    const box = el('div', 'lr-panel lr-balance couple-balance');
    box.appendChild(el('h3', 'lr-sub', person.name + '의 다섯 기운'));
    person.bars.forEach((x) => {
      const row = el('div', 'lr-bar');
      const name = el('span', 'lr-bar-name'); name.append(el('b', null, x.ko + ' ' + x.el), el('em', null, String(x.word).split('·')[0]));
      const track = el('span', 'lr-track'); const fill = el('i');
      fill.style.width = Math.max(0, Math.min(100, Number(x.pct) || 0)) + '%';
      if (/^#[0-9a-fA-F]{3,8}$/.test(x.color)) fill.style.background = x.color;
      track.appendChild(fill);
      row.append(name, track, el('span', 'lr-bar-val', x.count + '개'));
      box.appendChild(row);
    });
    box.appendChild(el('p', 'lr-note', '도움이 되는 기운: ' + person.helper));
    return box;
  }
  function pointList(points) {
    const ul = el('ul', 'couple-points');
    points.forEach((p) => { const li = el('li'); li.append(el('b', null, p.title), el('span', null, p.text)); ul.appendChild(li); });
    return ul;
  }
  // 잠긴 개인 결과는 미리 만들거나 DOM에 싣지 않는다. 가려진 줄은 장식이다.
  function teaser(title, description, timing) {
    const card = el('div', 'lr-panel lr-teaser lr-teaser-inline');
    card.appendChild(el('strong', 'lr-teaser-title', title));
    card.appendChild(el('p', 'lr-teaser-description', description));
    const veiled = el('div', 'lr-veiled'); veiled.setAttribute('aria-hidden', 'true');
    if (timing) { const cal = el('div', 'lr-calendar'); for (let d = 0; d < 12; d++) cal.appendChild(el('i')); veiled.appendChild(cal); }
    else ['끌림이 드러나는 장면', '부딪힐 때 푸는 대화', '함께 지킬 약속'].forEach((t) => { const row = el('div', 'lr-hidden-row'); row.append(el('span', null, t), el('i')); veiled.appendChild(row); });
    card.appendChild(veiled);
    const btn = el('button', 'lr-teaser-lock', '전체 풀이에서 이어 읽기'); btn.type = 'button';
    btn.setAttribute('aria-label', title + ' — 전체 풀이 구매 안내');
    btn.addEventListener('click', openCheckout);
    card.appendChild(btn);
    return card;
  }
  function renderFree(r, b) {
    const [pa, pb] = r.people;
    document.getElementById('foldedText').textContent = (RELATION_LABEL[b.relation] || '') + ' · ' + pa.name + ' ' + b.aYear + '.' + b.aMonth + '.' + b.aDay + ' · ' + pb.name + ' ' + b.bYear + '.' + b.bMonth + '.' + b.bDay;
    startYm = r.startYm || null;
    const box = document.getElementById('freeReader');
    box.replaceChildren();
    const reader = el('div', 'lr-reader lr-free couple-free');
    reader.setAttribute('role', 'region'); reader.setAttribute('aria-label', '두 사람의 궁합 무료 사주 분석');
    reader.appendChild(el('h1', 'lr-main-title', b.aName && b.bName ? b.aName + '님과 ' + b.bName + '님,\n두 사람은\n어떤 사이일까요?' : '두 사람은,\n어떤 사이일까요?'));
    reader.appendChild(el('p', 'lr-lead', r.pull.headline));
    // 두 사람 관계 소개(AI)는 나중에 채운다. 실패하면 칸이 사라진다.
    if (window.FreeExtras) reader.appendChild(FreeExtras.introCard('/api/couple/intro', { ...b, deliveryEmail: undefined }, { title: '두 사람은 이런 사이예요', loading: '수달이 두 사람의 사주를 읽고 소개를 쓰고 있어요…' }));

    const c1 = chapter(0, '두 사람의 네 기둥', 'greeting-comic', 'lr-art-portrait lr-cut-wide', '결의 인사');
    const two = el('div', 'couple-two'); two.append(pillarsPanel(pa), pillarsPanel(pb)); c1.appendChild(two);
    if (window.SajuChart && r.charts) { SajuChart.replace(two.firstChild, r.charts.a); SajuChart.replace(two.lastChild, r.charts.b); two.className = 'couple-charts'; }
    if (r.note) c1.appendChild(el('p', 'lr-note', r.note));
    reader.appendChild(c1);

    const c2 = chapter(1, '끌어당기는 자리, 부딪히는 자리', 'empathy', 'lr-art-portrait lr-cut-tall', '결의 공감');
    c2.appendChild(paper([['p', r.pull.lead], ['h', '서로 끌어당기는 결']]));
    c2.appendChild(pointList(r.pull.points));
    c2.appendChild(paper([['h', '부딪힐 수 있는 자리']]));
    c2.appendChild(pointList(r.clash.points));
    c2.appendChild(teaser('부딪힐 때, 두 사람은 어떻게 풀면 좋을까요?', '다툼이 시작되는 신호와 푸는 대화, 서로 다른 연락 방식까지 전체 풀이에서 이어서 살펴봐요.', false));
    reader.appendChild(c2);

    const c3 = chapter(2, '서로를 채워 주는 기운', 'explain', 'lr-art-portrait lr-cut-wide', '결의 해설');
    c3.appendChild(paper([['p', r.complement.headline + '.']].concat(r.complement.lines.map((t) => ['p', t]))));
    const two2 = el('div', 'couple-two'); two2.append(barsPanel(pa), barsPanel(pb)); c3.appendChild(two2);
    reader.appendChild(c3);

    const c4 = chapter(3, '두 사람의 계절', 'meeting', 'lr-art-scene lr-cut-inset', '만남의 장면');
    c4.appendChild(paper([['p', r.seasonLead]]));
    const seasons = el('div', 'love-seasons couple-seasons');
    r.seasons.forEach((s) => {
      const col = el('div', 'love-season lv-' + s.level);
      const bar = el('i'); bar.style.setProperty('--h', Math.max(12, Math.min(100, Number(s.avg) || 0)) + '%');
      col.append(bar, el('b', null, s.level), el('small', null, s.label));
      seasons.appendChild(col);
    });
    c4.appendChild(seasons);
    const third = window.FreeExtras ? FreeExtras.thirdCard(r.third, { title: '두 사람이 함께 세 번째로 좋은 달', rankLabel: '함께 좋은 세 달 중 3위' }) : null;
    if (third) c4.appendChild(third);
    c4.appendChild(teaser('두 사람의 흐름이 함께 가장 좋은 두 달은?', '세 번째 달을 봤다면, 이제 1·2위 두 달과 달마다 두 사람의 흐름이 어떻게 겹치는지 알아볼 차례예요.', true));
    reader.appendChild(c4);

    const c5 = chapter(4, '전체 풀이에서 열리는 장', 'door-comic', 'lr-art-portrait lr-cut-tall', '결의 응원');
    const locked = el('div', 'lr-panel lr-locked'); locked.appendChild(el('h3', 'lr-sub', '전체 풀이에서 더 알려 드려요'));
    const ul = el('ul'); r.locked.forEach((t) => ul.appendChild(el('li', null, t))); locked.appendChild(ul);
    c5.appendChild(locked);
    reader.appendChild(c5);
    box.appendChild(reader);

    document.body.classList.add('done');
    landing.classList.add('hidden');
    stage.classList.add('hidden');
    freeResult.classList.remove('hidden');
    if (window.SoTrack && SoTrack.freeResult) SoTrack.freeResult('compat_v2');
    toTop();
  }

  async function preview(b) {
    const btn = document.getElementById('previewBtn');
    btn.disabled = true;
    btn.textContent = '두 사람의 사주를 읽고 있어요…';
    form.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/api/couple/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '무료 사주 분석을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      renderFree(data.reading, b);
      return true;
    } catch (e) {
      stageFail(e.message);
      return false;
    } finally {
      btn.disabled = false;
      btn.textContent = '두 사람의 무료 사주 분석 보기';
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
    stage.classList.remove('hidden');
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
    if (window.SoTrack && SoTrack.unlockClick) SoTrack.unlockClick('compat_v2');
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
    const badEmail = !deliveryEmail.value.trim() || !deliveryEmail.checkValidity();
    if (badEmail || !field('deliveryConsent').checked) {
      deliveryError.textContent = badEmail ? 'PDF를 받을 이메일을 정확히 입력해 주세요.' : 'PDF 전달을 위한 이메일 사용에 동의해 주세요.';
      deliveryError.hidden = false;
      (badEmail ? deliveryEmail : field('deliveryConsent')).focus();
      return;
    }
    deliveryError.hidden = true;
    purchasing = true;
    closeCheckout();
    errorBlock.classList.add('hidden');
    const b = body();
    const sticky = document.getElementById('stickyUnlock');
    unlockBtn.disabled = true; sticky.disabled = true; checkoutConfirm.disabled = true;
    try {
      const res = await fetch('/api/couple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return startPaid(data.jobId);
      if (data.code === 'already_pending' && data.jobId) return startPaid(data.jobId);
      if (res.status === 401) { PayFlow.toLogin(form); return; }
      if (res.status === 402) { await PayFlow.onInsufficient('couple', b, data, showError); return; }
      showError(data.error || '요청을 처리하지 못했어요.');
    } catch (e) {
      showError('요청 실패: ' + e.message);
    } finally {
      unlockBtn.disabled = false; sticky.disabled = false; checkoutConfirm.disabled = false;
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
  // 읽기 화면을 못 그릴 때만 쓰는 기본 화면.
  function renderPlain(sections) {
    const box = document.getElementById('coupleSections'); box.replaceChildren();
    sections.forEach((s) => {
      if (s.title === '한 줄 답') return;
      const sec = el('section', 'fr-section fr-prose');
      sec.appendChild(el('h3', 'fr-h', s.title));
      s.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((p) => sec.appendChild(appendRich(el('p'), p)));
      box.appendChild(sec);
    });
  }
  // 함께 좋은 세 달 카드 — 순위는 서버가 엔진 숫자로 만든 그래프(data-rank)에서, 뒷면 문장은 이미 생성된 월별 풀이에서 가져온다.
  function topMonthFlips(timeline, months) {
    const bars = Array.from(timeline.querySelectorAll('.love-bar[data-rank]')).sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank));
    if (!bars.length) return null;
    const box = el('section', 'lr-flips');
    box.setAttribute('aria-label', '두 사람의 흐름이 함께 좋은 세 달');
    const head = el('p', 'lr-flips-title', '함께 좋은 세 달');
    head.appendChild(el('small', null, '카드를 눌러 뒤집어 보세요'));
    box.appendChild(head);
    const row = el('div', 'lr-flip-row');
    bars.slice(0, 3).forEach((bar, i) => {
      const [year, month] = String(bar.dataset.ym || '').split('-').map(Number);
      const note = months.find((m) => m.month === month && (!m.year || m.year === year));
      const flow = note ? ((note.parts && note.parts[0] && note.parts[0].text) || note.text || '') : '';
      const first = (/^.*?[.!?](?=\s|$)/.exec(flow) || [flow])[0];
      const rank = ['함께 가장 좋은 달', '두 번째로 좋은 달', '세 번째로 좋은 달'][i];
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
        card.setAttribute('aria-pressed', String(on));
        back.setAttribute('aria-hidden', String(!on));
        front.setAttribute('aria-hidden', String(on));
      });
      row.appendChild(card);
    });
    box.appendChild(row);
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
    document.getElementById('paidAnswer').textContent = answer ? answer.text.replace(/\*\*/g, '') : '';
    document.getElementById('coupleVisual').innerHTML = visual || '';
    if (window.SajuChart) SajuChart.lift(document.getElementById('coupleVisual')); // 서버가 엔진 숫자로만 만든 막대
    const timeline = document.getElementById('paidTimeline');
    timeline.classList.toggle('hidden', !visual);
    document.getElementById('progressBlock').classList.add('hidden');
    document.getElementById('paidActions').classList.remove('hidden');
    const target = document.getElementById('paidReader');
    let rendered = false;
    if (window.LoveReadingModel && window.LoveReadingView) {
      try {
        const model = window.LoveReadingModel.buildPaid(report, { title: '두 사람의 궁합' });
        model.chapters.forEach((c) => { const hit = SCENE_OF.find(([re]) => re.test(c.title)); if (hit) c.scene = hit[1]; });
        if (disposePaidReader) disposePaidReader();
        disposePaidReader = window.LoveReadingView.render(target, model, { reportId });
        target.classList.remove('hidden');
        rendered = true;
        // 12개월 그래프는 결론 바로 아래에 둔다. 맨 끝에 두면 다 읽은 뒤에야 함께 좋은 달을 볼 수 있다.
        const lead = target.querySelector('.lr-lead');
        if (lead && visual) {
          timeline.classList.add('lr-summary-chart');
          lead.after(timeline);
          const flips = topMonthFlips(timeline, model.months || []);
          if (flips) timeline.after(flips);
        }
      } catch (e) {
        target.replaceChildren(); target.classList.add('hidden');
        console.warn('결과 화면을 기본 읽기 방식으로 표시합니다.');
      }
    }
    if (!rendered) { renderPlain(sections); document.getElementById('paidReading').classList.remove('hidden'); }
  }

  let deliveryJobId = null;
  let deliveryTimer = null;
  function updateDelivery(data, jobId) {
    deliveryJobId = jobId;
    const link = document.getElementById('couplePdfDownload');
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
      const response = await fetch('/api/couple/' + encodeURIComponent(deliveryJobId) + '/delivery', { method: 'POST' });
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
      if (data.status === 'done') { renderPaid(data.report, data.visual, jobId); updateDelivery(data, jobId); return; }
      if (data.status === 'error') return paidFail(data.error || '생성 중 문제가 생겼어요. 결제는 자동으로 취소돼요.');
      setTimeout(() => poll(jobId), 2500);
    } catch (e) {
      setTimeout(() => poll(jobId), 4000);
    }
  }
  function startPaid(jobId) {
    document.body.classList.add('done');
    landing.classList.add('hidden');
    stage.classList.add('hidden');
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
    const syncButtons = (b) => {
      markOn(relationBtns, relationBtns.find((x) => x.dataset.relation === b.relation));
      ['a', 'b'].forEach((p) => {
        markOn(genderBtns[p], genderBtns[p].find((x) => x.dataset.gender === b[p + 'Gender']));
        setCalendar(p, b[p + 'Calendar'] || '양력');
      });
    };
    syncButtons(body());
    // 로그인하고 돌아오면 pay-flow.js가 입력값을 복원하고 폼 안에 안내문(.form-resume-note)을 남긴다.
    // 그 표시가 있을 때만 단계를 다시 묻지 않고 무료 사주 분석을 바로 연다.
    window.addEventListener('load', () => setTimeout(async () => {
      const restoredNote = form.querySelector('.form-resume-note');
      if (!restoredNote) return;
      restoredNote.remove();
      const b = body();
      if (!b.relation || !b.aGender || !b.bGender || !b.aYear || !b.bYear) return;
      syncButtons(b);
      if (await preview(b)) document.getElementById('resumeNote').classList.remove('hidden');
    }, 60));
  }
})();
