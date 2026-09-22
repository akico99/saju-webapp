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
  function validateEpisode(episode) {
    return Boolean(episode && Array.isArray(episode.cuts) && episode.cuts.length);
  }

  function fallbackMarkup() {
    return '<section class="toon-error"><p>웹툰을 불러오지 못했어요.</p><a href="/lifetime-report.html?from=lifetime-webtoon">평생사주 리포트 바로 보기</a></section>';
  }

  function markImageMissing(figure) {
    figure.classList.add('image-missing');
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
    image.addEventListener('error', () => markImageMissing(figure));

    figure.append(image, ...cut.texts.map((item) => createTextBlock(documentRef, item, index + 1)));
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
    lead.textContent = '이번에는 당신의 삶을 한 권으로 펼쳐보세요.';

    const primary = documentRef.createElement('a');
    primary.className = 'primary';
    primary.href = episode.cta.href;
    primary.textContent = `${episode.cta.label} · ${episode.cta.price}`;

    const secondary = documentRef.createElement('a');
    secondary.className = 'toon-cta-sub';
    secondary.href = episode.subCta.href;
    secondary.textContent = episode.subCta.label;

    aside.append(lead, primary, secondary);
    return aside;
  }

  function render(root, episode) {
    if (!root || !validateEpisode(episode)) {
      if (root) root.innerHTML = fallbackMarkup();
      return false;
    }

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
