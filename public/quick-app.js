'use strict';

const form = document.getElementById('quickForm');
const topicSelect = document.getElementById('topicSelect');
const submitBtn = document.getElementById('submitBtn');
const result = document.getElementById('result');
const webReading = document.getElementById('webReading');
const readingLead = document.getElementById('readingLead');
const readingParagraphs = document.getElementById('readingParagraphs');
const readingFallback = document.getElementById('readingFallback');
const readingTitle = document.getElementById('readingTitle');

/* 저장된 리딩 텍스트는 "## 섹션" / "### 소주제" / "- 불릿" / 문단으로 되어 있다(deepReading.toPlainText).
   섹션 단위로 갈라서 표지·행동·3년 흐름·본문 순으로 배치한다. 옛 리딩(소제목 없음)도 본문으로 읽힌다. */
function parseReading(report) {
  const blocks = typeof report === 'string' ? report.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean) : [];
  const sections = [];
  let cur = { title: '', blocks: [] };
  for (const b of blocks) {
    if (b.startsWith('## ')) { if (cur.title || cur.blocks.length) sections.push(cur); cur = { title: b.replace(/^##\s*/, ''), blocks: [] }; }
    else cur.blocks.push(b);
  }
  if (cur.title || cur.blocks.length) sections.push(cur);
  return sections;
}
const clean = (s) => s.replace(/\*\*/g, '');
const bulletsOf = (section) => section.blocks.flatMap((b) => b.split('\n')).map((l) => clean(l.replace(/^\s*-\s*/, '')).trim()).filter(Boolean);

// 문단·소주제·불릿을 지면에 그린다. "### 소주제"는 섹션 안 소제목(h4)로.
function renderProse(blocks, into) {
  for (const block of blocks) {
    if (block.startsWith('### ')) {
      const [first, ...rest] = block.split('\n');
      const h = document.createElement('h4'); h.className = 'fr-sub'; h.textContent = first.replace(/^###\s*/, '');
      into.appendChild(h);
      const body = rest.join('\n').trim();
      if (body) { const p = document.createElement('p'); p.textContent = clean(body); into.appendChild(p); }
    } else if (/^- /m.test(block)) {
      const ul = document.createElement('ul'); ul.className = 'fr-list';
      block.split('\n').forEach((line) => { const li = document.createElement('li'); li.textContent = clean(line.replace(/^\s*-\s*/, '')); if (li.textContent) ul.appendChild(li); });
      into.appendChild(ul);
    } else {
      const p = document.createElement('p'); p.textContent = clean(block); into.appendChild(p);
    }
  }
}

function showReading(report, topic) {
  const sections = parseReading(report);
  webReading.classList.toggle('hidden', sections.length === 0);
  readingFallback.classList.toggle('hidden', sections.length !== 0);
  if (!sections.length) return;

  const label = TOPIC_LABELS[topic] || '심층 리딩';
  const isDos = (t) => /할 것/.test(t) && !/피할/.test(t);
  const isDonts = (t) => /피할 것/.test(t);
  const isTiming = (t) => /대운|앞으로 3년/.test(t);
  const dos = sections.find((s) => isDos(s.title));
  const donts = sections.find((s) => isDonts(s.title));
  const timing = sections.find((s) => isTiming(s.title));
  const chapters = sections.filter((s) => s !== dos && s !== donts && s !== timing);

  // 표지 — 주제가 결론 자리에 오고, 그 아래 "핵심 요약" 소주제의 첫 문단이 리드가 된다.
  document.getElementById('readingKicker').textContent = label + ' 심층 리딩';
  readingTitle.textContent = label;
  let lead = '';
  for (const ch of chapters) {
    const sum = ch.blocks.find((b) => /^###\s*핵심 요약/.test(b));
    if (sum) { lead = clean(sum.split('\n').slice(1).join('\n').trim().split(/\n/)[0] || ''); break; }
  }
  if (!lead && chapters[0]) {
    const first = chapters[0].blocks.find((b) => !b.startsWith('### ')) || '';
    lead = clean(first);
  }
  readingLead.textContent = lead;
  readingLead.hidden = !lead;

  const dosEl = document.getElementById('readingDos'), dontsEl = document.getElementById('readingDonts');
  dosEl.replaceChildren(); dontsEl.replaceChildren();
  (dos ? bulletsOf(dos) : []).forEach((t) => { const li = document.createElement('li'); li.textContent = t; dosEl.appendChild(li); });
  (donts ? bulletsOf(donts) : []).forEach((t) => { const li = document.createElement('li'); li.textContent = t; dontsEl.appendChild(li); });
  dosEl.parentElement.hidden = !dosEl.children.length;
  dontsEl.parentElement.hidden = !dontsEl.children.length;
  document.getElementById('readingActions').hidden = !(dosEl.children.length || dontsEl.children.length);

  const timingBody = document.getElementById('readingTimingBody');
  timingBody.replaceChildren();
  if (timing) renderProse(timing.blocks, timingBody);
  document.getElementById('readingTiming').hidden = !timing;

  readingParagraphs.replaceChildren();
  chapters.forEach((ch) => {
    const sec = document.createElement('section'); sec.className = 'fr-section fr-prose';
    // 챕터 제목이 표지의 주제와 같으면(재물운/재물운) 되풀이하지 않고 '자세한 풀이'로 받는다.
    const title = ch.title === label ? '자세한 풀이' : ch.title;
    if (title) { const h = document.createElement('h3'); h.className = 'fr-h'; h.textContent = title; sec.appendChild(h); }
    renderProse(ch.blocks, sec);
    readingParagraphs.appendChild(sec);
  });
}
const progressBlock = document.getElementById('progressBlock');
const downloadBlock = document.getElementById('downloadBlock');
const downloadLink = document.getElementById('downloadLink');
const errorBlock = document.getElementById('errorBlock');
const shareBtn = document.getElementById('shareBtn');
const crossSellChips = document.getElementById('crossSellChips');

const TOPIC_LABELS = {
  wealth: '재물운', career: '직업·적성운', love: '애정·결혼운',
  relationship: '대인관계·인복', health: '건강운', intro: '내 사주 첫 풀이'
};

function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// 생성 중엔 폼 전체를 잠근다 — 버튼 하나만 잠그면 "생성 중..." 화면에서 또 눌러
// 중복 결제·중복 생성이 될 수 있다(실제 신고된 문제).
function setFormBusy(busy) {
  form.querySelectorAll('input, select, button').forEach((el) => { el.disabled = busy; });
}

function renderCrossSell(currentTopic) {
  crossSellChips.innerHTML = Object.keys(TOPIC_LABELS)
    .filter((k) => k !== currentTopic)
    .map((k) => `<a class="chip" href="/quick.html?topic=${k}">${TOPIC_LABELS[k]}</a>`)
    .join('');
}

async function shareOrCopy(shareData) {
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return; // 네이티브 공유창이 뜨고 처리를 넘김 — 정상 종료
    } catch (e) {
      if (e.name === 'AbortError') return; // 사용자가 공유창에서 취소함 — 정상, 조용히 종료
      // 그 외(권한 문제 등 진짜 실패)는 아래 클립보드 폴백으로 이어간다 — 여기서 그냥 return하면
      // 버튼을 눌러도 아무 반응이 없는 것처럼 보인다(실제로 신고된 버그).
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    showToast('링크를 복사했어요');
  } catch (e) {
    showToast('공유하기를 지원하지 않는 브라우저예요');
  }
}

shareBtn.addEventListener('click', () => shareOrCopy({
  title: '사주보는 수달 — 주제별 심층 리딩',
  text: '내 사주 한 주제를 깊게 읽어봤어, 궁금하면 너도 한번 봐봐',
  url: location.origin + '/'
}));

// index.html(메인)에서 ?topic=wealth 형태로 넘어오면 미리 선택해둔다.
const presetTopic = new URLSearchParams(location.search).get('topic');
if (presetTopic && [...topicSelect.options].some((o) => o.value === presetTopic)) {
  topicSelect.value = presetTopic;
}

if (window.ProfilePicker) {
  window.ProfilePicker.mount(document.getElementById('profilePicker'), form);
}

function showError(msg) {
  errorBlock.textContent = msg;
  errorBlock.classList.remove('hidden');
}

async function poll(jobId, topic) {
  try {
    const res = await fetch(`/api/status/${jobId}`);
    const data = await res.json();
    if (data.error) { showError(data.error); return; }

    if (data.status === 'done') {
      progressBlock.classList.add('hidden');
      downloadBlock.classList.remove('hidden');
      downloadLink.href = `/api/download/${jobId}`;
      showReading(data.report, topic);
      renderCrossSell(topic);
      setFormBusy(false);
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (data.status === 'error') {
      progressBlock.classList.add('hidden');
      showError('생성 중 오류: ' + data.error);
      setFormBusy(false);
      return;
    }
    setTimeout(() => poll(jobId, topic), 2000);
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
  // (순서가 반대였을 때: 생년월일을 맞게 입력해도 값이 다 비어서 서버가 계속 거절하던 버그)
  const fd = new FormData(form);
  const body = {
    topic: fd.get('topic'),
    name: fd.get('name'),
    year: fd.get('year'), month: fd.get('month'), day: fd.get('day'),
    calendar: fd.get('calendar'), isLeap: fd.get('isLeap') === 'on',
    hour: fd.get('hour'), minute: fd.get('minute'), hourUnknown: fd.get('hourUnknown') === 'on',
    gender: fd.get('gender')
  };
  setFormBusy(true);

  try {
    const res = await fetch('/api/quick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === 'already_pending' && data.jobId) {
        // 이미 생성 중이던 작업이 있다 — 새로 만들지 않고 그 작업 진행 상황에 다시 붙는다.
        showError(data.error);
        poll(data.jobId, body.topic);
        return;
      }
      progressBlock.classList.add('hidden');
      setFormBusy(false);
      if (res.status === 401) { location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      if (res.status === 402) { progressBlock.classList.add('hidden'); PayFlow.onInsufficient('deep', body, data, showError); return; }
      showError(data.error || '요청 실패');
      return;
    }
    poll(data.jobId, body.topic);
    // submitBtn은 여기서 다시 켜지 않는다 — poll()이 done/error로 끝날 때만 다시 켠다.
    // 그 전에 다시 켜면 "생성 중..." 화면을 보면서도 버튼을 또 눌러 중복 결제·중복 생성이 될 수 있다.
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
  const topic = (r.payload && r.payload.topicKey) || presetTopic || topicSelect.value;
  result.classList.remove('hidden');
  progressBlock.classList.remove('hidden');
  downloadBlock.classList.add('hidden');
  setFormBusy(true);
  poll(r.jobId, topic);
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
})();
