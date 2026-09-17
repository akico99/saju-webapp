'use strict';
/* 2단계 입력 — 출생정보를 넣고 나면 바로 결과로 가지 않고 "지금 가장 궁금한 건?"을
   한 번 묻는다. 고른 고민은 두 군데 쓰인다:
   1) 결과 하단에서 권하는 상품 — 추측으로 고르지 않고 본인이 고른 걸 잇는다.
   2) 결과의 첫 문장 — 고른 고민을 먼저 언급한다.

   폼에 data-concern-step만 붙이면 된다. 제출 버튼을 가로채서 1단계 검증 → 고민 패널 →
   실제 제출 순서로 돌린다. 고른 값은 hidden input[name=concern]으로 폼에 들어간다. */
(function () {
  const CONCERNS = [
    { key: 'wealth', label: '돈과 재물', sub: '열심히 버는데 왜 안 남을까', product: { name: '재물운', price: '3,900원', href: '/quick.html?topic=wealth' } },
    { key: 'career', label: '직업과 이직', sub: '지금 버틸까, 움직일까', product: { name: '직업·적성운', price: '3,900원', href: '/quick.html?topic=career' } },
    { key: 'love', label: '연애와 인연', sub: '왜 같은 지점에서 자꾸 엇갈릴까', product: { name: '애정·결혼운', price: '3,900원', href: '/quick.html?topic=love' } },
    { key: 'relationship', label: '사람 관계', sub: '사람 때문에 자꾸 지칠 때', product: { name: '대인관계·인복', price: '3,900원', href: '/quick.html?topic=relationship' } },
    { key: 'life', label: '전체 인생 흐름', sub: '지금이 내 인생 어디쯤인지', product: { name: '평생사주 100p', price: '14,900원', href: '/lifetime-report.html' } }
  ];
  const BY_KEY = Object.fromEntries(CONCERNS.map((c) => [c.key, c]));

  function ensureStyle() {
    if (document.getElementById('cs-style')) return;
    const st = document.createElement('style');
    st.id = 'cs-style';
    st.textContent = `
      .cs-panel { margin-top: 4px; }
      .cs-panel h2 { font-size: 18px; font-weight: 800; margin: 0 0 6px; letter-spacing: -0.01em; }
      .cs-panel .cs-lead { font-size: 13px; color: var(--muted, #6b6b6b); line-height: 1.7; margin: 0 0 16px; }
      .cs-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
      .cs-item { display: flex; align-items: center; gap: 12px; padding: 13px 14px; border: 1.5px solid var(--line, #e5e7eb);
        border-radius: 12px; background: var(--paper, #fff); cursor: pointer; text-align: left; width: 100%; font-family: inherit; transition: all .15s; }
      .cs-item .t { font-size: 14.5px; font-weight: 800; color: var(--ink, #111); }
      .cs-item .s { font-size: 12px; color: var(--muted, #6b6b6b); margin-top: 2px; }
      .cs-item .r { width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--line, #e5e7eb); flex-shrink: 0; margin-left: auto; }
      .cs-item.on { border-color: var(--accent, #04336d); background: var(--accent-soft, rgba(4,51,109,.07)); }
      .cs-item.on .r { border-color: var(--accent, #04336d); background: var(--accent, #04336d); box-shadow: inset 0 0 0 3px var(--paper, #fff); }
      .cs-back { display: inline-block; font-size: 12.5px; color: var(--muted, #6b6b6b); background: none; border: none; padding: 0; margin: 12px 0 0; cursor: pointer; font-family: inherit; text-decoration: underline; }
    `;
    document.head.appendChild(st);
  }

  function setup(form) {
    ensureStyle();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (!submitBtn) return;
    const finalLabel = form.dataset.concernSubmit || '내 흐름 확인하기';

    // 1단계에서 보이는 것들 — 제출 버튼을 제외한 폼의 직계 자식들
    const step1 = Array.from(form.children).filter((el) => el !== submitBtn);

    const hidden = document.createElement('input');
    hidden.type = 'hidden'; hidden.name = 'concern'; hidden.value = '';
    form.appendChild(hidden);

    const panel = document.createElement('div');
    panel.className = 'cs-panel hidden';
    const h = document.createElement('h2'); h.textContent = '지금 가장 궁금한 건 무엇인가요?';
    const lead = document.createElement('p'); lead.className = 'cs-lead';
    lead.textContent = '고른 고민을 중심으로 무료 결과를 먼저 보여드릴게요.';
    const list = document.createElement('div'); list.className = 'cs-list';
    CONCERNS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cs-item'; b.dataset.key = c.key;
      const txt = document.createElement('div');
      const t = document.createElement('div'); t.className = 't'; t.textContent = c.label;
      const s = document.createElement('div'); s.className = 's'; s.textContent = c.sub;
      txt.append(t, s);
      const r = document.createElement('span'); r.className = 'r';
      b.append(txt, r);
      b.addEventListener('click', () => {
        list.querySelectorAll('.cs-item').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        hidden.value = c.key;
      });
      list.appendChild(b);
    });
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'cs-back'; back.textContent = '← 출생정보 다시 입력';
    panel.append(h, lead, list);
    form.insertBefore(panel, submitBtn);
    form.appendChild(back);
    back.classList.add('hidden');

    const originalLabel = submitBtn.textContent;
    let stage = 1;

    function showStep(n) {
      stage = n;
      step1.forEach((el) => el.classList.toggle('hidden', n === 2));
      panel.classList.toggle('hidden', n !== 2);
      back.classList.toggle('hidden', n !== 2);
      submitBtn.textContent = n === 2 ? finalLabel : originalLabel;
      if (n === 2) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    back.addEventListener('click', () => showStep(1));

    // 제출을 가로챈다 — capture 단계라 페이지의 submit 핸들러보다 먼저 돈다.
    form.addEventListener('submit', (e) => {
      if (stage === 1) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        showStep(2);
        return;
      }
      if (!hidden.value) {
        e.preventDefault(); e.stopImmediatePropagation();
        list.firstElementChild.focus();
        list.classList.add('shake');
        return;
      }
      // 통과 — 페이지의 핸들러가 이어서 돈다. 다음 제출을 위해 1단계로 되돌려 둔다.
      setTimeout(() => showStep(1), 0);
    }, true);

    // 공유 링크 등으로 프로그램이 제출하는 경우: concern이 URL에 있으면 그대로 통과시킨다.
    const preset = new URLSearchParams(location.search).get('concern');
    if (preset && BY_KEY[preset]) {
      hidden.value = preset;
      stage = 2;
      list.querySelector(`[data-key="${preset}"]`)?.classList.add('on');
    }
  }

  window.ConcernStep = {
    CONCERNS, byKey: (k) => BY_KEY[k] || null,
    label: (k) => (BY_KEY[k] ? BY_KEY[k].label : ''),
    product: (k) => (BY_KEY[k] ? BY_KEY[k].product : null)
  };

  function init() {
    document.querySelectorAll('form[data-concern-step]').forEach(setup);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
