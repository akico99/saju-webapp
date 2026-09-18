/* 무료 오행 결과: 실제 /api/free/balance 응답으로 읽는 세 장의 책. */
(function () {
  'use strict';
  const order = ['목', '화', '토', '금', '수'];
  const tones = { 목: 'wood', 화: 'fire', 토: 'earth', 금: 'metal', 수: 'water' };
  const symbols = {
    목: '<path d="M18 26c-8-3-8-12-7-16 5 1 9 4 9 10m-2 6c7-2 12-8 12-17-8 0-14 5-14 14m2 3v8"/>',
    화: '<path d="M17 32c-6-5-6-11 0-17 0 4 2 5 3 6 4-6 4-10 2-14 10 7 12 19 6 25-3 3-8 4-11 0z"/><path d="M21 32c-2-3-1-6 2-9 2 4 4 6 2 9"/>',
    토: '<path d="M5 30 17 11l8 11 5-7 9 15H5z"/><path d="m17 11 3 7 3-3"/>',
    금: '<path d="M8 17h27M8 24h27M8 31h27"/>',
    수: '<path d="M5 16c5-5 9-5 14 0s9 5 14 0M5 25c5-5 9-5 14 0s9 5 14 0"/>'
  };
  function make(tag, cls, value) {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (value != null) element.textContent = value;
    return element;
  }
  function particle(word, final, open) {
    const cp = word.codePointAt(word.length - 1);
    return cp >= 0xAC00 && cp <= 0xD7A3 && (cp - 0xAC00) % 28 !== 0 ? final : open;
  }
  function span(...parts) {
    const element = make('span');
    element.append(...parts);
    return element;
  }
  function glyph(name) {
    return make('em', 'bb-' + tones[name], name);
  }
  function fillTitle(title, bars) {
    const max = Math.max(...bars.map(b => b.count));
    const top = bars.filter(b => b.count === max);
    const empty = bars.filter(b => b.count === 0);
    title.replaceChildren();
    if (top.length >= 4) {
      title.append(span('네 기운이'), span('고르게 보이고,'));
      if (empty.length === 1) title.append(span(glyph(empty[0].ko), particle(empty[0].ko, '은', '는'), ' 보이지 않아요'));
      else title.append(span('빠진 기운은 없어요'));
      return;
    }
    const first = [];
    top.forEach((bar, i) => {
      first.push(glyph(bar.ko));
      if (i < top.length - 1) first.push(i === top.length - 2 ? particle(bar.ko, '과 ', '와 ') : '·');
    });
    first.push(particle(top.at(-1).ko, '이', '가'));
    title.append(span(...first), span('두드러지고,'));
    if (empty.length === 1) title.append(span(glyph(empty[0].ko), particle(empty[0].ko, '은', '는'), ' 보이지 않아요'));
    else if (empty.length > 1) title.append(span('비어 있는'), span('기운도 있어요'));
    else title.append(span('빠진 기운은 없어요'));
  }
  function stamp(name, empty) {
    const element = make('span', empty ? 'bb-stamp bb-empty' : 'bb-stamp');
    if (!empty) element.innerHTML = '<svg viewBox="0 0 44 44" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">' + symbols[name] + '</g></svg>';
    return element;
  }
  function renderMap(bars, target) {
    target.replaceChildren();
    target.setAttribute('aria-label', bars.map(b => b.ko + ' ' + b.count + '개').join(', '));
    for (const bar of bars) {
      const column = make('div', 'bb-element bb-' + tones[bar.ko] + (bar.count >= 4 ? ' bb-dense' : ''));
      const marks = make('div', 'bb-stamps');
      if (bar.count === 0) marks.append(stamp(bar.ko, true));
      else for (let i = 0; i < bar.count; i++) marks.append(stamp(bar.ko, false));
      column.append(marks, make('span', 'bb-element-name', bar.ko), make('strong', null, String(bar.count)));
      target.append(column);
    }
  }
  function renderInsights(reading, target) {
    target.replaceChildren();
    const leaders = reading.strongestAll || [reading.strongest];
    for (const leader of leaders) {
      const article = make('article', 'bb-insight');
      const title = make('h3', null, leader.ko + ' · ' + leader.word);
      const positive = make('div', 'bb-insight-part');
      positive.append(make('h4', null, '잘 쓰일 때'), make('p', null, leader.light));
      const caution = make('div', 'bb-insight-part');
      caution.append(make('h4', null, '지나칠 때'), make('p', null, leader.shadow));
      article.append(title, positive, caution);
      target.append(article);
    }
  }
  function renderMissing(reading, target) {
    target.replaceChildren();
    if (!reading.lacking.length) {
      target.append(make('p', 'bb-missing-text', '다섯 기운이 모두 원국 글자에 나타납니다. 개수만으로 전체 균형을 판단하지 않고, 서로 작용하는 방식은 다음 풀이에서 살펴봅니다.'));
    } else {
      for (const missing of reading.lacking) {
        const article = make('article', 'bb-missing-item');
        article.append(make('h3', null, missing.ko + ' · 0개'), make('p', null, missing.text));
        target.append(article);
      }
    }
    if (reading.hourUnknown) target.append(make('p', 'bb-hour-note', '태어난 시각을 모르므로 시주는 제외한 여섯 글자만 셌습니다. 시각이 확인되면 결과가 달라질 수 있습니다.'));
  }
  function render(reading, root) {
    if (!root || !Array.isArray(reading?.bars) || reading.bars.length !== 5 ||
        order.some((name, i) => reading.bars[i].ko !== name || !Number.isInteger(reading.bars[i].count) || reading.bars[i].count < 0)) {
      throw new Error('오행 결과 형식이 올바르지 않습니다.');
    }
    const total = reading.bars.reduce((sum, b) => sum + b.count, 0);
    if (total !== 6 && total !== 8) throw new Error('오행 글자 수가 올바르지 않습니다.');
    root.innerHTML = `
      <section class="bb-page bb-cover" aria-labelledby="bbCoverTitle">
        <div class="bb-head"><span class="bb-brand">사주보는 수달</span><span class="bb-seal" aria-hidden="true">水獺</span><span class="bb-folio">무료 오행 결과 · 1/3</span></div>
        <h2 class="bb-title" id="bbCoverTitle" tabindex="-1"></h2>
        <div class="bb-section-line"><h3 id="bbMapTitle"></h3><span aria-hidden="true"></span></div>
        <div class="bb-elements" role="img" aria-labelledby="bbMapTitle"></div>
        <p class="bb-basis"></p>
        <div class="bb-cover-reading"><h3 class="bb-summary"></h3><div class="bb-figure"><p class="bb-handnote">지금의 기운에서,<br>어떤 이야기가 이어질지<br>함께 알아봐요.</p><img src="/illustrations/otter-field-guide.png" alt="나침반을 든 수달" width="155" height="187"></div></div>
        <p class="bb-note">숫자는 원국 글자의 개수입니다. 많고 적음만으로 좋고 나쁨을 판단하지 않습니다.</p>
        <div class="bb-pagefoot"><span>다음에 읽을 이야기</span><button type="button" data-page="1">오행 해석 읽기 <b aria-hidden="true">›</b></button></div>
      </section>
      <section class="bb-page bb-detail" aria-labelledby="bbDetailTitle" hidden>
        <div class="bb-head"><span class="bb-brand">사주보는 수달</span><span class="bb-folio">무료 오행 결과 · 2/3</span></div>
        <p class="bb-chapter">二 · 기운 읽기</p>
        <h2 id="bbDetailTitle" tabindex="-1">두드러진 기운에는<br>두 얼굴이 있어요</h2>
        <p class="bb-lead">원국에 가장 많이 나타난 기운을 살펴봅니다. 한 가지가 아니라면 함께 읽어요.</p>
        <div class="bb-insights"></div>
        <p class="bb-note">이 해석은 오행 개수로 보는 간략한 읽기입니다. 성격 전체를 단정하지 않습니다.</p>
        <div class="bb-pagefoot"><button type="button" class="bb-back" data-page="0">‹ 기운 지도로</button><button type="button" data-page="2">마지막 장 읽기 <b aria-hidden="true">›</b></button></div>
      </section>
      <section class="bb-page bb-ending" aria-labelledby="bbEndTitle" hidden>
        <div class="bb-head"><span class="bb-brand">사주보는 수달</span><span class="bb-folio">무료 오행 결과 · 3/3</span></div>
        <p class="bb-chapter">三 · 다음 이야기</p>
        <h2 id="bbEndTitle" tabindex="-1">보이지 않는 기운도<br>이야기의 일부예요</h2>
        <div class="bb-missing"></div>
        <div class="bb-offer">
          <p class="bb-offer-label">여기까지 무료로 확인했어요</p>
          <h3>기운의 개수 다음에는,<br>그 기운이 내 삶에서 어떻게 쓰이는지</h3>
          <p>‘내 사주 첫 풀이’에서는 성격과 기질, 사주의 큰 구조, 지금의 흐름을 더 깊이 읽습니다. 무료 결과를 흐리거나 잠가두지 않습니다.</p>
          <a class="bb-paid-link" id="bbPaidLink"><span class="bb-paid-name"></span><strong class="bb-paid-price"></strong><span aria-hidden="true">›</span></a>
        </div>
        <nav class="bb-other" aria-label="다른 무료 서비스"><span>다른 무료 리딩도 보기</span><a href="/free.html?kind=noble">사주 속 귀인</a><a href="/free.html?kind=charm">타고난 매력</a><a href="/life-graph.html">인생 그래프</a></nav>
        <div class="bb-pagefoot"><button type="button" class="bb-back" data-page="1">‹ 해석으로</button></div>
      </section>`;
    root.hidden = false;
    fillTitle(root.querySelector('.bb-title'), reading.bars);
    root.querySelector('#bbMapTitle').textContent = (total === 8 ? '여덟' : '여섯') + ' 글자의 기운 지도';
    root.querySelector('.bb-basis').textContent = '원국 ' + (total === 8 ? '여덟' : '여섯') + ' 글자에 나타난 오행의 개수';
    renderMap(reading.bars, root.querySelector('.bb-elements'));
    const strongest = reading.strongestAll || [reading.strongest];
    root.querySelector('.bb-summary').textContent = strongest.map(b => b.ko).join('·') + ' ' + (strongest.length > 1 ? '각 ' : '') + strongest[0].count + '개' + (reading.lacking.length ? ', ' + reading.lacking.map(b => b.ko).join('·') + ' 0개' : '');
    renderInsights(reading, root.querySelector('.bb-insights'));
    renderMissing(reading, root.querySelector('.bb-missing'));
    const paid = root.querySelector('#bbPaidLink');
    paid.href = reading.upsell.href;
    root.querySelector('.bb-paid-name').textContent = reading.upsell.name;
    root.querySelector('.bb-paid-price').textContent = reading.upsell.price;
    root.onclick = (event) => {
      const button = event.target.closest('button[data-page]');
      if (!button || !root.contains(button)) return;
      const index = Number(button.dataset.page);
      const pages = root.querySelectorAll('.bb-page');
      pages.forEach((page, i) => { page.hidden = i !== index; });
      root.scrollIntoView({ behavior: 'auto', block: 'start' });
      pages[index].querySelector('h2').focus({ preventScroll: true });
    };
  }
  window.BalanceBook = { render };
}());
