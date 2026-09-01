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

function showError(msg) {
  errorBlock.textContent = msg;
  errorBlock.classList.remove('hidden');
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
      if (res.status === 401) { location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search); return; }
      if (res.status === 402) { alert(`포인트가 부족합니다 (필요 ${data.required}P / 보유 ${data.balance}P). 마이페이지에서 충전해주세요.`); location.href = '/mypage.html'; return; }
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
