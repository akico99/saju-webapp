'use strict';
/* 로그인 계정에 저장해둔 인물(나/배우자/자녀 등) 정보를 각 서비스 폼에 바로 채워 넣는
   공용 위젯. 로그인 안 했거나 저장된 인물이 없으면 조용히 아무것도 안 보여준다(기존
   수동 입력 방식 그대로 동작) — 이 스크립트가 없어도 폼은 정상 작동해야 한다. */
(function () {
  let profilesPromise = null;
  function loadProfiles() {
    if (!profilesPromise) {
      profilesPromise = fetch('/api/profiles')
        .then((res) => (res.ok ? res.json() : { profiles: [] }))
        .then((data) => data.profiles || [])
        .catch(() => []);
    }
    return profilesPromise;
  }

  function fieldName(base, prefix) {
    if (!prefix) return base;
    return prefix + base.charAt(0).toUpperCase() + base.slice(1);
  }

  function applyProfileToForm(form, profile, prefix) {
    const set = (base, value) => {
      const el = form.elements[fieldName(base, prefix)];
      if (el && value != null) el.value = value;
    };
    set('name', profile.name || '');
    set('gender', profile.gender || '남');
    set('calendar', profile.isLunar ? '음력' : '양력');
    set('year', profile.birthYear);
    set('month', profile.birthMonth);
    set('day', profile.birthDay);

    const hourUnknownEl = form.elements[fieldName('hourUnknown', prefix)];
    if (profile.birthHour == null) {
      if (hourUnknownEl) hourUnknownEl.checked = true;
      const hourEl = form.elements[fieldName('hour', prefix)];
      const minEl = form.elements[fieldName('minute', prefix)];
      if (hourEl) hourEl.value = '';
      if (minEl) minEl.value = '';
    } else {
      if (hourUnknownEl) hourUnknownEl.checked = false;
      set('hour', profile.birthHour);
      set('minute', profile.birthMinute || 0);
    }

    const isLeapEl = form.elements[fieldName('isLeap', prefix)];
    if (isLeapEl) isLeapEl.checked = !!profile.isLeap;

    const cityEl = form.elements[fieldName('city', prefix)];
    if (cityEl && profile.city) cityEl.value = profile.city;
  }

  /**
   * @param {HTMLElement} container - 셀렉트 박스를 넣을 빈 컨테이너 (기본 hidden)
   * @param {HTMLFormElement} form - 채워 넣을 폼
   * @param {Object} [opts]
   * @param {string} [opts.prefix] - 'a'/'b'처럼 필드명 접두어(궁합 등 2인 폼용). 없으면 1인 폼.
   * @param {string} [opts.placeholder] - 셀렉트 첫 옵션 문구
   */
  function mount(container, form, opts) {
    opts = opts || {};
    const prefix = opts.prefix || '';
    loadProfiles().then((profiles) => {
      if (!profiles.length) return; // 로그인 안 했거나 저장된 인물 없음 — 그냥 안 보여줌
      container.innerHTML = `
        <label class="profile-picker-label">저장된 정보 불러오기</label>
        <select class="profile-picker-select">
          <option value="">${opts.placeholder || '직접 입력'}</option>
          ${profiles.map((p) => `<option value="${p.id}">${p.label}${p.name ? ' · ' + p.name : ''}</option>`).join('')}
        </select>
      `;
      container.classList.remove('hidden');
      container.querySelector('select').addEventListener('change', (e) => {
        const profile = profiles.find((p) => String(p.id) === e.target.value);
        if (profile) applyProfileToForm(form, profile, prefix);
      });
    });
  }

  window.ProfilePicker = { mount };
})();
