'use strict';
/* 무료 사주 분석의 공통 조각 — 네 상품(연애·신년운세·재회·궁합) 화면이 같이 쓴다.
   - thirdCard: 상위 세 달 중 공개하는 3위 달 카드. 1·2위 달은 서버가 보내지 않으므로 여기서도 그리지 않는다.
   - introCard: AI 개인 소개 칸. 미리보기는 즉시 그리고, 소개는 /api/<상품>/intro 로 따로 받아 나중에 채운다.
     받는 동안 안내 문구를 보이고, 실패·한도 초과·시간 초과면 칸을 조용히 없앤다.
   서버 문자열은 textContent로만 넣는다. */
(function () {
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  /** third: { label: '2027년 3월', text }. opts.variant 'fr'이면 재회 화면(fr-*) 모양으로 만든다. */
  function thirdCard(third, opts) {
    opts = opts || {};
    if (!third || !third.label || !third.text) return null;
    const fr = opts.variant === 'fr';
    const box = el(fr ? 'section' : 'div', fr ? 'fr-section free-third' : 'lr-panel free-third');
    box.dataset.free = 'third';
    box.appendChild(el('h3', fr ? 'fr-h' : 'lr-sub', opts.title || '세 번째로 좋은 달을 먼저 알려 드려요'));
    const head = el('p', fr ? 'love-text free-third-month' : 'lr-pt free-third-month');
    head.appendChild(el('strong', null, third.label));
    head.appendChild(document.createTextNode(' · ' + (opts.rankLabel || '좋은 세 달 중 3위')));
    box.appendChild(head);
    box.appendChild(el('p', fr ? 'love-text' : 'lr-pt', third.text));
    box.appendChild(el('p', fr ? 'love-small' : 'lr-note', opts.note || '1위와 2위 두 달은 전체 풀이에서 그때 해볼 일과 함께 알려 드려요.'));
    return box;
  }

  /** url: '/api/love/intro', body: 미리보기와 같은 입력, opts: { title, variant, loading } */
  function introCard(url, body, opts) {
    opts = opts || {};
    const fr = opts.variant === 'fr';
    const box = el(fr ? 'section' : 'div', fr ? 'fr-section free-intro' : 'lr-panel free-intro');
    box.dataset.free = 'intro';
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-busy', 'true');
    box.appendChild(el('h3', fr ? 'fr-h' : 'lr-sub', opts.title || '당신은 이런 사람이에요'));
    const loading = el('p', fr ? 'love-small free-intro-loading' : 'lr-note free-intro-loading', opts.loading || '수달이 당신의 사주를 읽고 소개를 쓰고 있어요…');
    box.appendChild(loading);
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, 30000);
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('intro ' + res.status))))
      .then((data) => {
        const text = data && typeof data.intro === 'string' ? data.intro.trim() : '';
        if (!text) throw new Error('empty');
        loading.remove();
        text.split(/\n\s*\n/).forEach((p) => box.appendChild(el('p', fr ? 'love-text' : 'lr-pt', p)));
        box.appendChild(el('p', fr ? 'love-small' : 'lr-note', '타고난 사주로 읽은 성향이에요. 정해진 운명이 아니라 나를 이해하는 참고로 읽어 주세요.'));
        box.removeAttribute('aria-busy');
      })
      .catch(() => { box.remove(); })
      .finally(() => clearTimeout(timer));
    return box;
  }

  window.FreeExtras = { thirdCard, introCard };
})();

