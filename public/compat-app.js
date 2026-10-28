'use strict';

const form = document.getElementById('compatForm');
if (window.ProfilePicker) {
  window.ProfilePicker.mount(document.getElementById('profilePickerA'), form, { prefix: 'a' });
  window.ProfilePicker.mount(document.getElementById('profilePickerB'), form, { prefix: 'b' });
}
const submitBtn = document.getElementById('submitBtn');
const result = document.getElementById('result');
const progressBlock = document.getElementById('progressBlock');
const downloadBlock = document.getElementById('downloadBlock');
const downloadLink = document.getElementById('downloadLink');
const errorBlock = document.getElementById('errorBlock');
const compatReading = document.getElementById('compatReading');
const compatVisual = document.getElementById('compatVisual');
const compatReader = document.getElementById('compatReader');
const compatProse = document.getElementById('compatProse');
const compatDd = document.getElementById('compatDd');

function showError(msg) {
  errorBlock.textContent = msg;
  errorBlock.classList.remove('hidden');
}

/* **강조** 구간을 굵은 형광 강조(<strong class="hl">)로 그린다(quick-app.js의 appendRich와 같은 방식).
   innerHTML 없이 텍스트 노드로 만들어 본문이 마크업으로 해석되지 않는다. */
function appendRich(el, s) {
  String(s || '').split(/\*\*/).forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const b = document.createElement('strong'); b.className = 'hl'; b.textContent = part; el.appendChild(b); }
    else el.appendChild(document.createTextNode(part));
  });
  return el;
}

/* 본문에서 "### 지금 할 것"/"### 피할 것" 구역을 떼어 낸다(서버 compatOutlines.splitCompatText와 같은 규칙). 없으면 빈 배열. */
function splitReport(text) {
  const prose = [], dos = [], donts = [];
  let mode = 'prose';
  String(text || '').split(/\r?\n/).forEach((line) => {
    const h = line.match(/^\s*#{2,4}\s*(.+?)\s*$/);
    if (h) {
      const title = h[1].replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
      if (title === '피할 것') { mode = 'donts'; return; }
      if (title === '할 것' || title === '지금 할 것') { mode = 'dos'; return; }
      mode = 'prose';
    }
    if (mode === 'prose') { prose.push(line); return; }
    const target = mode === 'dos' ? dos : donts;
    const b = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*\S)\s*$/);
    if (b) target.push(b[1].trim());
    else if (line.trim() && target.length) target[target.length - 1] += ' ' + line.trim();
  });
  return { prose: prose.join('\n').trim(), dos, donts };
}

function ddBox(cls, title, items) {
  const box = document.createElement('div'); box.className = 'vz-dd ' + cls;
  const t = document.createElement('div'); t.className = 'ttl'; t.textContent = title; box.appendChild(t);
  const ol = document.createElement('ol');
  items.forEach((it) => ol.appendChild(appendRich(document.createElement('li'), it)));
  box.appendChild(ol);
  return box;
}

// 서버가 만든 그래프(visual) → 본문 → 할 것/피할 것 카드. 예전 주문(그래프·본문 없음)이면 미리보기를 숨기고 PDF만 보여 준다.
// 장면형 읽기 화면. 모델·렌더러 중 하나라도 실패하면 false를 돌려 아래의 기존 본문 그림으로 되돌린다.
// 파일은 서버가 켜 둔 경우에만 불러온다(꺼져 있으면 404 요청 자체를 보내지 않는다).
let sceneLoad = null;
let sceneReady = false;
function loadScenes() {
  if (!sceneLoad) {
    sceneLoad = (async () => {
      const cfg = await (await fetch('/api/scene-reader')).json();
      if (!cfg || cfg.enabled !== true) return false;
      const css = new Promise((ok, no) => {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/reading-view.css';
        l.onload = ok; l.onerror = () => no(new Error('css')); document.head.appendChild(l);
      });
      const js = (src) => new Promise((ok, no) => {
        const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error(src)); document.head.appendChild(s);
      });
      await Promise.all([css, js('/reading-model-compat.js'), js('/reading-view.js')]);
      // 글꼴은 기다리지 않는다. 못 불러오면 시스템 글꼴로 그려진다.
      const font = document.createElement('link'); font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=Gowun+Batang&family=Noto+Sans+KR:wght@400;500;600;700&display=swap';
      document.head.appendChild(font);
      sceneReady = !!(window.ReadingModelCompat && window.ReadingView);
      return sceneReady;
    })().catch(() => false);
  }
  return sceneLoad;
}

function showScenes(report, jobId) {
  if (!compatReader || !sceneReady) return false;
  try {
    if (!window.ReadingModelCompat || !window.ReadingView) return false;
    const model = window.ReadingModelCompat.build(report);
    if (!model) return false;
    window.ReadingView.render(compatReader, model, { reportId: jobId, storagePrefix: 'compat-reading', ariaLabel: '궁합 리포트 읽기', className: 'lr-compat' });
    return compatReader.childElementCount > 0;
  } catch (e) {
    compatReader.replaceChildren();
    return false;
  }
}

function showReading(report, visual, jobId) {
  compatVisual.innerHTML = visual || '';
  compatProse.replaceChildren(); compatDd.replaceChildren();
  if (compatReader) compatReader.replaceChildren();
  const parts = splitReport(report);
  const scenes = showScenes(report, jobId);
  (scenes ? '' : parts.prose).split(/\n\n+/).map((b) => b.trim()).filter(Boolean).forEach((block) => {
    if (block.startsWith('### ')) {
      const [first, ...rest] = block.split('\n');
      const h = document.createElement('h4'); h.className = 'fr-sub'; h.textContent = first.replace(/^###\s*/, '');
      compatProse.appendChild(h);
      const body = rest.join('\n').trim();
      if (body) compatProse.appendChild(appendRich(document.createElement('p'), body));
    } else if (/^- /m.test(block)) {
      const ul = document.createElement('ul'); ul.className = 'fr-list';
      block.split('\n').forEach((line) => { const li = appendRich(document.createElement('li'), line.replace(/^\s*-\s*/, '')); if (li.textContent) ul.appendChild(li); });
      compatProse.appendChild(ul);
    } else {
      compatProse.appendChild(appendRich(document.createElement('p'), block));
    }
  });
  if (parts.dos.length || parts.donts.length) {
    const grid = document.createElement('div');
    grid.className = 'vz-dd-grid' + (parts.dos.length && parts.donts.length ? '' : ' one');
    if (parts.dos.length) grid.appendChild(ddBox('do', '지금 할 것', parts.dos));
    if (parts.donts.length) grid.appendChild(ddBox('dont', '피할 것', parts.donts));
    compatDd.appendChild(grid);
  }
  compatProse.hidden = !compatProse.children.length;
  compatReading.classList.toggle('hidden', !(visual || scenes || compatProse.children.length || compatDd.children.length));
}

// 생성 중엔 폼 전체를 잠근다 — 버튼 하나만 잠그면 "생성 중..." 화면에서 또 눌러
// 중복 결제·중복 생성이 될 수 있다(실제 신고된 문제).
function setFormBusy(busy) {
  form.querySelectorAll('input, select, button').forEach((el) => { el.disabled = busy; });
}

async function poll(jobId) {
  try {
    const res = await fetch(`/api/status/${jobId}`);
    const data = await res.json();
    if (data.error) { showError(data.error); return; }

    if (data.status === 'done') {
      progressBlock.classList.add('hidden');
      downloadBlock.classList.remove('hidden');
      downloadLink.href = `/api/download/${jobId}`;
      await loadScenes();
      showReading(data.report, data.visual, jobId);
      setFormBusy(false);
      return;
    }
    if (data.status === 'error') {
      progressBlock.classList.add('hidden');
      showError('생성 중 오류: ' + data.error);
      setFormBusy(false);
      return;
    }
    setTimeout(() => poll(jobId), 2000);
  } catch (e) {
    showError('상태 조회 실패: ' + e.message);
    setFormBusy(false);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBlock.classList.add('hidden');
  downloadBlock.classList.add('hidden');
  progressBlock.classList.remove('hidden');
  result.classList.remove('hidden');

  // FormData는 disabled 필드의 값을 안 읽는다 — 값을 먼저 다 읽고 나서 폼을 잠가야 한다.
  const fd = new FormData(form);
  const body = {};
  for (const [key, value] of fd.entries()) {
    body[key] = value;
  }
  body.aHourUnknown = fd.get('aHourUnknown') === 'on';
  body.bHourUnknown = fd.get('bHourUnknown') === 'on';
  setFormBusy(true);

  try {
    const res = await fetch('/api/compat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === 'already_pending' && data.jobId) {
        showError(data.error);
        poll(data.jobId);
        return;
      }
      progressBlock.classList.add('hidden');
      setFormBusy(false);
      if (res.status === 401) { PayFlow.toLogin(form); return; }
      if (res.status === 402) { progressBlock.classList.add('hidden'); PayFlow.onInsufficient('compat', body, data, showError); return; }
      showError(data.error || '요청 실패');
      return;
    }
    poll(data.jobId);
    // setFormBusy(false)는 여기서 부르지 않는다 — poll()이 done/error로 끝날 때만 폼을 다시 연다.
  } catch (err) {
    showError('요청 실패: ' + err.message);
    progressBlock.classList.add('hidden');
    setFormBusy(false);
  }
});

// 카드 결제를 마치고 돌아온 경우(?jobId=…) — 서버가 이미 생성을 시작했다. 진행 상황에 붙는다.
(() => {
  const r = window.PayFlow && PayFlow.resume();
  if (!r) return;
  result.classList.remove('hidden');
  progressBlock.classList.remove('hidden');
  setFormBusy(true);
  poll(r.jobId);
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
})();
