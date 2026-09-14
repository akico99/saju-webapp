'use strict';
/* 생년월일시 입력 보조 — 사주 서비스의 모든 페이지가 연/월/일과 시/분을 각각 따로 입력받는다.
   칸이 5개라 손이 많이 가는데, 그렇다고 <input type="date">로 합치면 출생연도를 고르려고
   달력을 수십 번 넘겨야 해서 오히려 나빠진다(생년월일은 "1997"을 바로 치는 게 가장 빠르다).
   그래서 칸 구조는 그대로 두고, 치는 동안 손이 멈추지 않게만 만든다.

   - inputmode=numeric: 모바일에서 숫자 키패드가 바로 뜬다(type=number만으로는 브라우저에
     따라 일반 키보드가 뜨는 경우가 있다).
   - 자동 넘김: 연 4자리, 월/일/시/분 2자리를 채우면 다음 칸으로 커서가 넘어간다.
   - 지우기: 빈 칸에서 백스페이스를 누르면 앞 칸으로 돌아간다.
   - 월/일은 한 자리만 쳐도 더 칠 수 없는 값(2~9월, 4~9일)이면 바로 넘어간다.

   페이지마다 마크업이 .date-inputs + name=year/month/day로 완전히 동일해서, 페이지를
   고치지 않고 이 파일 하나로 전부 적용된다. */
(function () {
  // 칸을 다 채웠다고 볼 자릿수. 월에 '1'만 친 경우는 10·11·12가 될 수 있어 아직 기다린다.
  const WIDTH = { year: 4, month: 2, day: 2, hour: 2, minute: 2 };

  /* 이름이 페이지마다 다르다 — 한 사람만 받는 화면은 year/month/day, 두 사람을 받는
     화면(궁합·재회·출산택일)은 aYear/bYear/baseYear처럼 접두사가 붙는다. 접두사를 떼고
     종류만 본다. */
  function kindOf(input) {
    const m = /^(?:[a-z]+)?(year|month|day|hour|minute)$/i.exec(input.name || '');
    return m ? m[1].toLowerCase() : null;
  }

  function isFull(input) {
    const name = kindOf(input);
    const v = input.value;
    const max = WIDTH[name];
    if (!max) return false;
    if (v.length >= max) return true;
    // 한 자리로 확정되는 경우 — 월 2~9, 일 4~9, 시 3~9는 뒤에 숫자가 더 올 수 없다.
    if (v.length === 1) {
      const d = Number(v);
      if (name === 'month' && d >= 2) return true;
      if (name === 'day' && d >= 4) return true;
      if (name === 'hour' && d >= 3) return true;
      if (name === 'minute' && d >= 6) return true;
    }
    return false;
  }

  function fieldsOf(input) {
    // 같은 폼 안에서 우리가 다루는 칸들만, 화면에 보이는 순서대로.
    const form = input.form || document;
    return Array.from(form.querySelectorAll('input[name]'))
      .filter((el) => kindOf(el) && el.type !== 'hidden' && !el.disabled && el.offsetParent !== null);
  }

  function enhance(input) {
    if (input.dataset.feReady) return;
    input.dataset.feReady = '1';
    input.setAttribute('inputmode', 'numeric');

    input.addEventListener('input', () => {
      // 숫자만 남긴다 — 복사/붙여넣기로 들어온 구분자를 걸러낸다.
      const cleaned = input.value.replace(/[^\d]/g, '').slice(0, WIDTH[kindOf(input)]);
      if (cleaned !== input.value) input.value = cleaned;
      if (!isFull(input)) return;
      const list = fieldsOf(input);
      const next = list[list.indexOf(input) + 1];
      // 이미 값이 있는 칸으로 넘어가면 사용자가 고치던 값을 건드리게 되므로 비어있을 때만.
      if (next && !next.value) next.focus();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace' || input.value !== '') return;
      const list = fieldsOf(input);
      const prev = list[list.indexOf(input) - 1];
      if (!prev) return;
      e.preventDefault();
      prev.focus();
      prev.setSelectionRange?.(prev.value.length, prev.value.length);
    });
  }

  function scan() {
    document.querySelectorAll('input[name]').forEach((el) => {
      if (!kindOf(el)) return;
      if (el.type === 'number' || el.type === 'text' || el.type === 'tel') enhance(el);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  // 저장된 인물 선택처럼 폼을 나중에 그리는 화면이 있어서 한 번 더 훑는다.
  document.addEventListener('click', () => setTimeout(scan, 0), { passive: true });
})();
