'use strict';
/* 가입 필수 동의 3가지 + 전체 동의. signup.html, consent.html, pay.html이 같이 쓴다.
   모든 칸은 체크 해제 상태로 시작한다 — 동의는 이용자가 직접 체크해야 효력이 있다.
   ConsentBlock.mount(container, onChange, { signup = true, extra = [] }) → { isValid(), values() }
   - signup: false면 가입 동의 3줄을 빼고 extra만 보여 준다(이미 가입 동의를 한 회원의 결제 화면).
   - extra: [{ name, label, detailHtml? }] — 결제 화면의 주문 동의처럼 같은 "전체 동의" 아래 붙일 필수 항목. */
(function () {
  const SIGNUP_ITEMS = [
    { name: 'agreeTerms', label: '[필수] 이용약관에 동의합니다', link: '/terms.html' },
    { name: 'agreePrivacy', label: '[필수] 개인정보 수집·이용에 동의합니다', link: '/privacy.html' },
    { name: 'agreeAge', label: '[필수] 만 14세 이상입니다' }
  ];

  function mount(container, onChange, opts) {
    const { signup = true, extra = [] } = opts || {};
    const list = (signup ? SIGNUP_ITEMS : []).concat(extra);
    container.classList.add('consent-block');
    container.innerHTML = `
      ${list.length > 1 ? '<label class="consent-all"><input type="checkbox" data-consent-all> <span>필수 항목에 모두 동의</span></label>' : ''}
      ${list.map((it) => `
        <div class="consent-row">
          <label><input type="checkbox" name="${it.name}" data-consent-item> <span>${it.label}</span></label>
          ${it.link ? `<a href="${it.link}" target="_blank" rel="noopener">보기</a>` : ''}
        </div>${it.detailHtml ? `<div class="consent-detail">${it.detailHtml}</div>` : ''}`).join('')}
    `;
    const all = container.querySelector('[data-consent-all]');
    const items = Array.from(container.querySelectorAll('[data-consent-item]'));
    const isValid = () => items.every((i) => i.checked);
    const sync = () => { if (all) all.checked = isValid(); if (onChange) onChange(isValid()); };
    if (all) all.addEventListener('change', () => { items.forEach((i) => { i.checked = all.checked; }); sync(); });
    items.forEach((i) => i.addEventListener('change', sync));
    sync();
    return {
      isValid,
      values: () => Object.fromEntries(items.map((i) => [i.name, i.checked]))
    };
  }

  window.ConsentBlock = { mount };
})();

