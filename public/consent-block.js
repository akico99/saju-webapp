'use strict';
/* 가입 필수 동의 3가지 + 전체 동의. signup.html과 consent.html이 같이 쓴다.
   모든 칸은 체크 해제 상태로 시작한다 — 동의는 이용자가 직접 체크해야 효력이 있다.
   ConsentBlock.mount(container, onChange) → { isValid(), values() } */
(function () {
  const ITEMS = [
    { name: 'agreeTerms', label: '[필수] 이용약관에 동의합니다', link: '/terms.html' },
    { name: 'agreePrivacy', label: '[필수] 개인정보 수집·이용에 동의합니다', link: '/privacy.html' },
    { name: 'agreeAge', label: '[필수] 만 14세 이상입니다' }
  ];

  function mount(container, onChange) {
    container.classList.add('consent-block');
    container.innerHTML = `
      <label class="consent-all"><input type="checkbox" data-consent-all> <span>필수 항목에 모두 동의</span></label>
      ${ITEMS.map((it) => `
        <div class="consent-row">
          <label><input type="checkbox" name="${it.name}" data-consent-item> <span>${it.label}</span></label>
          ${it.link ? `<a href="${it.link}" target="_blank" rel="noopener">보기</a>` : ''}
        </div>`).join('')}
    `;
    const all = container.querySelector('[data-consent-all]');
    const items = Array.from(container.querySelectorAll('[data-consent-item]'));
    const isValid = () => items.every((i) => i.checked);
    const sync = () => { all.checked = isValid(); if (onChange) onChange(isValid()); };
    all.addEventListener('change', () => { items.forEach((i) => { i.checked = all.checked; }); sync(); });
    items.forEach((i) => i.addEventListener('change', sync));
    sync();
    return {
      isValid,
      values: () => Object.fromEntries(items.map((i) => [i.name, i.checked]))
    };
  }

  window.ConsentBlock = { mount };
})();

