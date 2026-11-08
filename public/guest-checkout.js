'use strict';
/* 비회원 결제 구매 창 — 신년운세·재회·두 사람의 궁합이 함께 쓴다(연애 시기는 love-app.js에 같은 흐름이 있다).
   구매 창 하나에서 PDF 받을 이메일과 필수 동의(전체 동의 한 번)를 받고 /api/pay/start로 주문을 만든 뒤
   결제 페이지(pay.html)로 보낸다. 로그인·가입을 거치지 않는다. 로그인한 회원이면 서버가 그 계정으로 주문한다.
   필요한 마크업(구매 창 안): [data-agree] 체크박스들(deliveryConsent 포함), #agreeAll, #consentItems(details),
   #deliveryEcho, [data-domain] 버튼, #deliveryError. 이메일 칸(deliveryEmail)은 상품 폼에 속한다. */
(function () {
  function mount(opts) {
    const { sheet, confirmBtn, form, product, priceLabel, body, onPending } = opts;
    const agreeItems = Array.from(sheet.querySelectorAll('[data-agree]'));
    const agreeAll = sheet.querySelector('#agreeAll');
    const items = sheet.querySelector('#consentItems');
    const email = form.elements.deliveryEmail;
    const echo = sheet.querySelector('#deliveryEcho');
    const error = sheet.querySelector('#deliveryError');
    // 가격을 서버 설정에서 늦게 받아 오는 상품(신년운세)도 있어 버튼 문구는 매번 다시 만든다.
    const label = () => (typeof priceLabel === 'function' ? priceLabel() : priceLabel) + ' 결제하기';
    let busy = false;
    confirmBtn.textContent = label();

    const syncAll = () => {
      agreeAll.checked = agreeItems.every((i) => i.checked);
      if (agreeAll.checked && error.textContent.includes('동의')) error.hidden = true;
    };
    agreeAll.addEventListener('change', () => { agreeItems.forEach((i) => { i.checked = agreeAll.checked; }); syncAll(); });
    agreeItems.forEach((i) => i.addEventListener('change', syncAll));
    // 결제 직전에 받을 주소를 한 번 더 크게 보여 준다 — 오타로 PDF를 못 받는 일을 줄인다.
    const syncEcho = () => {
      const v = email.value.trim();
      echo.hidden = !v;
      echo.textContent = v ? 'PDF 받을 주소: ' + v : '';
    };
    email.addEventListener('input', syncEcho);
    sheet.querySelectorAll('[data-domain]').forEach((b) => b.addEventListener('click', () => {
      const local = email.value.trim().split('@')[0];
      if (local) email.value = local + '@' + b.dataset.domain;
      syncEcho();
      email.focus();
    }));
    syncEcho();
    syncAll();

    const reset = () => { busy = false; confirmBtn.disabled = false; confirmBtn.textContent = label(); };
    // 결제 페이지에서 뒤로 돌아오면(bfcache) 버튼을 다시 쓸 수 있게 둔다.
    window.addEventListener('pageshow', (e) => { if (e.persisted) reset(); });

    confirmBtn.addEventListener('click', async () => {
      if (busy) return;
      const emailOk = !!email.value.trim() && email.checkValidity();
      const missing = agreeItems.find((i) => !i.checked);
      if (!emailOk || missing) {
        error.textContent = !emailOk ? 'PDF를 받을 이메일을 정확히 입력해 주세요.' : '필수 항목에 모두 동의해 주세요.';
        error.hidden = false;
        if (emailOk && items) items.open = true;
        (!emailOk ? email : missing).focus();
        return;
      }
      error.hidden = true;
      busy = true;
      confirmBtn.disabled = true;
      confirmBtn.textContent = '결제 준비 중...';
      const agree = {};
      agreeItems.forEach((i) => { if (i.name && i.name !== 'deliveryConsent') agree[i.name] = i.checked; });
      try {
        const res = await fetch('/api/pay/start', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ product, form: body(), attribution: window.SoTrack ? window.SoTrack.attribution() : null }, agree))
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.orderId) { location.href = '/pay.html?orderId=' + encodeURIComponent(data.orderId); return; }
        if (data.code === 'already_pending' && data.jobId) { reset(); sheet.close(); onPending(data.jobId); return; }
        error.textContent = data.error || '결제를 준비하지 못했어요. 다시 시도해 주세요.';
        error.hidden = false;
      } catch (e) {
        error.textContent = '연결이 불안정해요. 잠시 후 다시 눌러 주세요.';
        error.hidden = false;
      }
      reset();
    });
    return { reset };
  }

  window.GuestCheckout = { mount };
})();

