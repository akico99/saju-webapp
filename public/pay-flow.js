'use strict';
/* 상품 페이지 공통 — 카드 단건 결제로 넘기기와, 결제 뒤 돌아와 생성 진행에 다시 붙기.

   - PayFlow.checkout(product, form): 잔액이 모자라(402) 상품을 시작하지 못했을 때 부른다. 서버에 상품·폼을
     보관한 주문을 만들고 결제 페이지로 이동한다. 결제 승인 뒤에는 서버가 같은 폼으로 상품을 바로 시작한다.
   - PayFlow.resume(): 결제 완료 페이지가 ?jobId=…로 돌려보내면, 시작 응답(payload)을 sessionStorage에서
     꺼내 준다. 각 페이지는 이걸로 결과 영역을 열고 poll(jobId)에 붙는다. */
(function () {
  const KEY = (jobId) => 'pay:payload:' + jobId;

  async function checkout(product, form) {
    const res = await fetch('/api/pay/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // 광고 유입값(public/track.js가 저장)을 주문에 붙여 캠페인별 매출을 볼 수 있게 한다.
      body: JSON.stringify({ product, form, attribution: window.SoTrack ? window.SoTrack.attribution() : null })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '결제 준비에 실패했어요.');
    location.href = '/pay.html?orderId=' + encodeURIComponent(data.orderId);
    return new Promise(() => {}); // 페이지가 떠나므로 돌아오지 않는다
  }

  function stash(jobId, payload) {
    try { sessionStorage.setItem(KEY(jobId), JSON.stringify(payload || {})); } catch (e) {}
  }

  function resume() {
    const jobId = new URLSearchParams(location.search).get('jobId');
    if (!jobId) return null;
    let payload = {};
    try { payload = JSON.parse(sessionStorage.getItem(KEY(jobId)) || '{}'); } catch (e) {}
    return { jobId, payload };
  }

  // 402 응답 공통 처리 — 잔액이 있으면 원래대로(포인트 차감) 진행됐을 것이므로, 여기 왔다는 건
  // 카드로 결제해야 한다는 뜻. 안내 한 줄 후 결제 페이지로.
  async function onInsufficient(product, form, data, showError) {
    try {
      await checkout(product, form);
    } catch (e) {
      showError(e.message);
    }
  }


  /* 로그인으로 넘어갔다 와도 입력이 남아 있게 — 비로그인으로 제출하면 서버가 401을 준다. 그때 폼 값을
     sessionStorage(이 탭에만, 탭을 닫으면 사라짐)에 적어두고 로그인 페이지로 보낸다. 로그인 뒤 같은
     페이지로 돌아오면 한 번만 다시 채우고 지운다. 비밀번호·파일 칸은 담지 않는다. */
  const RESUME_KEY = (path) => 'form:resume:' + path;
  const RESUME_TTL_MS = 30 * 60 * 1000;
  const SKIP_TYPES = new Set(['password', 'file', 'submit', 'button', 'reset', 'image']);

  function snapshot(form) {
    return Array.from(form.elements)
      .filter((el) => el.name && !SKIP_TYPES.has(el.type))
      .map((el) => (el.type === 'checkbox' || el.type === 'radio')
        ? { n: el.name, v: el.value, c: el.checked }
        : { n: el.name, v: el.value });
  }

  function toLogin(form) {
    try {
      if (form && form.id) {
        sessionStorage.setItem(RESUME_KEY(location.pathname),
          JSON.stringify({ at: Date.now(), formId: form.id, fields: snapshot(form) }));
      }
    } catch (e) { /* 저장 못 해도 로그인 이동은 그대로 */ }
    location.href = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search) + '&reason=checkout';
  }

  function restoreForm() {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(RESUME_KEY(location.pathname)) || 'null');
      sessionStorage.removeItem(RESUME_KEY(location.pathname));
    } catch (e) { return; }
    if (!saved || !Array.isArray(saved.fields) || Date.now() - saved.at > RESUME_TTL_MS) return;
    const form = document.getElementById(saved.formId);
    if (!form) return;

    // 같은 이름이 여러 칸이면(라디오 묶음 등) 나온 순서대로 맞춘다.
    const seen = {};
    const changed = [];
    Array.from(form.elements).forEach((el) => {
      if (!el.name || SKIP_TYPES.has(el.type)) return;
      const checkable = el.type === 'checkbox' || el.type === 'radio';
      let match;
      if (checkable) {
        match = saved.fields.find((f) => f.n === el.name && f.v === el.value && 'c' in f);
      } else {
        const i = seen[el.name] || 0;
        seen[el.name] = i + 1;
        match = saved.fields.filter((f) => f.n === el.name && !('c' in f))[i];
      }
      if (!match) return;
      if (checkable) { if (el.checked !== match.c) { el.checked = match.c; changed.push(el); } }
      else if (el.value !== match.v) { el.value = match.v; changed.push(el); }
    });
    // 칸에 딸린 화면(시간 모름 체크, 음력 윤달 등)이 값에 맞게 바뀌도록 이벤트를 알린다.
    changed.forEach((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const submit = form.querySelector('[type=submit]');
    const note = document.createElement('p');
    note.className = 'form-resume-note';
    note.setAttribute('role', 'status');
    note.textContent = '로그인 전에 입력하신 내용을 그대로 불러왔어요. 확인하고 버튼을 다시 눌러 주세요.';
    note.style.cssText = 'margin:10px 0;padding:10px 12px;border-radius:10px;background:var(--accent-soft, rgba(4,51,109,.07));font-size:13px;line-height:1.6;';
    if (submit && submit.parentNode) {
      submit.parentNode.insertBefore(note, submit);
      submit.scrollIntoView({ block: 'center' });
    } else {
      form.prepend(note);
    }
  }

  // 각 페이지 스크립트가 폼을 초기화한 뒤에 채워야 덮어쓰이지 않는다.
  if (document.readyState === 'complete') setTimeout(restoreForm, 0);
  else window.addEventListener('load', () => setTimeout(restoreForm, 0));

  window.PayFlow = { checkout, stash, resume, onInsufficient, toLogin };
})();
