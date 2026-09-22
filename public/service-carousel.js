/* 홈 서비스 줄 — 모바일은 터치, PC는 버튼·드래그로 같은 줄을 넘겨본다. */
(function initServiceCarousels() {
  function step(track) {
    const card = track.querySelector('.tile');
    if (!card) return Math.max(240, track.clientWidth * 0.8);
    const styles = getComputedStyle(track);
    const gap = parseFloat(styles.columnGap || styles.gap || '16') || 16;
    return card.getBoundingClientRect().width + gap;
  }

  function refresh(root) {
    const track = root.querySelector('.row-scroll');
    const previous = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    if (!track || !previous || !next) return;
    const max = Math.max(0, track.scrollWidth - track.clientWidth - 1);
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= max;
    root.classList.toggle('is-overflowing', max > 1);
  }

  document.querySelectorAll('[data-service-carousel]').forEach((root) => {
    const track = root.querySelector('.row-scroll');
    if (!track) return;

    root.querySelector('[data-carousel-prev]')?.addEventListener('click', () => {
      track.scrollBy({ left: -step(track), behavior: 'smooth' });
    });
    root.querySelector('[data-carousel-next]')?.addEventListener('click', () => {
      track.scrollBy({ left: step(track), behavior: 'smooth' });
    });
    track.addEventListener('scroll', () => refresh(root), { passive: true });
    window.addEventListener('resize', () => refresh(root));
    refresh(root);
  });
})();
