(function (root) {
  'use strict';
  /* 장면형 읽기 화면(공용). 글은 모두 DOM 텍스트로만 넣고 innerHTML을 쓰지 않는다.
     love-reading-view.js의 읽기 화면에서 유료 리포트 읽기만 떼어 내, 운영에서 막히지 않는 경로(/reading-assets/…)로 옮긴 것이다. */
  var VERSION = 1, MAX_ART = 10;
  var LANDSCAPE = { meeting: 1, distance: 1, conversation: 1, 'new-start': 1 };
  var LABELS = { greeting: '여울의 인사', explain: '여울의 해설', empathy: '여울의 공감', thinking: '여울의 생각', caution: '여울의 당부', cheer: '여울의 응원', meeting: '만남의 장면', distance: '거리감의 장면', conversation: '대화의 장면', 'new-start': '새 출발의 장면' };
  var FALLBACKS = ['explain', 'thinking', 'empathy', 'cheer'];
  var active = typeof WeakMap === 'function' ? new WeakMap() : null;

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null && txt !== '') n.textContent = String(txt);
    return n;
  }
  function str(v) { return v == null ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }

  function rich(parent, text) {
    str(text).split(/\*\*([^*\n]+?)\*\*/).forEach(function (p, i) {
      if (!p) return;
      if (i % 2) parent.appendChild(el('strong', null, p));
      else parent.appendChild(document.createTextNode(p));
    });
    return parent;
  }
  function richP(cls, text) { return rich(el('p', cls), text); }

  // 저장하는 것은 읽던 장 id뿐이다(주문번호별).
  function store(prefix, reportId) {
    var key = prefix && reportId ? prefix + ':v' + VERSION + ':' + reportId : '';
    var state = { chapter: '' };
    if (key) {
      try { var d = JSON.parse(root.localStorage.getItem(key) || '{}'); if (typeof d.chapter === 'string') state.chapter = d.chapter; } catch (e) {}
    }
    return {
      enabled: !!key, saved: state.chapter,
      setChapter: function (id) { if (!key || state.chapter === id) return; state.chapter = id; try { root.localStorage.setItem(key, JSON.stringify({ chapter: id })); } catch (e) {} }
    };
  }

  function art(base, scene, budget, extraCls) {
    if (!scene || !LABELS[scene] || budget.left <= 0) return null;
    budget.left--;
    var wrap = el('figure', 'lr-art ' + (LANDSCAPE[scene] ? 'lr-art-scene' : 'lr-art-portrait') + (extraCls ? ' ' + extraCls : ''));
    var img = document.createElement('img');
    img.src = base + encodeURIComponent(scene) + '.webp';
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); });
    wrap.appendChild(img);
    wrap.appendChild(el('figcaption', 'lr-art-label', LABELS[scene]));
    return wrap;
  }

  function bubble(text) {
    var b = el('div', 'lr-bubble');
    b.appendChild(el('span', 'lr-speaker', '여울'));
    b.appendChild(richP('lr-bt', text));
    return b;
  }

  function render(container, model, opts) {
    opts = opts || {};
    if (!container) return function () {};
    if (active && active.has(container)) { try { active.get(container)(); } catch (e) {} }
    model = model || {};
    var chapters = arr(model.chapters).filter(Boolean);
    if (!chapters.length) throw new Error('읽기 화면에 보여 줄 장이 없습니다.');
    var base = opts.assetBase || '/reading-assets/reading/';
    var st = store(opts.storagePrefix || 'reading', opts.reportId);
    var budget = { left: MAX_ART };
    var listeners = [];
    container.replaceChildren();

    var reader = el('div', 'lr-reader lr-paid ' + (opts.className || ''));
    reader.setAttribute('role', 'region');
    reader.setAttribute('aria-label', str(opts.ariaLabel || model.title) || '리포트');
    if (model.title) reader.appendChild(el('h1', 'lr-main-title', model.title));
    if (model.lead) reader.appendChild(richP('lr-lead', model.lead));

    var interacted = false;
    function onInteract() { interacted = true; }
    if (st.enabled) {
      ['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach(function (ev) {
        root.addEventListener(ev, onInteract, { passive: true });
        listeners.push([ev, onInteract]);
      });
    }

    var ids = chapters.map(function (c, i) { return str(c.id) || 'c' + i; });
    var sections = {}, navBtns = {};
    function mark(id) {
      Object.keys(navBtns).forEach(function (k) { if (k === id) navBtns[k].setAttribute('aria-current', 'true'); else navBtns[k].removeAttribute('aria-current'); });
    }
    function go(id) {
      var s = sections[id]; if (!s) return;
      interacted = true;
      var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      s.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      var h = s.querySelector('.lr-title'); if (h) h.focus({ preventScroll: true });
      mark(id); st.setChapter(id);
    }
    if (chapters.length > 1) {
      var savedId = st.enabled && st.saved && ids.indexOf(st.saved) > 0 ? st.saved : '';
      if (savedId) {
        var rb = el('button', 'lr-resume', '이어 읽기 · ' + str(chapters[ids.indexOf(savedId)].short || chapters[ids.indexOf(savedId)].title));
        rb.type = 'button';
        rb.addEventListener('click', function () { go(savedId); });
        reader.appendChild(rb);
      }
      var nav = el('nav', 'lr-nav'); nav.setAttribute('aria-label', '장 이동');
      var list = el('div', 'lr-nav-list');
      chapters.forEach(function (c, i) {
        var b = el('button', 'lr-nav-btn', (i + 1) + '. ' + str(c.short || c.title)); b.type = 'button';
        b.setAttribute('title', str(c.title));
        b.addEventListener('click', function () { go(ids[i]); });
        navBtns[ids[i]] = b; list.appendChild(b);
      });
      nav.appendChild(list); reader.appendChild(nav);
    }

    var extraScenes = FALLBACKS.slice();
    chapters.forEach(function (c, i) {
      var sec = el('article', 'lr-chapter'); sec.dataset.chapterId = ids[i];
      sections[ids[i]] = sec;
      var head = el('div', 'lr-head');
      head.appendChild(el('span', 'lr-num', String(i + 1).padStart(2, '0')));
      var h2 = el('h2', 'lr-title', str(c.title)); h2.tabIndex = -1;
      head.appendChild(h2); sec.appendChild(head);
      var a = art(base, str(c.scene), budget);
      if (a) sec.appendChild(a);

      var blocks = arr(c.blocks).filter(Boolean);
      var lead = blocks.length && blocks[0].type !== 'heading' ? [blocks[0]] : [];
      var rest = blocks.slice(lead.length);
      if (lead.length) {
        var talk = el('div', 'lr-talk');
        talk.appendChild(bubble(lead[0].text));
        sec.appendChild(talk);
      }
      if (rest.length) {
        var paper = el('div', 'lr-paper');
        var midAt = rest.length > 7 ? Math.ceil(rest.length / 2) : -1;
        rest.forEach(function (b, n) {
          if (n === midAt && budget.left > chapters.length - i - 1) {
            var sc = extraScenes.shift(); extraScenes.push(sc);
            var m = art(base, sc, budget, 'lr-art-inline'); if (m) paper.appendChild(m);
          }
          if (b.type === 'heading') paper.appendChild(rich(el('h3', 'lr-h3'), b.text));
          else paper.appendChild(richP('lr-pt', b.text));
        });
        sec.appendChild(paper);
      }
      reader.appendChild(sec);
    });

    if (model.original) {
      var od = el('details', 'lr-details lr-original');
      od.appendChild(el('summary', null, '원문 그대로 보기'));
      od.appendChild(el('pre', 'lr-pre', model.original));
      reader.appendChild(od);
    }
    container.appendChild(reader);

    var io = null;
    if (root.IntersectionObserver && st.enabled) {
      io = new root.IntersectionObserver(function (entries) {
        if (!interacted) return;
        entries.forEach(function (e) {
          if (e.isIntersecting) { var id = e.target.dataset.chapterId; mark(id); st.setChapter(id); }
        });
      }, { rootMargin: '-35% 0px -55% 0px' });
      Object.keys(sections).forEach(function (k) { io.observe(sections[k]); });
    }
    var done = false;
    function cleanup() {
      if (done) return; done = true;
      if (io) io.disconnect();
      listeners.forEach(function (l) { root.removeEventListener(l[0], l[1]); });
      if (reader.parentNode === container) container.removeChild(reader);
      if (active && active.get(container) === cleanup) active.delete(container);
    }
    if (active) active.set(container, cleanup);
    return cleanup;
  }

  root.ReadingView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
