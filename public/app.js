'use strict';

const form = document.getElementById('sajuForm');
const submitBtn = document.getElementById('submitBtn');
const result = document.getElementById('result');
const engineSummaryEl = document.getElementById('engineSummary');
const progressBlock = document.getElementById('progressBlock');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const downloadBlock = document.getElementById('downloadBlock');
const downloadLink = document.getElementById('downloadLink');
const downloadCardLink = document.getElementById('downloadCardLink');
const shareCardBtn = document.getElementById('shareCardBtn');
const errorBlock = document.getElementById('errorBlock');
let currentCardUrl = null;

function showError(msg) {
  errorBlock.textContent = msg;
  errorBlock.classList.remove('hidden');
}

// 생성 중엔 폼 전체를 잠근다 — 버튼 하나만 disabled로는 부족하다(아래 setFormBusy(false)를
// poll()의 done/error 종료 시점에만 호출해야 "생성 중..."이 떠 있는 동안 또 눌러서
// 중복 결제·중복 생성되는 걸 막을 수 있다).
function setFormBusy(busy) {
  form.querySelectorAll('input, select, button').forEach((el) => { el.disabled = busy; });
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

async function shareOrCopy(shareData) {
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return; // 네이티브 공유창이 뜨고 처리를 넘김 — 정상 종료
    } catch (e) {
      if (e.name === 'AbortError') return; // 사용자가 공유창에서 취소함 — 정상, 조용히 종료
      // 그 외(권한 문제 등 진짜 실패)는 아래 클립보드 폴백으로 이어간다.
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    showToast('링크를 복사했어요');
  } catch (e) {
    showToast('공유하기를 지원하지 않는 브라우저예요');
  }
}

const linkShareData = { title: '사주보는 수달', text: '평생사주 100p 리포트, 궁금하면 너도 한번 봐봐', url: location.origin + '/' };

shareCardBtn.addEventListener('click', async () => {
  if (!currentCardUrl) { showToast('카드가 아직 준비되지 않았어요'); return; }
  try {
    const res = await fetch(currentCardUrl);
    const blob = await res.blob();
    const file = new File([blob], 'saju-summary.png', { type: blob.type || 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '사주보는 수달', text: '내 평생사주 요약 카드예요' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
        // 파일 공유 실패 — 아래 링크 공유로 폴백
      }
    }
  } catch (e) { /* 카드 이미지 로드 실패 — 아래 링크 공유로 폴백 */ }

  await shareOrCopy(linkShareData);
});

function renderEngineSummary(s) {
  const p = s.palja;
  const ganji = (x) => x.stem + x.branch;
  let html = `
    <div>연주 ${ganji(p.yearPillar)} · 월주 ${ganji(p.monthPillar)} · 일주 ${ganji(p.dayPillar)} · 시주 ${ganji(p.hourPillar)}</div>
    <div>일간 ${s.ilgan.char}(${s.ilgan.ko}) · 신강신약 ${s.strength} · 격국 ${s.kyukguk} · 용신 ${s.yongshin}</div>
  `;
  if (s.warnings && s.warnings.length) {
    html += `<div class="warn">⚠ ${s.warnings.join(' / ')}</div>`;
  }
  engineSummaryEl.innerHTML = html;
}

async function poll(jobId) {
  try {
    const res = await fetch(`/api/status/${jobId}`);
    const data = await res.json();
    if (data.error) { showError(data.error); return; }

    if (data.progress) {
      const pct = Math.round((data.progress.current / data.progress.total) * 100);
      progressFill.style.width = pct + '%';
      progressText.textContent = `${data.progress.current} / ${data.progress.total}`;
    }

    if (data.status === 'done') {
      progressBlock.classList.add('hidden');
      downloadBlock.classList.remove('hidden');
      downloadLink.href = `/api/download/${jobId}`;
      downloadCardLink.href = `/api/download-card/${jobId}`;
      currentCardUrl = `/api/download-card/${jobId}`;
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
  progressFill.style.width = '0%';
  progressText.textContent = '0 / 18';

  // FormData는 disabled 필드의 값을 안 읽는다 — 값을 먼저 다 읽고 나서 폼을 잠가야 한다.
  const fd = new FormData(form);
  const body = {
    name: fd.get('name'),
    year: fd.get('year'), month: fd.get('month'), day: fd.get('day'),
    calendar: fd.get('calendar'), isLeap: fd.get('isLeap') === 'on',
    hour: fd.get('hour'), minute: fd.get('minute'), hourUnknown: fd.get('hourUnknown') === 'on',
    gender: fd.get('gender'),
    city: fd.get('city'), noLonCorrection: fd.get('noLonCorrection') === 'on'
  };
  setFormBusy(true);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === 'already_pending' && data.jobId) {
        // 이미 생성 중이던 작업이 있다 — 새로 만들지 않고 그 작업 진행 상황에 다시 붙는다.
        showError(data.error);
        result.classList.remove('hidden');
        poll(data.jobId);
        return;
      }
      progressBlock.classList.add('hidden');
      setFormBusy(false);
      if (res.status === 401) { location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname); return; }
      if (res.status === 402) { alert(`포인트가 부족합니다 (필요 ${data.required}P / 보유 ${data.balance}P). 마이페이지에서 충전해주세요.`); location.href = '/mypage.html'; return; }
      showError(data.error || '요청 실패');
      return;
    }

    result.classList.remove('hidden');
    renderEngineSummary(data.engineSummary);
    poll(data.jobId);
    // setFormBusy(false)는 여기서 부르지 않는다 — poll()이 done/error로 끝날 때만 폼을 다시 연다.
    // 그 전에 열면 "생성 중..." 화면에서도 또 눌러서 중복 결제·중복 생성이 될 수 있다(실제 신고된 문제).
  } catch (err) {
    showError('요청 실패: ' + err.message);
    progressBlock.classList.add('hidden');
    setFormBusy(false);
  }
});
