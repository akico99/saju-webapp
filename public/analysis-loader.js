'use strict';
/* 분석 연출 — 무료 결과는 서버 계산이 수십 ms라 결과가 "툭" 튀어나온다. 그러면 계산이
   아니라 미리 써둔 글을 보여주는 것처럼 느껴진다. 단계가 차례로 체크되는 짧은 연출을 두어
   "내 사주를 실제로 읽고 있다"는 감각을 준다.

   원칙:
   - 총 길이는 2초 안팎. 그 이상은 기다리게 만드는 것이지 신뢰를 주는 게 아니다.
   - 실제 요청이 더 오래 걸리면 마지막 단계에서 기다린다(연출이 결과보다 먼저 끝나지 않음).
   - prefers-reduced-motion이면 연출 없이 결과를 바로 보여준다.

   사용: AnalysisLoader.run(['타고난 오행 확인', '현재 대운 확인', '흐름을 읽는 중'], fetchPromise)
   → 연출이 끝나고 요청도 끝나면 fetchPromise의 결과로 resolve. */
(function () {
  const STEP_MS = 620;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ensureStyle() {
    if (document.getElementById('al-style')) return;
    const st = document.createElement('style');
    st.id = 'al-style';
    st.textContent = `
      .al-veil { position: fixed; inset: 0; z-index: 70; background: rgba(255,255,255,0.94); backdrop-filter: blur(3px);
        display: flex; align-items: center; justify-content: center; padding: 24px; opacity: 0; transition: opacity .18s; }
      .al-veil.show { opacity: 1; }
      .al-box { width: min(340px, 100%); }
      .al-face { font-size: 40px; line-height: 1; text-align: center; margin-bottom: 14px; animation: al-bob 1.6s ease-in-out infinite; }
      .al-title { font-size: 16px; font-weight: 800; text-align: center; margin: 0 0 18px; color: var(--ink, #111); }
      .al-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
      .al-steps li { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--muted, #6b6b6b); transition: color .2s; }
      .al-steps li .mark { width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid var(--line, #e5e7eb); display: inline-flex;
        align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; transition: all .2s; }
      .al-steps li.active { color: var(--ink, #111); }
      .al-steps li.active .mark { border-color: var(--accent, #04336d); }
      .al-steps li.active .mark::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #04336d); animation: al-pulse 1s ease-in-out infinite; }
      .al-steps li.done { color: var(--ink, #111); }
      .al-steps li.done .mark { background: var(--accent, #04336d); border-color: var(--accent, #04336d); color: #fff; }
      .al-steps li.done .mark::after { content: '✓'; }
      @keyframes al-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      @keyframes al-pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
    `;
    document.head.appendChild(st);
  }

  function build(steps, title) {
    const veil = document.createElement('div');
    veil.className = 'al-veil';
    veil.setAttribute('role', 'status');
    veil.setAttribute('aria-live', 'polite');
    const box = document.createElement('div');
    box.className = 'al-box';
    const face = document.createElement('div'); face.className = 'al-face'; face.textContent = '🦦';
    const h = document.createElement('p'); h.className = 'al-title'; h.textContent = title;
    const ul = document.createElement('ul'); ul.className = 'al-steps';
    steps.forEach((text) => {
      const li = document.createElement('li');
      const mark = document.createElement('span'); mark.className = 'mark';
      const label = document.createElement('span'); label.textContent = text;
      li.append(mark, label);
      ul.appendChild(li);
    });
    box.append(face, h, ul);
    veil.appendChild(box);
    return { veil, items: Array.from(ul.children) };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function run(steps, promise, opts = {}) {
    const title = opts.title || '수달이 사주를 펼쳐보고 있어요';
    if (reduceMotion || !steps || !steps.length) return promise;

    ensureStyle();
    const { veil, items } = build(steps, title);
    document.body.appendChild(veil);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => veil.classList.add('show'));

    // 요청 실패는 연출이 끝난 뒤 그대로 던진다 — 여기서 삼키면 호출한 쪽이 에러를 못 본다.
    let result, error;
    const settled = promise.then((v) => { result = v; }, (e) => { error = e; });

    for (let i = 0; i < items.length; i++) {
      items[i].classList.add('active');
      const isLast = i === items.length - 1;
      if (isLast) {
        // 마지막 단계는 실제 요청이 끝날 때까지 기다린다(최소 한 스텝은 보여준다).
        await Promise.all([sleep(STEP_MS), settled]);
      } else {
        await sleep(STEP_MS);
      }
      items[i].classList.remove('active');
      items[i].classList.add('done');
    }
    await sleep(260);

    veil.classList.remove('show');
    await sleep(180);
    veil.remove();
    document.body.style.overflow = '';

    if (error) throw error;
    return result;
  }

  window.AnalysisLoader = { run };
})();
