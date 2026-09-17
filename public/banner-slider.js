'use strict';
/* 메인 배너 슬라이더 — index.html과 services.html이 함께 쓴다.
   예전에는 두 파일이 같은 코드를 각자 갖고 있어서, 한쪽만 고치면 조용히 어긋났다.

   배너 내용은 관리자가 admin-banners.html에서 자유롭게 바꾼다(/api/banners). 슬라이드 개수도
   블록 개수도 정해져 있지 않으므로 마크업에 하드코딩하지 않고 받은 배열 그대로 만든다.
   API가 실패하는 드문 경우에도 배너 자리가 통째로 비어보이지 않도록 기본 6개를 폴백으로 둔다. */
(function () {
  // 블록 종류 -> 실제 태그와 클래스. 클래스는 예전 고정 네 칸 시절 이름을 그대로 쓴다
  // (theme.css의 .eyebrow/.headline/.price/.banner-cta) — 스타일이 이미 거기 있다.
  var BLOCK_STYLE = {
    label: { tag: 'span', cls: 'eyebrow', size: 11 },
    title: { tag: 'div', cls: 'headline', size: 18 },
    body: { tag: 'div', cls: 'price', size: 13 },
    button: { tag: 'span', cls: 'banner-cta', size: 12 }
  };

  function blocks(list) {
    return list.map(function (b) { return Object.assign({ scale: 1 }, b); });
  }

  var FALLBACK_BANNERS = [
    { image: '/banners/1.png', imagePosition: '50% 50%', href: '/quick.html?topic=intro', textAlign: 'left', textVAlign: 'bottom',
      blocks: blocks([{ type: 'label', text: "TODAY'S PICK" }, { type: 'title', text: '내 사주, 처음이라면 여기부터' }, { type: 'body', text: '내 사주 첫 풀이 · 3,900원' }, { type: 'button', text: '지금 보기 →' }]) },
    { image: '/banners/2.png', imagePosition: '50% 50%', href: '/quick.html?topic=love', textAlign: 'left', textVAlign: 'bottom',
      blocks: blocks([{ type: 'label', text: 'HOT' }, { type: 'title', text: '지금 인연의 흐름이 궁금할 때' }, { type: 'body', text: '애정·결혼운 심층 리딩 · 3,900원' }, { type: 'button', text: '지금 보기 →' }]) },
    { image: '/banners/3.png', imagePosition: '50% 50%', href: '/compat.html', textAlign: 'left', textVAlign: 'bottom',
      blocks: blocks([{ type: 'label', text: 'COMPATIBILITY' }, { type: 'title', text: '둘이 보는 진짜 궁합' }, { type: 'body', text: '궁합 리포트 · 4,900원 · 재회 관점 포함' }, { type: 'button', text: '지금 보기 →' }]) },
    { image: '/banners/4.png', imagePosition: '50% 50%', href: '/quick.html?topic=wealth', textAlign: 'left', textVAlign: 'bottom',
      blocks: blocks([{ type: 'label', text: 'MONEY' }, { type: 'title', text: '돈이 들어오고 나가는 흐름' }, { type: 'body', text: '재물운 심층 리딩 · 3,900원' }, { type: 'button', text: '지금 보기 →' }]) },
    { image: '/banners/5.png', imagePosition: '50% 50%', href: '/life-graph.html', textAlign: 'left', textVAlign: 'bottom',
      blocks: blocks([{ type: 'label', text: 'FREE' }, { type: 'title', text: '내 인생, 흐름으로 한눈에 보기' }, { type: 'body', text: '인생 그래프 · 무료 체험' }, { type: 'button', text: '무료로 보기 →' }]) },
    { image: '/banners/6.png', imagePosition: '50% 50%', href: '/lifetime-report.html', textAlign: 'left', textVAlign: 'bottom',
      blocks: blocks([{ type: 'label', text: 'FULL REPORT' }, { type: 'title', text: '인생 전체를 18장으로' }, { type: 'body', text: '평생사주 100p 정식 리포트 · 14,900원' }, { type: 'button', text: '지금 보기 →' }]) }
  ];

  /* 블록 하나를 실제 요소로. 관리자가 넣은 글은 textContent로만 넣는다 —
     innerHTML로 넣으면 배너 문구에 태그를 적어 넣을 수 있게 된다. */
  // 색은 #rgb / #rrggbb 형식만 받는다. 저장할 때(bannerPositions.js)도 같은 검사를 하지만,
  // 그리는 쪽에서도 막아야 옛 데이터나 손으로 고친 JSON이 style로 새어들지 않는다.
  var COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  function buildBlock(block) {
    var style = BLOCK_STYLE[block.type] || BLOCK_STYLE.body;
    var el = document.createElement(style.tag);
    el.className = style.cls;
    el.textContent = block.text || '';
    var scale = Number(block.scale) || 1;
    el.style.fontSize = (style.size * scale) + 'px';
    if (COLOR_RE.test(block.color || '')) el.style.color = block.color;
    if (COLOR_RE.test(block.bgColor || '')) el.style.background = block.bgColor;
    return el;
  }

  function buildSlide(cfg) {
    var a = document.createElement('a');
    a.className = 'banner-slide' + (cfg.overlay === 'none' ? ' overlay-none' : cfg.overlay === 'weak' ? ' overlay-weak' : '');
    a.href = cfg.href || '#';
    a.style.alignItems = cfg.textVAlign === 'top' ? 'flex-start' : cfg.textVAlign === 'center' ? 'center' : 'flex-end';

    var img = document.createElement('img');
    img.src = cfg.image || '';
    img.alt = '';
    img.style.objectPosition = cfg.imagePosition || '50% 50%';
    a.appendChild(img);

    var copy = document.createElement('div');
    copy.className = 'banner-copy';
    copy.style.textAlign = cfg.textAlign || 'left';
    (cfg.blocks || []).forEach(function (block) { copy.appendChild(buildBlock(block)); });
    a.appendChild(copy);
    return a;
  }

  async function init() {
    var track = document.getElementById('bannerTrack');
    var dotsContainer = document.getElementById('bannerDots');
    if (!track || !dotsContainer) return;

    var banners = FALLBACK_BANNERS;
    try {
      var res = await fetch('/api/banners');
      var data = await res.json();
      if (Array.isArray(data.banners) && data.banners.length) banners = data.banners;
    } catch (e) {
      // 실패해도 폴백 배너로 그대로 보임
    }

    track.innerHTML = '';
    banners.forEach(function (cfg) { track.appendChild(buildSlide(cfg)); });
    dotsContainer.innerHTML = '';
    banners.forEach(function (_, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dot' + (i === 0 ? ' active' : '');
      btn.dataset.i = i;
      btn.setAttribute('aria-label', (i + 1) + '번 배너로 이동');
      dotsContainer.appendChild(btn);
    });

    var dots = Array.prototype.slice.call(dotsContainer.querySelectorAll('.dot'));
    var slideCount = banners.length;
    if (!slideCount) return;
    var AUTO_INTERVAL_MS = 4000;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var autoTimer = null;

    function goTo(i) {
      track.scrollTo({ left: track.children[i].offsetLeft, behavior: 'smooth' });
    }
    function current() {
      return Math.round(track.scrollLeft / track.clientWidth);
    }
    function stopAuto() {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    function startAuto() {
      if (reduceMotion || autoTimer || slideCount < 2) return;
      autoTimer = setInterval(function () { goTo((current() + 1) % slideCount); }, AUTO_INTERVAL_MS);
    }

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        stopAuto();
        goTo(Number(dot.dataset.i));
      });
    });

    var prevBtn = document.getElementById('bannerPrev');
    var nextBtn = document.getElementById('bannerNext');
    if (prevBtn) prevBtn.addEventListener('click', function () { stopAuto(); goTo((current() - 1 + slideCount) % slideCount); });
    if (nextBtn) nextBtn.addEventListener('click', function () { stopAuto(); goTo((current() + 1) % slideCount); });

    track.addEventListener('pointerdown', stopAuto, { once: true });
    track.addEventListener('scroll', function () {
      var i = current();
      dots.forEach(function (d, idx) { d.classList.toggle('active', idx === i); });
    }, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopAuto(); else startAuto();
    });

    startAuto();
  }

  // 배너 편집 화면도 같은 그리기 규칙을 써야 미리보기가 실제 배너와 어긋나지 않는다.
  window.BannerSlider = { buildSlide: buildSlide, buildBlock: buildBlock, BLOCK_STYLE: BLOCK_STYLE };
  init();
})();
