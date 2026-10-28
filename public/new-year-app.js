'use strict';
// 이 상품만의 그림(안내 인물·분위기가 연애 상품과 다르다). 공용 읽기 화면도 이 표를 쓴다.
window.LOVE_READING_ART = {"greeting":"/new-year-assets/cover.webp","greeting-comic":"/new-year-assets/cover.webp","cover-comic":"/new-year-assets/cover.webp","explain":"/new-year-assets/months.webp","explain-comic":"/new-year-assets/months.webp","meeting":"/new-year-assets/months.webp","timing-comic":"/new-year-assets/months.webp","new-start":"/new-year-assets/plan.webp","thinking":"/new-year-assets/work.webp","thread-comic":"/new-year-assets/work.webp","empathy":"/new-year-assets/work.webp","caution":"/new-year-assets/work.webp","distance":"/new-year-assets/work.webp","cheer":"/new-year-assets/plan.webp","door-comic":"/new-year-assets/plan.webp","conversation":"/new-year-assets/plan.webp"};
/* 2027 신년운세 화면 — 대화형 입력 → 무료 첫 장(/api/newyear/preview) → 구매 시트 → 유료 생성(/api/newyear,
   로그인·카드 결제는 pay-flow.js) → 결과(/api/status/:jobId). 연애 화면(love-app.js)과 같은 흐름이다.
   입력값은 한 <form id="newYearForm"> 안에 모두 있다(이메일 칸도 form= 속성으로 묶는다). 그래야 로그인으로
   넘어갈 때 PayFlow.toLogin이 통째로 저장하고, 돌아와서 복원한 뒤 무료 첫 장을 다시 열 수 있다.
   서버 응답 문자열은 innerHTML로 넣지 않는다(textContent). 예외는 서버가 엔진 숫자만으로 만든 그래프(result_visual)뿐이다.
   무료 첫 장은 이 파일의 renderFreeReader가, 유료 결과는 공용 LoveReadingView가 그린다(같은 lr-* 디자인). */
(function () {
  const YEAR = 2027;
  const form = document.getElementById('newYearForm');
  const steps = Array.from(form.querySelectorAll('.stage-step'));
  const wizardProgress = document.getElementById('wizardProgress');
  const backBtn = document.getElementById('backBtn');
  const stageError = document.getElementById('stageError');
  const freeResult = document.getElementById('freeResult');
  const paidResult = document.getElementById('paidResult');
  const unlockBtn = document.getElementById('unlockBtn');
  const errorBlock = document.getElementById('errorBlock');
  const landing = document.getElementById('loveLanding');
  const stage = document.getElementById('stage');
  let step = 0;
  let disposeFreeReader = null;
  let disposePaidReader = null;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const field = (name) => form.elements[name];
  const toTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  function rich(node, s) {
    String(s || '').split(/\*\*([^*\n]+?)\*\*/).forEach((part, i) => { if (part) node.appendChild(i % 2 ? el('strong', null, part) : document.createTextNode(part.replace(/\*\*/g, ''))); });
    return node;
  }

  /* ---------- 가격 — 서버 설정(/api/newyear/config)이 유일한 기준 ---------- */
  function applyPrice(priceKrw) {
    const price = priceKrw.toLocaleString('ko-KR') + '원';
    document.querySelectorAll('[data-ny-price]').forEach((node) => { node.textContent = price; });
    document.getElementById('newYearPrice').textContent = price;
    unlockBtn.textContent = price + '으로 전체 풀이 열기';
    document.getElementById('stickyUnlock').textContent = '가장 좋은 세 달 보기 · ' + price;
    window.POINT_NOTICE_PRICE = priceKrw;
    window.POINT_NOTICE_LABEL = '2027 신년운세 전체 풀이';
    window.POINT_NOTICE_DELIVERY = '결제 후 자동 생성되어 웹과 PDF 이메일로 제공됩니다. 생성 시간은 상황에 따라 달라질 수 있습니다';
    const s = document.createElement('script');
    s.src = '/point-notice.js';
    document.body.appendChild(s);
  }
  fetch('/api/newyear/config', { cache: 'no-store' })
    .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
    .then(({ ok, d }) => { if (ok && d.year === YEAR && Number.isSafeInteger(d.priceKrw)) applyPrice(d.priceKrw); })
    .catch(() => {});

  const portrait = document.getElementById('characterPortrait');
  portrait.addEventListener('load', () => { portrait.hidden = false; document.getElementById('portraitWrap').classList.add('has-portrait'); });
  portrait.addEventListener('error', () => { portrait.hidden = true; document.getElementById('portraitWrap').classList.remove('has-portrait'); });
  portrait.src = '/new-year-assets/cover.webp';

  function enterInput() {
    landing.classList.add('hidden');
    stage.classList.remove('hidden');
    show(step);
    toTop();
    const first = steps[step].querySelector('button, input:not([type=hidden])');
    if (first) first.focus({ preventScroll: true });
  }
  ['startLove', 'startLoveBottom', 'startLoveDock'].forEach((id) => document.getElementById(id).addEventListener('click', enterInput));
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
  function validate(i) {
    if (i === 0 && !field('gender').value) return '성별을 골라 주세요. 신년운세 계산에 쓰여요.';
    const intIn = (v, lo, hi) => /^\d+$/.test(String(v).trim()) && Number(v) >= lo && Number(v) <= hi;
    if (i === 1) {
      const yv = field('year').value, mv = field('month').value, dv = field('day').value;
      if (!intIn(yv, 1900, new Date().getFullYear()) || !intIn(mv, 1, 12) || !intIn(dv, 1, 31)) return '태어난 해·달·날을 숫자로 적어 주세요.';
      if (field('calendar').value !== '음력') {
        const d = new Date(Date.UTC(Number(yv), Number(mv) - 1, Number(dv)));
        if (d.getUTCMonth() !== Number(mv) - 1) return mv + '월에는 ' + dv + '일이 없어요. 날짜를 다시 확인해 주세요.';
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
  const genderBtns = Array.from(form.querySelectorAll('[data-gender]'));
  genderBtns.forEach((b) => b.addEventListener('click', () => { field('gender').value = b.dataset.gender; markOn(genderBtns, b); stageError.hidden = true; next(); }));
  function renderReview() {
    const name = field('name').value.trim();
    document.getElementById('reviewTitle').textContent = name ? name + '님, 이 정보가 맞나요?' : '이 정보로 읽어 드릴까요?';
    const rows = [
      ['성별', field('gender').value === '여' ? '여자' : '남자', 0],
      ['생년월일', field('year').value + '.' + field('month').value.padStart(2, '0') + '.' + field('day').value.padStart(2, '0') + ' · ' + field('calendar').value + (field('isLeap').checked ? ' 윤달' : ''), 1],
      ['태어난 시각', field('hourUnknown').checked ? '시각 모름' : field('hour').value.padStart(2, '0') + ':' + (field('minute').value || '0').padStart(2, '0'), 2],
      ['이름', name || '입력하지 않음', 3]
    ];
    const box = document.getElementById('wizardReview'); box.replaceChildren();
    rows.forEach(([label, value, to]) => {
      const row = el('div'); row.appendChild(el('dt', null, label));
      const dd = el('dd'); dd.appendChild(el('span', null, value));
      const edit = el('button', null, '수정'); edit.type = 'button'; edit.setAttribute('aria-label', label + ' 수정'); edit.addEventListener('click', () => show(to));
      dd.appendChild(edit); row.appendChild(dd); box.appendChild(row);
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
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && step < steps.length - 1) { e.preventDefault(); next(); }
  });

  function body() {
    return {
      deliveryEmail: field('deliveryEmail').value.trim(),
      deliveryConsent: field('deliveryConsent').checked,
      name: field('name').value.trim(),
      gender: field('gender').value,
      calendar: field('calendar').value,
      isLeap: field('isLeap').checked,
      year: field('year').value, month: field('month').value, day: field('day').value,
      hour: field('hour').value, minute: field('minute').value,
      hourUnknown: field('hourUnknown').checked
    };
  }

  /* ---------- 무료 첫 장 — 편집형 읽기 화면(lr-*) ---------- */
  function art(file, label, cut) {
    const fig = el('figure', 'lr-art lr-art-portrait ' + (cut || 'lr-cut-wide'));
    const img = document.createElement('img');
    img.src = window.LOVE_READING_ART[file] || '/love-assets/reading/' + file + '.webp'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => { const p = fig.parentNode; if (p) { p.classList.remove('has-art'); p.removeChild(fig); } });
    fig.appendChild(img);
    if (label) fig.appendChild(el('figcaption', 'lr-art-label', label));
    return fig;
  }
  function bubble(text) {
    const talk = el('div', 'lr-talk');
    const b = el('div', 'lr-bubble');
    b.appendChild(el('span', 'lr-speaker', '새온'));
    String(text).split('\n').forEach((line) => b.appendChild(rich(el('p', 'lr-bt'), line)));
    talk.appendChild(b);
    return talk;
  }
  function paper(lines) {
    const p = el('div', 'lr-paper');
    lines.filter(Boolean).forEach((t) => p.appendChild(rich(el('p', 'lr-pt'), t)));
    return p;
  }
  function chapter(index, title, opts) {
    const sec = el('article', 'lr-chapter lr-tone-' + (index % 2));
    sec.dataset.chapterId = opts.id;
    const head = el('header', 'lr-head');
    head.appendChild(el('span', 'lr-num', String(index + 1).padStart(2, '0')));
    const h2 = el('h2', 'lr-title', title); h2.tabIndex = -1; head.appendChild(h2);
    sec.appendChild(head);
    if (opts.art) { sec.classList.add('has-art'); sec.appendChild(art(opts.art[0], opts.art[1], index % 2 ? 'lr-cut-tall' : 'lr-cut-wide')); }
    if (opts.speech) { const t = bubble(opts.speech); if (opts.art) t.classList.add('lr-overlay'); sec.appendChild(t); }
    if (opts.lines) sec.appendChild(paper(opts.lines));
    (opts.extra || []).filter(Boolean).forEach((n) => sec.appendChild(n));
    return sec;
  }
  function lockCard(title, description, kind, rows) {
    // 잠긴 개인 결과는 미리 만들지도, DOM에 싣지도 않는다. 가려진 모양만 그린다.
    const card = el('div', 'lr-panel lr-teaser lr-teaser-inline');
    card.dataset.lockKind = kind;
    card.appendChild(el('strong', 'lr-teaser-title', title));
    card.appendChild(el('p', 'lr-teaser-description', description));
    const veiled = el('div', 'lr-veiled'); veiled.setAttribute('aria-hidden', 'true');
    if (kind === 'timing') { const cal = el('div', 'lr-calendar'); for (let d = 0; d < 12; d++) cal.appendChild(el('i')); veiled.appendChild(cal); }
    else rows.forEach((label) => { const row = el('div', 'lr-hidden-row'); row.appendChild(el('span', null, label)); row.appendChild(el('i')); veiled.appendChild(row); });
    card.appendChild(veiled);
    const button = el('button', 'lr-teaser-lock', '전체 풀이에서 이어 읽기'); button.type = 'button';
    button.setAttribute('aria-label', title + ' — 전체 풀이 구매 안내');
    button.addEventListener('click', openCheckout);
    card.appendChild(button);
    return card;
  }
  function pillarsBox(pillars, note) {
    const d = el('details', 'lr-details lr-profile'); d.open = true;
    d.appendChild(el('summary', null, '내 명식 근거 보기'));
    const grid = el('div', 'lr-pillars');
    pillars.forEach((p) => {
      const box = el('div', 'lr-pillar' + (p.key === 'day' ? ' is-day' : ''));
      box.append(el('span', null, p.key === 'day' ? '일주 · 나' : p.ko), el('b', null, p.hanja), el('small', null, p.ganzi));
      grid.appendChild(box);
    });
    d.appendChild(grid);
    if (note) d.appendChild(el('p', 'lr-note', note));
    return d;
  }
  function quarterPanel(quarters) {
    const box = el('div', 'lr-panel ny-quarters');
    box.appendChild(el('h3', 'lr-sub', YEAR + '년 분기 흐름'));
    const grid = el('div', 'ny-quarter-grid');
    quarters.forEach((q) => {
      const cell = el('div', 'ny-quarter');
      const meter = el('span', 'ny-quarter-meter'); const fill = el('i'); fill.style.height = Math.max(12, Math.min(100, Number(q.avg) || 0)) + '%'; meter.appendChild(fill);
      cell.append(meter, el('b', null, q.label), el('small', null, q.range), el('em', null, q.level));
      grid.appendChild(cell);
    });
    box.appendChild(grid);
    return box;
  }
  function balancePanel(balance) {
    const box = el('div', 'lr-panel lr-balance');
    box.appendChild(el('h3', 'lr-sub', '오행 균형'));
    (balance.bars || []).forEach((x) => {
      const row = el('div', 'lr-bar');
      const name = el('span', 'lr-bar-name'); name.appendChild(el('b', null, x.ko + ' ' + x.el));
      const w = String(x.word || '').split('·')[0]; if (w) name.appendChild(el('em', null, w));
      const track = el('span', 'lr-track'); const fill = el('i');
      fill.style.width = Math.max(0, Math.min(100, Number(x.pct) || 0)) + '%';
      if (/^#[0-9a-fA-F]{3,8}$/.test(String(x.color))) fill.style.background = x.color;
      track.appendChild(fill);
      row.append(name, track, el('span', 'lr-bar-val', x.count + '개'));
      box.appendChild(row);
    });
    return box;
  }
  function contents() {
    const wrap = el('section', 'lr-contents');
    wrap.appendChild(el('p', 'lr-eyebrow', 'THE FULL STORY'));
    wrap.appendChild(el('h3', 'lr-contents-title', '이 안에 담긴,\n당신의 2027년 아홉 장.'));
    [['01', '한 해의 답', 'greeting-comic', ['2027년 한 줄 답', YEAR + ' 총운']], ['02', '언제 움직일까', 'timing-comic', ['가장 좋은 세 달과 조심할 달', '분기별 할 것·피할 것']], ['03', '네 가지 주제', 'explain-comic', ['재물운 · 일·직업운', '애정운 · 건강·생활 리듬']], ['04', '열두 달의 할 일', 'door-comic', ['달마다 흐름 · 해볼 일 · 점검']]].forEach((g) => {
      const card = el('article', 'lr-content-card');
      card.appendChild(art(g[2], '', 'lr-cut-wide'));
      const copy = el('div', 'lr-content-copy');
      copy.append(el('span', 'lr-eyebrow', 'PART ' + g[0]), el('h4', null, g[1]));
      const ul = el('ul'); g[3].forEach((t) => ul.appendChild(el('li', null, t))); copy.appendChild(ul);
      card.appendChild(copy); wrap.appendChild(card);
    });
    wrap.appendChild(el('p', 'lr-note', '한 사람의 사주로 만드는 2027년 웹 리포트와 PDF입니다.'));
    return wrap;
  }
  function lockedList(list) {
    const box = el('div', 'lr-panel lr-locked');
    box.appendChild(el('h3', 'lr-sub', '전체 풀이에서 더 알려 드려요'));
    const ul = el('ul'); list.forEach((t) => ul.appendChild(el('li', null, t))); box.appendChild(ul);
    return box;
  }
  function renderFreeReader(target, r, b) {
    const name = b.name || '고객';
    const reader = el('div', 'lr-reader lr-free');
    reader.setAttribute('role', 'region');
    reader.setAttribute('aria-label', name + '님의 2027년 첫 장');
    reader.appendChild(el('h1', 'lr-main-title', name + '님의\n2027년은\n어떤 해일까요?'));
    reader.appendChild(rich(el('p', 'lr-lead'), r.yearLine.headline + '.'));
    const yl = r.yearLine, ig = r.ilgan;
    reader.appendChild(chapter(0, '당신의 2027년 이야기', { id: 'welcome', art: ['greeting-comic', '새온의 인사'], speech: '내년의 나,\n어디쯤 서 있을까요?', lines: ['태어난 날의 네 기둥으로 2027년 열두 달을 같은 기준에서 비교했어요. 먼저 한 해의 큰 흐름과 분기마다 달라지는 결을 살펴봐요.'], extra: [pillarsBox(r.pillars, r.note)] }));
    reader.appendChild(chapter(1, YEAR + '년, 한 줄로', { id: 'year', art: ['explain-comic', '새온의 해설'], speech: yl.ganzi + '년,\n' + yl.tier + '.', lines: ['**' + yl.headline + '.** ' + yl.text, yl.comes] }));
    reader.appendChild(chapter(2, '분기마다 달라지는 흐름', { id: 'quarters', art: ['timing-comic', '만남의 장면'], speech: '힘을 쓸 때와\n쉬어 갈 때가 있어요.', lines: [r.quarterLead], extra: [quarterPanel(r.quarters), lockCard('가장 좋은 세 달과 조심할 달은 언제일까요?', '분기 흐름을 봤다면, 이제 달마다의 흐름과 그때 해볼 일을 알아볼 차례예요.', 'timing')] }));
    reader.appendChild(chapter(3, '나를 뜻하는 글자와 다섯 기운', { id: 'ilgan', art: ['thread-comic', '새온의 생각'], speech: '같은 해라도\n받아들이는 결은 달라요.', lines: ['**' + ig.char + '(' + ig.ko + '), ' + ig.ohaengKo + '의 사람.** ' + ig.text, r.balance.headline + '. ' + r.balance.lead], extra: [balancePanel(r.balance), lockCard('재물·일·애정·생활 리듬은 어떨까요?', '네 주제마다 가장 좋은 달과 조심할 달, 그 달에 준비할 일을 전체 풀이에서 읽어요.', 'topics', ['재물운', '일·직업운', '애정운', '건강·생활 리듬'])] }));
    reader.appendChild(chapter(4, '무료 요약과 전체 풀이', { id: 'whole-reading', art: ['door-comic', '새온의 응원'], speech: '언제, 무엇을,\n어떻게 시작할지.', lines: [r.strongCount > 0 ? '2027년에는 흐름이 좋은 달이 ' + r.strongCount + '번 있어요. 그중 가장 좋은 세 달이 언제인지, 그때 무엇을 하면 좋은지는 전체 풀이에서 알려 드릴게요.' : '2027년은 잔잔한 흐름이 길어요. 그래도 그중 가장 나은 세 달은 분명히 있어요. 전체 풀이에서 알려 드릴게요.'], extra: [lockedList(r.locked || []), contents()] }));
    target.replaceChildren(reader);
    target.classList.remove('hidden');
    document.getElementById('legacyFreeReading').classList.add('reader-replaced');
  }

  function renderFree(r, b) {
    const who = b.name || '고객';
    document.getElementById('foldedText').textContent = b.year + '.' + b.month + '.' + b.day + (b.calendar === '음력' ? ' (음력)' : '') + ' · ' + b.gender;
    document.getElementById('freeTitle').textContent = who + '님의 2027년 첫 장';
    document.getElementById('freeLead').textContent = r.yearLine.headline + '. ' + r.yearLine.text;
    const pillars = document.getElementById('pillars');
    pillars.replaceChildren();
    pillars.classList.toggle('three', r.pillars.length === 3);
    r.pillars.forEach((p) => {
      const box = el('div', 'love-pillar' + (p.key === 'day' ? ' day' : ''));
      box.append(el('span', null, p.key === 'day' ? '일주 · 나' : p.ko), el('b', null, p.hanja), el('small', null, p.ganzi));
      pillars.appendChild(box);
    });
    document.getElementById('pillarNote').textContent = r.note || '가운데 칸(일주)의 위 글자가 나를 뜻하는 글자예요.';
    document.getElementById('quarterLead').textContent = r.quarterLead;
    const quarters = document.getElementById('quarters');
    quarters.replaceChildren();
    r.quarters.forEach((q) => {
      const col = el('div', 'love-season');
      const bar = el('i'); bar.style.setProperty('--h', Math.max(12, Math.min(100, q.avg)) + '%');
      col.append(bar, el('b', null, q.level), el('small', null, q.label + ' · ' + q.range));
      quarters.appendChild(col);
    });
    const locked = document.getElementById('lockedList');
    locked.replaceChildren();
    (r.locked || []).forEach((t) => locked.appendChild(el('li', null, t)));
    try {
      renderFreeReader(document.getElementById('freeReader'), r, b);
      if (window.SajuChart) SajuChart.replace(document.querySelector('#freeReader .lr-profile'), r.chart);
    } catch (e) {
      document.getElementById('freeReader').classList.add('hidden');
      document.getElementById('legacyFreeReading').classList.remove('reader-replaced');
    }
    document.body.classList.add('done');
    landing.classList.add('hidden');
    stage.classList.add('hidden');
    freeResult.classList.remove('hidden');
    toTop();
  }

  async function preview(b) {
    const btn = document.getElementById('previewBtn');
    btn.disabled = true;
    btn.textContent = '당신의 사주를 읽고 있어요…';
    form.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch('/api/newyear/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '첫 장을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
      renderFree(data.reading, b);
      return true;
    } catch (e) {
      stageFail(e.message);
      return false;
    } finally {
      btn.disabled = false;
      btn.textContent = '내 2027년 첫 장 무료로 보기';
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

  /* ---------- 구매 시트 ---------- */
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
    unlockBtn.disabled = true;
    document.getElementById('stickyUnlock').disabled = true;
    checkoutConfirm.disabled = true;
    try {
      const res = await fetch('/api/newyear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return startPaid(data.jobId);
      if (data.code === 'already_pending' && data.jobId) return startPaid(data.jobId);
      if (res.status === 401) { PayFlow.toLogin(form); return; }
      if (res.status === 402) { await PayFlow.onInsufficient('newyear', b, data, showError); return; }
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

  /* ---------- 유료 결과 ---------- */
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
  // 좋은 세 달·조심할 달 카드 — 순위는 서버가 엔진 숫자로 만든 그래프(data-rank, data-watch)에서, 뒷면 문장은 이미 생성된 월별 풀이에서 가져온다.
  function monthFlips(timeline, report) {
    const bars = Array.from(timeline.querySelectorAll('.love-bar[data-rank]')).sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank)).slice(0, 3);
    const watchBar = timeline.querySelector('.love-bar[data-watch]');
    if (!bars.length || !window.LoveReadingModel) return null;
    const months = window.LoveReadingModel.buildPaid(report).months || [];
    const box = el('section', 'lr-flips');
    box.setAttribute('aria-label', '흐름이 가장 좋은 세 달과 조심할 달');
    const head = el('p', 'lr-flips-title', '좋은 세 달과 조심할 달');
    head.appendChild(el('small', null, '눌러서 뒤집기'));
    box.appendChild(head);
    const row = el('div', 'lr-flip-row');
    const items = bars.map((bar, i) => [bar, String(i + 1), ['가장 좋은 달', '두 번째로 좋은 달', '세 번째로 좋은 달'][i]]);
    if (watchBar) items.push([watchBar, '!', '조심할 달']);
    items.forEach(([bar, mark, label]) => {
      const [year, month] = String(bar.dataset.ym || '').split('-').map(Number);
      const note = months.find((m) => m.month === month && (!m.year || m.year === year));
      const flow = note ? ((note.parts && note.parts[0] && note.parts[0].text) || note.text || '') : '';
      const first = (/^.*?[.!?](?=\s|$)/.exec(flow) || [flow])[0];
      const card = el('button', 'lr-flip' + (mark === '!' ? ' ny-watch' : ''));
      card.type = 'button';
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-label', label + ' ' + year + '년 ' + month + '월. 눌러서 이 달의 흐름 보기');
      const inner = el('span', 'lr-flip-inner');
      const front = el('span', 'lr-flip-front');
      front.append(el('span', 'lr-flip-rank', mark));
      const lab = el('span', 'lr-flip-label');
      lab.append(el('small', null, label), el('b', null, year + '년 ' + month + '월'));
      front.append(lab, el('span', 'lr-flip-hint', '눌러서 보기'));
      const back = el('span', 'lr-flip-back');
      back.setAttribute('aria-hidden', 'true');
      back.appendChild(rich(el('span', 'lr-flip-text'), first || '이 달의 풀이는 아래 12개월 장에서 읽을 수 있어요.'));
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
    document.getElementById('loveVisual').innerHTML = visual || '';
    if (window.SajuChart) SajuChart.lift(document.getElementById('loveVisual')); // 서버가 엔진 숫자로만 만든 그래프
    document.getElementById('paidTimeline').classList.toggle('hidden', !visual);
    const box = document.getElementById('loveSections');
    box.replaceChildren();
    sections.filter((s) => s !== answer).forEach((s) => {
      const sec = el('section', 'fr-section fr-prose');
      sec.appendChild(el('h3', 'fr-h', s.title));
      s.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((p) => sec.appendChild(rich(el('p'), p)));
      box.appendChild(sec);
    });
    document.getElementById('progressBlock').classList.add('hidden');
    document.getElementById('paidReading').classList.remove('hidden');
    document.getElementById('paidActions').classList.remove('hidden');
    if (!window.LoveReadingModel || !window.LoveReadingView) return;
    const target = document.getElementById('paidReader');
    try {
      if (disposePaidReader) disposePaidReader();
      disposePaidReader = window.LoveReadingView.render(target, window.LoveReadingModel.buildPaid(report, { title: YEAR + ' 신년운세' }), { reportId });
      target.classList.remove('hidden');
      document.getElementById('paidReading').classList.add('reader-replaced');
    } catch (e) {
      target.replaceChildren();
      target.classList.add('hidden');
      document.getElementById('paidReading').classList.remove('reader-replaced');
      return;
    }
    // 12개월 그래프는 결론 바로 아래에 둔다. 맨 끝에 두면 다 읽은 뒤에야 좋은 달을 볼 수 있다.
    const lead = target.querySelector('.lr-lead');
    const timeline = document.getElementById('paidTimeline');
    if (lead && visual) {
      timeline.classList.add('lr-summary-chart');
      lead.after(timeline);
      const flips = monthFlips(timeline, report);
      if (flips) timeline.after(flips);
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
      const response = await fetch('/api/newyear/' + encodeURIComponent(deliveryJobId) + '/delivery', { method: 'POST' });
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
      document.getElementById('progressTitle').textContent = data.status === 'rendering' ? '열두 달 풀이를 PDF로 정리하고 있어요' : '당신의 2027년 열두 달을 읽고 있어요';
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
    const syncButtons = (b) => { markOn(genderBtns, genderBtns.find((x) => x.dataset.gender === b.gender)); setCalendar(b.calendar || '양력'); };
    syncButtons(body());
    // 로그인하고 돌아오면 pay-flow.js가 load 직후 입력값을 복원하고 폼 안에 안내문(.form-resume-note)을 남긴다.
    // 그 표시가 있을 때만 단계를 다시 묻지 않고 무료 첫 장을 바로 연다.
    window.addEventListener('load', () => setTimeout(async () => {
      const restoredNote = form.querySelector('.form-resume-note');
      if (!restoredNote) return;
      restoredNote.remove();
      const b = body();
      if (!b.gender || !b.year) return;
      syncButtons(b);
      if (await preview(b)) document.getElementById('resumeNote').classList.remove('hidden');
    }, 60));
  }
})();
