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
      body: JSON.stringify({ product, form })
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

  window.PayFlow = { checkout, stash, resume, onInsufficient };
})();
