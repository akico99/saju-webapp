(function (root) {
  'use strict';
  var VERSION = 1, MAX_ART = 10, uidN = 0;
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
  function safeColor(c) { return /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$|^rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)$/.test(str(c)) ? c : ''; }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }

  // **bold** -> <strong> via DOM only
  function rich(parent, text) {
    var parts = str(text).split(/\*\*([^*\n]+?)\*\*/);
    parts.forEach(function (p, i) {
      if (!p) return;
      if (i % 2) parent.appendChild(el('strong', null, p));
      else parent.appendChild(document.createTextNode(p));
    });
    return parent;
  }
  function richP(cls, text) { return rich(el('p', cls), text); }

  function store(reportId) {
    var key = reportId ? 'love-reading:v' + VERSION + ':' + reportId : '';
    var state = { chapter: '', checks: {} };
    if (key) {
      try {
        var d = JSON.parse(root.localStorage.getItem(key) || '{}');
        if (typeof d.chapter === 'string') state.chapter = d.chapter;
        if (d.checks && typeof d.checks === 'object') Object.keys(d.checks).forEach(function (k) { if (d.checks[k] === true) state.checks[k] = true; });
      } catch (e) {}
    }
    function write() { if (!key) return; try { root.localStorage.setItem(key, JSON.stringify({ chapter: state.chapter, checks: state.checks })); } catch (e) {} }
    return {
      enabled: !!key, state: state, saved: state.chapter,
      setChapter: function (id) { if (state.chapter !== id) { state.chapter = id; write(); } },
      setCheck: function (id, v) { if (v) state.checks[id] = true; else delete state.checks[id]; write(); }
    };
  }

  function art(scene, label, budget, extraCls) {
    if (!scene || budget.left <= 0) return null;
    budget.left--;
    var wrap = el('figure', 'lr-art ' + (LANDSCAPE[scene] ? 'lr-art-scene' : 'lr-art-portrait') + (extraCls ? ' ' + extraCls : ''));
    var img = document.createElement('img');
    img.src = '/love-assets/reading/' + encodeURIComponent(scene) + '.webp';
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); });
    wrap.appendChild(img);
    if (label) wrap.appendChild(el('figcaption', 'lr-art-label', label));
    return wrap;
  }

  function bubble(text) {
    var b = el('div', 'lr-bubble');
    b.appendChild(el('span', 'lr-speaker', '여울'));
    var lines = str(text).split(/\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) lines = [str(text)];
    lines.forEach(function (line) { b.appendChild(richP('lr-bt', line)); });
    return b;
  }

  function sectionHead(title, idx) {
    var h = el('header', 'lr-head');
    h.appendChild(el('span', 'lr-num', String(idx + 1).padStart(2, '0')));
    var h2 = el('h2', 'lr-title', title); h2.tabIndex = -1;
    h.appendChild(h2);
    return h;
  }

  function pillarsDetails(pillars, note) {
    if (!pillars.length) return null;
    var d = el('details', 'lr-details');
    d.appendChild(el('summary', null, '내 명식 근거 보기'));
    var grid = el('div', 'lr-pillars');
    pillars.forEach(function (p) {
      p = p || {};
      var box = el('div', 'lr-pillar' + (p.key === 'day' ? ' is-day' : ''));
      box.appendChild(el('span', null, p.key === 'day' ? '일주 · 나' : str(p.ko)));
      box.appendChild(el('b', null, p.hanja));
      box.appendChild(el('small', null, p.ganzi));
      grid.appendChild(box);
    });
    d.appendChild(grid);
    if (note) d.appendChild(el('p', 'lr-note', note));
    return d;
  }

  function balanceChart(balance) {
    var bars = Array.isArray(balance) ? balance : arr(balance && balance.bars);
    if (!bars.length) return null;
    var box = el('div', 'lr-panel lr-balance');
    box.appendChild(el('h3', 'lr-sub', '오행 균형'));
    bars.forEach(function (x) {
      x = x || {};
      var row = el('div', 'lr-bar');
      var name = el('span', 'lr-bar-name');
      name.appendChild(el('b', null, (str(x.ko) + ' ' + str(x.el)).trim()));
      var w = str(x.word).split('·')[0];
      if (w) name.appendChild(el('em', null, w));
      var track = el('span', 'lr-track');
      var fill = el('i');
      fill.style.width = Math.max(0, Math.min(100, num(x.pct, 0))) + '%';
      var c = safeColor(x.color); if (c) fill.style.background = c;
      track.appendChild(fill);
      row.appendChild(name); row.appendChild(track);
      row.appendChild(el('span', 'lr-bar-val', str(x.count) + '개'));
      box.appendChild(row);
    });
    return box;
  }

  function tabset(items, title, cls, labelOf, paint) {
    var uid = 'lr-t' + (++uidN);
    var box = el('div', 'lr-panel ' + cls);
    box.appendChild(el('h3', 'lr-sub', title));
    var tabs = el('div', 'lr-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', title);
    var detail = el('div', 'lr-detail'); detail.id = uid + '-p'; detail.setAttribute('role', 'tabpanel'); detail.setAttribute('aria-live', 'polite');
    var btns = [];
    function pick(i, focus) {
      btns.forEach(function (b, k) { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
      detail.setAttribute('aria-labelledby', btns[i].id);
      detail.replaceChildren(); paint(detail, items[i] || {});
      if (focus) btns[i].focus();
    }
    items.forEach(function (s, i) {
      var b = el('button', 'lr-tab', labelOf(s || {})); b.type = 'button'; b.id = uid + '-' + i;
      b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', detail.id);
      b.addEventListener('click', function () { pick(i); });
      b.addEventListener('keydown', function (e) {
        var t = -1, n = items.length;
        if (e.key === 'ArrowRight') t = (i + 1) % n;
        else if (e.key === 'ArrowLeft') t = (i - 1 + n) % n;
        else if (e.key === 'Home') t = 0;
        else if (e.key === 'End') t = n - 1;
        if (t >= 0) { e.preventDefault(); pick(t, true); }
      });
      btns.push(b); tabs.appendChild(b);
    });
    box.appendChild(tabs); box.appendChild(detail);
    pick(0);
    return box;
  }

  function seasonPicker(seasons) {
    if (!seasons.length) return null;
    return tabset(seasons, '계절별 인연 흐름', 'lr-seasons', function (s) { return str(s.label); }, function (d, s) {
      d.className = 'lr-detail lr-season-detail';
      var meter = el('span', 'lr-meter'); var f = el('i');
      f.style.height = Math.max(12, Math.min(100, num(s.avg, 0))) + '%'; meter.appendChild(f);
      var t = el('div', 'lr-season-text');
      t.appendChild(el('b', null, str(s.label)));
      t.appendChild(el('span', null, '흐름 ' + str(s.level) + (s.avg != null ? ' · 평균 ' + str(s.avg) : '')));
      d.appendChild(meter); d.appendChild(t);
    });
  }

  function monthPicker(months) {
    if (!months.length) return null;
    return tabset(months, '달 골라 보기', 'lr-months', function (m) { return str(m.month) + '월'; }, function (d, m) {
      d.className = 'lr-detail lr-month-card';
      d.appendChild(el('b', null, (m.year ? m.year + '년 ' : '') + str(m.month) + '월'));
      d.appendChild(richP('lr-mt', m.text));
    });
  }

  function lockedList(list) {
    if (!list.length) return null;
    var box = el('div', 'lr-panel lr-locked');
    box.appendChild(el('h3', 'lr-sub', '전체 풀이에서 더 알려 드려요'));
    var ul = el('ul');
    list.forEach(function (t) { ul.appendChild(el('li', null, t)); });
    box.appendChild(ul);
    return box;
  }

  function checklist(ch, st) {
    var acts = [];
    arr(ch.blocks).forEach(function (b, i) { if (b && b.type === 'action') acts.push({ id: ch.id + ':' + i, text: str(b.text) }); });
    if (!acts.length) return null;
    var box = el('div', 'lr-panel lr-check');
    box.appendChild(el('h3', 'lr-sub', '실천 체크'));
    var ul = el('ul');
    acts.forEach(function (a) {
      var li = el('li'); var lab = el('label');
      var cb = document.createElement('input'); cb.type = 'checkbox';
      cb.checked = !!st.state.checks[a.id];
      li.classList.toggle('is-done', cb.checked);
      cb.addEventListener('change', function () { st.setCheck(a.id, cb.checked); li.classList.toggle('is-done', cb.checked); });
      lab.appendChild(cb); lab.appendChild(rich(el('span'), a.text));
      li.appendChild(lab); ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  function render(container, model, opts) {
    opts = opts || {};
    if (!container) return function () {};
    if (active && active.has(container)) { try { active.get(container)(); } catch (e) {} }
    model = model || {};
    var kind = model.kind === 'paid' ? 'paid' : 'free';
    var chapters = arr(model.chapters);
    var facts = model.facts || {};
    var st = store(kind === 'paid' ? opts.reportId : '');
    var budget = { left: MAX_ART };
    var listeners = [];
    container.replaceChildren();

    var reader = el('div', 'lr-reader lr-' + kind);
    reader.setAttribute('role', 'region');
    reader.setAttribute('aria-label', str(model.title) || '연애 리포트');
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

    var ids = chapters.map(function (c, i) { return str(c && c.id) || 'c' + i; });
    var titles = chapters.map(function (c, i) { return ids[i] === 'attraction' ? '서로 끌리는 이유' : str(c && c.title); });
    var monthList = arr(model.months).filter(Boolean);
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
    if (kind === 'paid' && chapters.length > 1) {
      var savedId = st.enabled && st.saved && ids.indexOf(st.saved) > 0 ? st.saved : '';
      if (savedId) {
        var rb = el('button', 'lr-resume', '이어 읽기 · ' + titles[ids.indexOf(savedId)]);
        rb.type = 'button';
        rb.addEventListener('click', function () { go(savedId); });
        reader.appendChild(rb);
      }
      var nav = el('nav', 'lr-nav'); nav.setAttribute('aria-label', '장 이동');
      var list = el('div', 'lr-nav-list');
      chapters.forEach(function (c, i) {
        var b = el('button', 'lr-nav-btn', (i + 1) + '. ' + titles[i]); b.type = 'button';
        b.addEventListener('click', function () { go(ids[i]); });
        navBtns[ids[i]] = b; list.appendChild(b);
      });
      nav.appendChild(list); reader.appendChild(nav);
    }

    var extraScenes = FALLBACKS.slice();
    chapters.forEach(function (c, i) {
      c = c || {};
      var sec = el('article', 'lr-chapter'); sec.dataset.chapterId = ids[i];
      sections[ids[i]] = sec;
      sec.appendChild(sectionHead(titles[i], i));
      var a = art(str(c.scene), LABELS[c.scene] || '', budget);
      if (a) sec.appendChild(a);

      var allBlocks = arr(c.blocks).filter(Boolean);
      var blocks = allBlocks;
      if (kind === 'paid' && ids[i] === 'months' && monthList.length) {
        var norm = function (s) { return str(s).replace(/\s+/g, ' ').trim(); };
        blocks = allBlocks.filter(function (b) {
          if (b.type === 'heading') return true;
          var t = norm(b.text);
          if (!t) return true;
          monthList.forEach(function (m) {
            var mt = norm(m.text);
            if (!mt) return;
            var forms = [];
            if (m.year) forms.push(m.year + '년 ' + m.month + '월');
            forms.push(m.month + '월');
            forms.forEach(function (pre) {
              [': ', ':', '： ', '：'].forEach(function (sep) {
                t = t.split('- ' + pre + sep + mt).join('').split('• ' + pre + sep + mt).join('').split('* ' + pre + sep + mt).join('').split(pre + sep + mt).join('');
              });
            });
          });
          return t.replace(/[\s\-•*]+/g, '') !== '';
        });
      }
      var lead = [], k = 0;
      while (k < blocks.length && lead.length < 2 && blocks[k].type !== 'heading' && blocks[k].type !== 'action' && (blocks[k].type === 'speech' || (lead.length === 0))) { lead.push(blocks[k]); k++; }
      var rest = blocks.slice(k);
      if (c.label) sec.appendChild(el('p', 'lr-chip', c.label));
      if (lead.length) {
        var talk = el('div', 'lr-talk');
        lead.forEach(function (b) { talk.appendChild(bubble(b.text)); });
        sec.appendChild(talk);
      }
      if (rest.length) {
        var paper = el('div', 'lr-paper');
        var midAt = rest.length > 7 ? Math.ceil(rest.length / 2) : -1;
        rest.forEach(function (b, n) {
          if (n === midAt && budget.left > chapters.length - i - 1) {
            var sc = extraScenes.shift(); extraScenes.push(sc);
            var m = art(sc, LABELS[sc], budget, 'lr-art-inline'); if (m) paper.appendChild(m);
          }
          if (b.type === 'heading') paper.appendChild(rich(el('h3', 'lr-h3'), b.text));
          else paper.appendChild(richP('lr-pt' + (b.type === 'action' ? ' lr-act' : ''), b.text));
        });
        sec.appendChild(paper);
      }

      var extra = null;
      if (kind === 'free') {
        if (ids[i] === 'evidence') extra = pillarsDetails(arr(facts.pillars), str(facts.note));
        else if (ids[i] === 'balance') extra = balanceChart(facts.balance);
        else if (ids[i] === 'seasons') extra = seasonPicker(arr(facts.seasons));
        else if (i === chapters.length - 1) extra = lockedList(arr(facts.locked));
      } else {
        if (ids[i] === 'months') extra = monthPicker(arr(model.months));
        else if (allBlocks.some(function (b) { return b.type === 'action'; })) extra = checklist({ id: ids[i], blocks: allBlocks }, st);
      }
      if (extra) sec.appendChild(extra);
      reader.appendChild(sec);
    });

    if (kind === 'paid' && model.original) {
      var od = el('details', 'lr-details lr-original');
      od.appendChild(el('summary', null, '원문 그대로 보기'));
      od.appendChild(el('pre', 'lr-pre', model.original));
      reader.appendChild(od);
    }
    container.appendChild(reader);

    var io = null;
    if (kind === 'paid' && root.IntersectionObserver && st.enabled) {
      io = new root.IntersectionObserver(function (entries) {
        if (!interacted) return;
        entries.forEach(function (e) {
          if (e.isIntersecting) { var id = e.target.dataset.chapterId; mark(id); st.setChapter(id); }
        });
      }, { rootMargin: '-35% 0px -55% 0px' });
      Object.keys(sections).forEach(function (k2) { io.observe(sections[k2]); });
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

  root.LoveReadingView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
