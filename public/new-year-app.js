'use strict';

const form = document.getElementById('newYearForm');
const submit = document.getElementById('newYearSubmit');
const result = document.getElementById('newYearResult');
const progress = document.getElementById('newYearProgress');
const progressText = document.getElementById('newYearProgressText');
const errorBox = document.getElementById('newYearError');
const report = document.getElementById('newYearReport');
const sections = document.getElementById('newYearSections');
const visual = document.getElementById('newYearVisual');
const downloads = document.getElementById('newYearDownloads');
let cardUrl = null;
let priceKrw = null;
let configReady = false;
let jobBusy = false;

function busy(value) {
  jobBusy = value;
  syncSubmit();
}

function syncSubmit() {
  submit.disabled = jobBusy || !configReady;
  submit.textContent = jobBusy ? '리포트를 만들고 있어요…' : configReady ? '2027년 리포트 만들기 · ' + priceKrw.toLocaleString('ko-KR') + '원 →' : '가격 확인 중...';
}

async function loadProductConfig() {
  try {
    const response = await fetch('/api/newyear/config', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.year !== 2027 || !Number.isSafeInteger(data.priceKrw)) throw new Error(data.error || '상품 정보를 불러오지 못했습니다.');
    priceKrw = data.priceKrw;
    document.getElementById('newYearPrice').textContent = priceKrw.toLocaleString('ko-KR') + '원';
    configReady = true;
    syncSubmit();
  } catch (error) {
    document.getElementById('newYearPrice').textContent = '준비 중';
    showError(error.message);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function rich(value) {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function renderBody(text) {
  const blocks = String(text || '').split(/\n\n+/).map((x) => x.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split('\n');
    if (lines.every((line) => /^\s*[-•*]\s+/.test(line))) {
      return '<ul>' + lines.map((line) => '<li>' + rich(line.replace(/^\s*[-•*]\s+/, '')) + '</li>').join('') + '</ul>';
    }
    return '<p>' + lines.map(rich).join('<br>') + '</p>';
  }).join('');
}

function renderSections(text) {
  const chunks = String(text || '').split(/(?=^##\s)/m).map((x) => x.trim()).filter(Boolean);
  sections.innerHTML = chunks.map((chunk) => {
    const lines = chunk.split('\n');
    const title = lines.shift().replace(/^##\s*/, '');
    return '<section class="ny-section-card"><h3>' + escapeHtml(title) + '</h3>' + renderBody(lines.join('\n')) + '</section>';
  }).join('');
}

function showError(message) {
  errorBox.textContent = message || '요청을 처리하지 못했습니다.';
  errorBox.classList.remove('hidden');
}

async function poll(jobId) {
  try {
    const response = await fetch('/api/status/' + encodeURIComponent(jobId));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '상태를 불러오지 못했습니다.');
    if (data.status === 'done') {
      progress.classList.add('hidden');
      report.classList.remove('hidden');
      downloads.classList.remove('hidden');
      visual.innerHTML = data.visual || '';
      renderSections(data.report || '');
      const pdfUrl = '/api/download/' + encodeURIComponent(jobId);
      document.getElementById('newYearPdf').href = pdfUrl;
      const shareUrl = '/api/download-card/' + encodeURIComponent(jobId);
      const cardLink = document.getElementById('newYearCard');
      const preview = document.getElementById('newYearCardPreview');
      cardUrl = data.hasCard ? shareUrl : null;
      cardLink.classList.toggle('hidden', !cardUrl);
      preview.classList.toggle('hidden', !cardUrl);
      if (cardUrl) { cardLink.href = cardUrl; preview.src = cardUrl; }
      busy(false);
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (data.status === 'error') {
      progress.classList.add('hidden');
      showError(data.error || '리포트 생성에 실패했습니다. 결제는 자동으로 취소됩니다.');
      busy(false);
      return;
    }
    progressText.textContent = data.status === 'rendering'
      ? '월별 그래프와 PDF, 공유 카드를 정리하고 있습니다.'
      : '총운·월별 흐름·네 가지 주제별 풀이를 작성하고 있습니다.';
    setTimeout(() => poll(jobId), 2500);
  } catch (error) {
    progressText.textContent = error.message + ' 다시 확인하고 있습니다.';
    setTimeout(() => poll(jobId), 5000);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.classList.add('hidden');
  result.classList.remove('hidden');
  progress.classList.remove('hidden');
  report.classList.add('hidden');
  downloads.classList.add('hidden');
  const fd = new FormData(form);
  const body = {
    name: fd.get('name'), year: fd.get('year'), month: fd.get('month'), day: fd.get('day'),
    calendar: fd.get('calendar'), isLeap: fd.get('isLeap') === 'on',
    hour: fd.get('hour'), minute: fd.get('minute'), hourUnknown: fd.get('hourUnknown') === 'on',
    gender: fd.get('gender')
  };
  busy(true);
  try {
    const response = await fetch('/api/newyear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === 'already_pending' && data.jobId) { poll(data.jobId); return; }
      if (response.status === 401) { location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      if (response.status === 402) { progress.classList.add('hidden'); busy(false); await PayFlow.onInsufficient('newyear', body, data, showError); return; }
      throw new Error(data.error || '리포트를 시작하지 못했습니다.');
    }
    poll(data.jobId);
  } catch (error) {
    progress.classList.add('hidden');
    showError(error.message);
    busy(false);
  }
});

document.getElementById('newYearShare').addEventListener('click', async () => {
  const share = { title: '2027년 신년운세 · 사주보는 수달', text: '2027년 한 해의 흐름을 월별·주제별로 살펴봤어요.', url: location.href.split('?')[0] };
  if (cardUrl && navigator.canShare && navigator.share) {
    try {
      const blob = await (await fetch(cardUrl)).blob();
      const file = new File([blob], '사주보는수달_2027년신년운세.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) return await navigator.share({ ...share, files: [file] });
    } catch (error) { if (error.name === 'AbortError') return; }
  }
  if (navigator.share) return navigator.share(share).catch(() => {});
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(share.url);
    alert('상품 페이지 주소를 복사했어요.');
  } else {
    window.prompt('상품 페이지 주소를 복사하세요.', share.url);
  }
});

(() => {
  const resume = window.PayFlow && PayFlow.resume();
  if (!resume) return;
  result.classList.remove('hidden');
  progress.classList.remove('hidden');
  busy(true);
  poll(resume.jobId);
})();

loadProductConfig();
