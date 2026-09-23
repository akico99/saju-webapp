(function exposeRenderer(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (root && root.document) {
    root.WebtoonRenderer = api;
    const boot = () => {
      const mount = root.document.querySelector('[data-webtoon-root]');
      api.render(mount, root.WEBTOON_EPISODES && root.WEBTOON_EPISODES.lifetime);
    };
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
      boot();
    }
  }
})(typeof window !== 'undefined' ? window : null, function createRenderer() {
  const validGaps = new Set(['none', 'beat', 'breath']);

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  // 구매 링크는 가격과 제공 사양이 함께 보여야 눌린다. 둘 중 하나라도 비면 렌더를 막는다.
  function validateLink(link, withPrice) {
    return Boolean(link
      && isNonEmptyString(link.href)
      && isNonEmptyString(link.label)
      && (!withPrice || (isNonEmptyString(link.price) && isNonEmptyString(link.spec))));
  }

  function validateCut(cut) {
    return Boolean(cut
      && isNonEmptyString(cut.src)
      && Number.isInteger(cut.width) && cut.width > 0
      && Number.isInteger(cut.height) && cut.height > 0
      && isNonEmptyString(cut.alt)
      && validGaps.has(cut.gap)
      && Array.isArray(cut.texts)
      && cut.texts.every((item) => item
        && isNonEmptyString(item.type)
        && isNonEmptyString(item.position)
        && isNonEmptyString(item.body)));
  }

  function validateEpisode(episode) {
    return Boolean(episode
      && Array.isArray(episode.cuts)
      && episode.cuts.length
      && episode.cuts.every(validateCut)
      && Number.isInteger(episode.midCtaAfter)
      && episode.midCtaAfter > 0
      && episode.midCtaAfter < episode.cuts.length
      && validateLink(episode.midCta, false)
      && validateLink(episode.cta, true)
      && validateLink(episode.subCta, false));
  }

  function fallbackMarkup() {
    return '<section class="toon-error" role="status" aria-live="polite"><p>웹툰을 불러오지 못했어요.</p><a href="/lifetime-report.html?from=lifetime-webtoon">평생사주 리포트 바로 보기</a></section>';
  }

  function markImageMissing(figure, image, fallback) {
    figure.classList.add('image-missing');
    if (image) image.setAttribute('aria-hidden', 'true');
    if (fallback) fallback.hidden = false;
  }

  function loadingMode(index) {
    return index < 2 ? 'eager' : 'lazy';
  }

  function createTextBlock(documentRef, item, cutNumber) {
    const node = documentRef.createElement('figcaption');
    node.className = `bubble bubble-${item.type} pos-${item.position}`;
    node.id = `cut-${cutNumber}-text`;
    node.textContent = item.body;
    return node;
  }

  function createCut(documentRef, cut, index) {
    const figure = documentRef.createElement('figure');
    figure.id = `cut-${index + 1}`;
    figure.className = `cut cut-gap-${cut.gap}`;

    const image = documentRef.createElement('img');
    image.src = cut.src;
    image.width = cut.width;
    image.height = cut.height;
    image.alt = cut.alt;
    image.decoding = 'async';
    image.loading = loadingMode(index);
    const fallback = documentRef.createElement('div');
    fallback.className = 'image-fallback';
    fallback.hidden = true;
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', cut.alt);
    fallback.textContent = cut.alt;
    image.addEventListener('error', () => markImageMissing(figure, image, fallback));

    figure.append(image, fallback, ...cut.texts.map((item) => createTextBlock(documentRef, item, index + 1)));
    return figure;
  }

  function createMidCta(documentRef, config) {
    const aside = documentRef.createElement('aside');
    aside.className = 'toon-mid-cta';
    const link = documentRef.createElement('a');
    link.href = config.href;
    link.textContent = config.label;
    aside.append(link);
    return aside;
  }

  function createFinalCta(documentRef, episode) {
    const aside = documentRef.createElement('aside');
    aside.className = 'toon-cta';

    const lead = documentRef.createElement('p');
    lead.textContent = '당신의 지도에는 뭐라고 적혀 있을까요?';

    const spec = documentRef.createElement('p');
    spec.className = 'toon-cta-spec';
    spec.textContent = episode.cta.spec;

    const primary = documentRef.createElement('a');
    primary.className = 'primary';
    primary.href = episode.cta.href;
    primary.textContent = `${episode.cta.label} · ${episode.cta.price}`;

    const secondary = documentRef.createElement('a');
    secondary.className = 'toon-cta-sub';
    secondary.href = episode.subCta.href;
    secondary.textContent = episode.subCta.label;

    aside.append(lead, spec, primary, secondary);
    return aside;
  }

  function render(root, episode) {
    if (!root || !validateEpisode(episode)) {
      if (root) root.innerHTML = fallbackMarkup();
      return false;
    }

    try {
      const documentRef = root.ownerDocument;
      const fragment = documentRef.createDocumentFragment();
      episode.cuts.forEach((cut, index) => {
        fragment.append(createCut(documentRef, cut, index));
        if (index + 1 === episode.midCtaAfter) {
          fragment.append(createMidCta(documentRef, episode.midCta));
        }
      });
      fragment.append(createFinalCta(documentRef, episode));
      root.replaceChildren(fragment);
      return true;
    } catch (_error) {
      root.innerHTML = fallbackMarkup();
      return false;
    }
  }

  return {
    validateEpisode,
    fallbackMarkup,
    markImageMissing,
    loadingMode,
    createCut,
    render
  };
});
