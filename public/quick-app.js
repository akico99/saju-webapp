'use strict';

const form = document.getElementById('quickForm');
const topicSelect = document.getElementById('topicSelect');
const submitBtn = document.getElementById('submitBtn');
const result = document.getElementById('result');
const progressBlock = document.getElementById('progressBlock');
const downloadBlock = document.getElementById('downloadBlock');
const downloadLink = document.getElementById('downloadLink');
const errorBlock = document.getElementById('errorBlock');
const shareBtn = document.getElementById('shareBtn');
const crossSellChips = document.getElementById('crossSellChips');

const TOPIC_LABELS = {
  total: '오늘의 나 — 총평', wealth: '재물운', career: '직업·적성운',
  love: '애정운', relationship: '인간관계'
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
  title: '사주보는 수달 — 빠른 리딩',
  text: '990원으로 본 내 사주, 궁금하면 너도 한번 봐봐',
  url: location.origin + '/'
}));

// index.html(메인)에서 ?topic=wealth 형태로 넘어오면 미리 선택해둔다.
const presetTopic = new URLSearchParams(location.search).get('topic');
if (presetTopic && [...topicSelect.options].some((o) => o.value === presetTopic)) {
  topicSelect.value = presetTopic;
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
      renderCrossSell(topic);
      setFormBusy(false);
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
      if (res.status === 402) { alert(`포인트가 부족합니다 (필요 ${data.required}P / 보유 ${data.balance}P). 마이페이지에서 충전해주세요.`); location.href = '/mypage.html'; return; }
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
