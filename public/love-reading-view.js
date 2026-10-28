(function (root) {
  'use strict';
  var VERSION = 1, MAX_ART = 10, uidN = 0;
  var LANDSCAPE = { meeting: 1, distance: 1, conversation: 1, 'new-start': 1 };
  var LABELS = { greeting: '여울의 인사', explain: '여울의 해설', empathy: '여울의 공감', thinking: '여울의 생각', caution: '여울의 당부', cheer: '여울의 응원', meeting: '만남의 장면', distance: '거리감의 장면', conversation: '대화의 장면', 'new-start': '새 출발의 장면' };
  var FALLBACKS = ['explain', 'thinking', 'empathy', 'cheer'];
  var active = typeof WeakMap === 'function' ? new WeakMap() : null;
  var ART_FILES = {greeting:'cover-comic',explain:'explain-comic',thinking:'thread-comic',empathy:'thread-comic',caution:'thread-comic',cheer:'door-comic',meeting:'timing-comic',distance:'thread-comic',conversation:'door-comic','new-start':'timing-comic'};

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
      else parent.appendChild(document.createTextNode(p.replace(/\*\*/g, '')));
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
    // 상품 페이지가 window.LOVE_READING_ART로 장면별 그림을 정하면 그것을 쓴다(신년운세·재회·궁합). 없으면 연애 그림.
    var custom = root.LOVE_READING_ART && root.LOVE_READING_ART[scene];
    img.src = custom || '/love-assets/reading/' + encodeURIComponent(ART_FILES[scene] || 'explain-comic') + '.webp';
    img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', function () { var p = wrap.parentNode; if (p) { p.classList.remove('has-art'); p.removeChild(wrap); } });
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

  // 문장 전체를 보존하며 대사를 짧은 호흡으로 나눈다. 숫자 날짜와 소수점은 분리하지 않는다.
  function dialogueBeats(text) {
    var s = str(text).trim(), out = [], start = 0;
    for (var i = 0; i < s.length; i++) {
      if (!/[.!?。！？]/.test(s[i])) continue;
      var end = i + 1;
      while (end < s.length && /[”’"'」』）)]/.test(s[end])) end++;
      if (end < s.length && !/\s/.test(s[end])) continue;
      if (s[i] === '.' && /\d/.test(s[i-1] || '') && /\d/.test(s.slice(end).trimStart()[0] || '')) continue;
      var part = s.slice(start,end).trim();
      if (part) out.push(part);
      start = end; i = end - 1;
    }
    var tail = s.slice(start).trim(); if (tail) out.push(tail);
    return out.length ? out : (s ? [s] : []);
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

  function monthBody(box, m) {
    var parts = arr(m.parts).length ? arr(m.parts) : [{ label:'', text:m.text }];
    parts.forEach(function (p) {
      if (p.label) box.appendChild(el('span', 'lr-month-label', p.label));
      dialogueBeats(p.text).forEach(function (t) { box.appendChild(richP('lr-mt', t)); });
    });
  }

  function monthPicker(months) {
    if (!months.length) return null;
    var picker = tabset(months, '달 골라 보기', 'lr-months', function (m) { return str(m.month) + '월'; }, function (d, m) {
      d.className = 'lr-detail lr-month-card';
      d.appendChild(el('b', null, (m.year ? m.year + '년 ' : '') + str(m.month) + '월'));
      monthBody(d, m);
    });
    var wrap = el('div', 'lr-month-reading');
    var all = el('div', 'lr-all-months');
    months.forEach(function(m) {
      var card = el('section', 'lr-month-card');
      card.appendChild(el('h3', 'lr-sub', (m.year ? m.year + '년 ' : '') + m.month + '월'));
      monthBody(card, m);
      all.appendChild(card);
    });
    var toggle = el('button', 'lr-month-toggle', '한 달씩 골라 읽기'); toggle.type='button'; toggle.setAttribute('aria-expanded','true');
    picker.hidden=true;
    toggle.addEventListener('click',function(){
      all.hidden=!all.hidden; picker.hidden=!picker.hidden;
      toggle.textContent=all.hidden?'열두 달 펼쳐 읽기':'한 달씩 골라 읽기';
      toggle.setAttribute('aria-expanded',String(!all.hidden));
    });
    wrap.appendChild(toggle); wrap.appendChild(all); wrap.appendChild(picker); return wrap;
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

  // 잠금된 개인 결과를 미리 생성하거나 DOM에 싣지 않는다.
  function lockedPreview(title, description, type, unlock) {
    var card = el('div', 'lr-panel lr-teaser lr-teaser-inline');
    card.dataset.lockKind = type || 'person';
    card.appendChild(el('strong', 'lr-teaser-title', title));
    card.appendChild(el('p', 'lr-teaser-description', description));
    var veiled = el('div', 'lr-veiled'); veiled.setAttribute('aria-hidden','true');
    if (type === 'timing') {
      var calendar = el('div','lr-calendar');
      for(var d=0;d<12;d++) calendar.appendChild(el('i'));
      veiled.appendChild(calendar);
    } else {
      ['분위기와 표현 방식','서로 끌리는 이유','관계를 이어갈 단서'].forEach(function(label){
        var row=el('div','lr-hidden-row'); row.appendChild(el('span',null,label)); row.appendChild(el('i')); veiled.appendChild(row);
      });
    }
    card.appendChild(veiled);
    var button=el('button','lr-teaser-lock','전체 풀이에서 이어 읽기'); button.type='button';
    button.setAttribute('aria-label',title+' — 전체 풀이 구매 안내');
    button.addEventListener('click',function(e){if(unlock) unlock(e); else button.dispatchEvent(new CustomEvent('love:unlock',{bubbles:true}));});
    card.appendChild(button);
    return card;
  }

  function reportContents(budget, unlock) {
    var wrap=el('section','lr-contents');
    wrap.appendChild(el('p','lr-eyebrow','THE FULL STORY'));
    wrap.appendChild(el('h3','lr-contents-title','이 안에 담긴,\n당신의 일곱 가지 이야기.'));
    var groups=[['01','인연이 움직이는 시간','meeting',['인연 신호가 강한 세 달','앞으로 12개월, 달마다 흐름과 행동']],['02','서로를 알아보는 순간','explain',['나에게 끌리는 사람과 내가 끌리는 사람','만남이 생기기 쉬운 자리']],['03','되풀이하지 않을 사랑','thinking',['반복되기 쉬운 연애 패턴','조심할 관계의 신호']],['04','지금, 내가 할 수 있는 일','cheer',['지금 연애 상황에 맞는 행동 제안']]];
    groups.forEach(function(g){
      var card=el('article','lr-content-card'); var a=art(g[2],'',budget); if(a)card.appendChild(a);
      var text=el('div','lr-content-copy'); text.appendChild(el('span','lr-eyebrow','PART '+g[0])); text.appendChild(el('h4',null,g[1]));
      var ul=el('ul');g[3].forEach(function(t){ul.appendChild(el('li',null,t));});text.appendChild(ul);card.appendChild(text);wrap.appendChild(card);
    });
    var note=el('p','lr-note','한 사람의 사주와 현재 연애 상황으로 만드는 모바일 웹 리포트입니다.');wrap.appendChild(note);
    return wrap;
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
    if(kind==='free') {
      var order=['welcome','charm','seasons','evidence','balance','whole-reading'];
      chapters=chapters.slice().sort(function(a,b){return order.indexOf(a.id)-order.indexOf(b.id);});
    }
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
      var nav = el('div', 'lr-toc'); nav.setAttribute('role', 'navigation'); nav.setAttribute('aria-label', '목차');
      nav.appendChild(el('p', 'lr-toc-title', '목차'));
      var list = el('div', 'lr-toc-list');
      chapters.forEach(function (c, i) {
        var b = el('button', 'lr-toc-btn'); b.type = 'button'; b.appendChild(el('span', 'lr-toc-n', String(i + 1).padStart(2, '0'))); b.appendChild(document.createTextNode(titles[i]));
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
      var sc0 = str(c.scene);
      var cut = LANDSCAPE[sc0] ? (i % 2 ? 'lr-cut-inset' : 'lr-cut-wide') : (i % 2 ? 'lr-cut-tall' : 'lr-cut-wide');
      sec.classList.add('lr-tone-' + (i % 2));
      var a = art(sc0, LABELS[sc0] || '', budget, cut);
      sec.appendChild(sectionHead(c.displayTitle || titles[i], kind==='free' ? Math.max(0,i-1) : i));
      if (c.featured) sec.appendChild(el('p','lr-focus-note','먼저 궁금해하셨던 이야기'));
      if (a) { sec.classList.add('has-art'); sec.appendChild(a); }

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
      if (c.speech && kind !== 'paid') lead.push({type:'speech',text:c.speech});
      else while (k < blocks.length && lead.length < 1 && blocks[k].type === 'speech' && str(blocks[k].text).length <= 60) { lead.push(blocks[k]); k++; }
      var rest = blocks.slice(k);
      // 긴 첫 해설은 첫 문장만 말풍선에 두고 나머지를 본문으로 이어 읽는다.
      if (lead.length === 1 && lead[0].type === 'prose') {
        var firstText = str(lead[0].text);
        var boundary = /[.!?。！？](?=\s|$)/.exec(firstText);
        if (boundary && boundary.index + 1 < firstText.length) {
          var remainder = firstText.slice(boundary.index + 1).trim();
          if (remainder) {
            lead = [{ type:'prose', text:firstText.slice(0, boundary.index + 1) }];
            rest.unshift({ type:'prose', text:remainder });
          }
        }
      }
      if (c.label) sec.appendChild(el('p', 'lr-chip', c.label));
      if (lead.length) {
        var talk = el('div', 'lr-talk');
        if (a && lead.length === 1 && str(lead[0].text).length <= 60) talk.classList.add('lr-overlay');
        lead.forEach(function (b) { talk.appendChild(bubble(b.text)); });
        sec.appendChild(talk);
      }
      if (rest.length) {
        var paper = el('div', 'lr-paper');
        var midAt = -1;
        rest.forEach(function (b, n) {
          if (n === midAt && budget.left > chapters.length - i - 1) {
            var sc = extraScenes.shift(); extraScenes.push(sc);
            var m = art(sc, LABELS[sc], budget, 'lr-art-inline'); if (m) paper.appendChild(m);
          }
          if (b.type === 'heading') paper.appendChild(rich(el('h3', 'lr-h3 ' + (/^\d{4}\s*년\s*\d{1,2}\s*월/.test(str(b.text)) ? 'lr-h3-date' : 'lr-h3-label')), b.text));
          else if (b.type === 'action') paper.appendChild(richP('lr-pt lr-act', b.text));
          else dialogueBeats(b.text).forEach(function (beat) { paper.appendChild(richP('lr-pt',beat)); });
        });
        sec.appendChild(paper);
      }

      var extra = null;
      if (kind === 'free') {
        if (ids[i] === 'welcome') { extra = pillarsDetails(arr(facts.pillars), str(facts.note)); if(extra) {extra.open=true; extra.classList.add('lr-profile');} }
        else if (ids[i] === 'balance') extra = balanceChart(facts.balance);
        else if (ids[i] === 'seasons') extra = seasonPicker(arr(facts.seasons));
        else if (i === chapters.length - 1) extra = lockedList(arr(facts.locked));
      } else {
        if (ids[i] === 'months') extra = monthPicker(arr(model.months));
        else if (allBlocks.some(function (b) { return b.type === 'action'; })) extra = checklist({ id: ids[i], blocks: allBlocks }, st);
      }
      if (extra) sec.appendChild(extra);
      if (kind === 'free' && ids[i] === 'charm') {
        sec.appendChild(lockedPreview('나에게 끌리는 사람은?', '내가 끌리는 사람과 나에게 끌리는 사람. 그 차이까지 이어서 살펴봐요.','person',opts.onUnlock));
      }
      if (kind === 'free' && ids[i] === 'seasons') {
        sec.appendChild(lockedPreview('가장 강한 두 달은 언제일까요?', '세 번째 달을 봤다면, 이제 1·2위 두 달과 월별 흐름, 그때 해볼 일을 알아볼 차례예요.','timing',opts.onUnlock));
      }
      if(kind==='free' && ids[i]==='balance') sec.appendChild(lockedPreview('반복되는 관계를 바꾸려면', '되풀이되는 패턴과 조심할 신호, 지금 상황에 맞는 행동을 전체 풀이에서 읽어요.','action',opts.onUnlock));
      if(kind==='free' && ids[i]==='whole-reading') sec.appendChild(reportContents(budget,opts.onUnlock));
      reader.appendChild(sec);
    });

    if (kind === 'paid' && model.original) {
      var od = el('details', 'lr-details lr-original');
      od.appendChild(el('summary', null, '원문 그대로 보기'));
      od.appendChild(el('pre', 'lr-pre', model.original));
      reader.appendChild(od);
    }
    container.appendChild(reader);

    var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var arts = [].slice.call(reader.querySelectorAll('.lr-art img'));
    var ticking = false;
    function paintParallax() {
      ticking = false;
      var vh = root.innerHeight || 800;
      arts.forEach(function (img) {
        var box = img.parentNode && img.parentNode.getBoundingClientRect();
        if (!box || box.bottom < -120 || box.top > vh + 120) return;
        var p = (box.top + box.height / 2 - vh / 2) / vh;
        img.style.transform = 'translate3d(0,' + (p * -30).toFixed(1) + 'px,0) scale(1.15)';
      });
    }
    function onParallaxScroll() { if (!ticking) { ticking = true; root.requestAnimationFrame(paintParallax); } }
    if (!reduceMotion && arts.length && root.requestAnimationFrame) {
      reader.classList.add('lr-parallax');
      root.addEventListener('scroll', onParallaxScroll, { passive: true });
      root.addEventListener('resize', onParallaxScroll);
      listeners.push(['scroll', onParallaxScroll], ['resize', onParallaxScroll]);
      paintParallax();
    }

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
