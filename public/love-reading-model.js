(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LoveReadingModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const clean = v => v == null ? '' : String(v);
  const situationKo = { single:'솔로', some:'썸', dating:'연애 중', breakup:'이별 후' };
  const GROUP_MAX = 240, GROUP_GOAL = 180, GROUP_SENTENCES = 3;
  const TERMS = '.!?。！？…', CLOSERS = '"\'”’)]」』）';
  // 화면에 보이는 ** 표시만 걷어내고 글자는 그대로 둔다. 원문 전체는 model.original에 따로 있다.
  const stripInline = s => clean(s).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, '');
  const tidy = s => stripInline(s).replace(/[ \t]+/g, ' ').trim();

  // 문장 경계: 마침표/물음표/느낌표 뒤 공백. 소수점, 날짜(2026. 12. 3), 번호(1. )는 자르지 않는다.
  function sentences(text) {
    const s = clean(text).replace(/\s+/g, ' ').trim(), n = s.length, out = [];
    let start = 0;
    for (let i = 0; i < n; i++) {
      if (TERMS.indexOf(s[i]) < 0) continue;
      let j = i; while (j + 1 < n && TERMS.indexOf(s[j + 1]) >= 0) j++;
      let k = j; while (k + 1 < n && CLOSERS.indexOf(s[k + 1]) >= 0) k++;
      if (k + 1 >= n) break;
      if (s[k + 1] !== ' ') { i = k; continue; }
      if (s[i] === '.' && j === i && k === i) {
        if (/\d/.test(s[i - 1] || '') && /\d/.test(s[k + 2] || '')) { i = k; continue; }
        if (/^\d{1,2}$/.test(s.slice(start, i).trim())) { i = k; continue; }
      }
      out.push(s.slice(start, k + 1).trim()); start = k + 1; i = k;
    }
    const rest = s.slice(start).trim();
    if (rest) out.push(rest);
    return out;
  }
  // 1~3문장, 약 180~240자씩 묶는다. 한 문장이 길어도 자르지 않는다.
  function group(list) {
    const out = []; let cur = '', count = 0;
    for (const t of list) {
      if (cur && (count >= GROUP_SENTENCES || cur.length >= GROUP_GOAL || cur.length + 1 + t.length > GROUP_MAX)) { out.push(cur); cur = ''; count = 0; }
      cur = cur ? cur + ' ' + t : t; count++;
    }
    if (cur) out.push(cur);
    return out;
  }
  const BULLET = /^(?:[-*•·▪‣●○]\s+(.+)|\d{1,2}[.)]\s+(?!\d)(.+))$/;
  const bulletText = line => { const m = BULLET.exec(line); return m ? (m[1] || m[2]) : null; };
  const LABEL = /^\*\*([^*\n]{1,24}?)\*\*\s*([:：])?\s*(.*)$/;
  const ACTION_LABEL = /(행동|실천|할 일|해볼 일|해볼 만한)/;

  // 문단 → [{type:'prose'|'action'|'heading', text}]. 체크 항목은 명시한 글머리표나 행동 라벨 아래 글만 action이 된다.
  function splitBlocks(text, actionChapter) {
    const out = []; let inAction = false;
    for (const para of clean(text).split(/\r?\n\s*\r?\n/)) {
      const lines = para.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      if (!lines.length) continue;
      if (!(inAction && bulletText(lines[0]) != null)) inAction = false;
      let run = [];
      const flush = () => { for (const g of group(run)) out.push({ type: inAction ? 'action' : 'prose', text: g }); run = []; };
      for (const line of lines) {
        const lab = LABEL.exec(line);
        if (lab) {
          const name = tidy(lab[1]).replace(/\s*[:：]\s*$/, ''), rest = lab[3].trim();
          if (name && (!rest || lab[2] || /^(근거|행동)$/.test(name))) {
            flush(); inAction = ACTION_LABEL.test(name);
            out.push({ type: 'heading', text: name });
            if (rest) {
              const bt = bulletText(rest);
              if (bt != null) out.push({ type: inAction ? 'action' : 'prose', text: tidy(bt) });
              else run.push(...sentences(tidy(rest)));
            }
            continue;
          }
        }
        const bt = bulletText(line);
        if (bt != null) { flush(); out.push({ type: inAction || actionChapter ? 'action' : 'prose', text: tidy(bt) }); continue; }
        run.push(...sentences(tidy(line)));
      }
      flush();
    }
    return out.filter(b => b.text);
  }

  const sceneById = { top:'meeting', attraction:'empathy', where:'conversation', pattern:'distance', caution:'caution', action:'cheer', months:'new-start' };
  const scenes = [[/한 줄 답|인사|표지/,'greeting'],[/매력|특징|끌리는 사람/,'empathy'],[/자리|만남/,'conversation'],[/패턴/,'distance'],[/조심|신호/,'caution'],[/실천|행동|할 일/,'cheer'],[/월별|12개월/,'new-start']];
  function scene(title, id) { return sceneById[id] || (scenes.find(([re]) => re.test(title)) || [])[1] || 'explain'; }

  function buildFree(reading, person) {
    const r = reading || {}, p = person || {}, charm = r.charm || {}, balance = r.balance || {};
    const name = clean(p.name).trim() || '고객';
    const situation = clean(p.situation), situationLabel = situationKo[situation];
    const found = Array.isArray(charm.found) ? charm.found : [];
    const headline = tidy(charm.headline);
    const evidence = [];
    for (const f of found) {
      const t = tidy(f && f.title);
      if (t) evidence.push({ type: 'heading', text: t });
      evidence.push(...splitBlocks(f && f.core));
    }
    if (!evidence.length) evidence.push({ type: 'prose', text: '이번 무료 첫 장에서는 매력을 풀어 주는 별도의 표식이 나타나지 않았어요. 전체 풀이에서 더 자세히 살펴볼게요.' });
    const balanceBlocks = [];
    const bh = tidy(balance.headline);
    if (bh) balanceBlocks.push({ type: 'prose', text: bh });
    balanceBlocks.push(...splitBlocks(balance.lead));
    const chapters = [
      { id:'welcome', title:'연애의 첫 장', scene:'greeting', blocks:splitBlocks('안녕하세요, ' + name + '님.' + (situationLabel ? ' 지금 상황은 ' + situationLabel + '으로 알려 주셨어요.' : '')) },
      { id:'charm', title:headline || '나의 매력', scene:'explain', blocks:splitBlocks(charm.base && charm.base.text) },
      { id:'evidence', title:'매력의 근거', scene:'thinking', blocks:evidence },
      { id:'balance', title:'오행의 균형', scene:'explain', blocks:balanceBlocks },
      { id:'seasons', title:'계절의 흐름', scene:'meeting', blocks:splitBlocks(r.seasonLead) },
      { id:'whole-reading', title:'무료 요약과 전체 풀이', scene:'cheer', blocks:[] }
    ];
    return { kind:'free', title:name + '님의 연애 첫 장', lead:r.strongCount > 0 ? '앞으로 12개월 중 인연 신호가 강한 달이 ' + r.strongCount + '번 있어요.' : '앞으로 12개월의 인연 흐름을 살펴볼게요.', name:clean(p.name), situation, chapters, original:r, facts:{ pillars:Array.isArray(r.pillars) ? r.pillars : [], note:clean(r.note), balance, seasons:Array.isArray(r.seasons) ? r.seasons : [], seasonLead:clean(r.seasonLead), locked:Array.isArray(r.locked) ? r.locked : [] } };
  }

  const known = [
    ['top', /^(?:한 줄 답|인연 신호가 강한 세 달|가장 강한 세 달)(?:\s|$)/],
    ['attraction', /^(?:나에게 끌리는 사람|내가 끌리는 사람|서로 끌리는 사람)(?:\s|$)/],
    ['where', /^만남이 생기기 쉬운 자리(?:\s|$)/], ['pattern', /^(?:반복되기 쉬운 연애 패턴|연애 패턴)(?:\s|$)/],
    ['caution', /^조심할 인연의 신호(?:\s|$)/], ['action', /^(?:솔로인 지금 할 일|썸을 연애로 바꾸려면|지금 관계를 깊게 하려면|이별 뒤 지금 할 일)(?:\s|$)/],
    ['months', /^(?:월별 한 줄|앞으로 12개월)(?:\s|$)/]
  ];
  function norm(s) { return clean(s).replace(/\*\*/g, '').replace(/\s*[:：]\s*$/, '').replace(/\s+/g, ' ').trim(); }
  function buildPaid(report, options) {
    const original = clean(report), opts = options || {}, sections = []; let current = null; const preamble = [];
    for (const line of original.split(/\r?\n/)) {
      const h = /^\s*(#{1,6})\s*(.+?)\s*#*\s*$/.exec(line);
      if (h && h[1].length <= 3) { current = { title:norm(h[2]), level:h[1].length, lines:[] }; sections.push(current); }
      else if (current) { const sub = /^\s*#{4,6}\s*(.+?)\s*#*\s*$/.exec(line); current.lines.push(sub ? '**' + norm(sub[1]) + '**' : line); }
      else preamble.push(line);
    }
    const chapters = [], months = [], skipped = [];
    let title = opts.title || '연애 시기 리포트';
    // 첫 "한 줄 답"만 lead로 올린다. 같은 제목이 또 나오면 일반 장으로 남겨 글을 잃지 않는다.
    const answer = sections.find(s => /^한 줄 답/.test(s.title) && s.lines.join('').trim());
    const lead = answer ? answer.lines.map(tidy).join('\n').replace(/\n{3,}/g, '\n\n').trim() : '';
    const push = (id, t, text, action) => chapters.push({ id, title:t, scene:scene(t, id), blocks:splitBlocks(text, action) });
    if (!sections.length) push('legacy-body', '풀이', original.trim());
    else if (preamble.join('\n').trim()) push('legacy-preamble', '도입', preamble.join('\n').trim());
    sections.forEach((s, idx) => {
      if (s === answer) return;
      const text = s.lines.join('\n').trim();
      if (!text) {
        // 본문 없는 제목: 맨 앞 # 제목이면 리포트 제목으로 쓰고, 나머지는 빈 장을 만들지 않는다.
        if (idx === 0 && s.level === 1 && !opts.title) title = s.title; else skipped.push(s.title);
        return;
      }
      const match = known.find(([, re]) => re.test(s.title));
      const id = match ? match[0] : 'legacy-' + chapters.length;
      if (id === 'months') {
        const monthRe = /^\s*[-•*]\s*(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*[:：]\s*(.+?)\s*$/;
        for (const l of s.lines) { const m = monthRe.exec(l); if (m) months.push({ month:Number(m[2]), ...(m[1] ? { year:Number(m[1]) } : {}), text:tidy(m[3]) }); }
      }
      const prev = id === 'attraction' && chapters.find(c => c.id === 'attraction');
      if (prev) {
        prev.blocks.push({ type:'heading', text:s.title }, ...splitBlocks(text, false)); prev.labels.push(s.title); return;
      }
      push(id, s.title, text, id === 'action');
      if (id === 'attraction') { const c = chapters[chapters.length - 1]; c.blocks.unshift({ type:'heading', text:s.title }); c.labels = [s.title]; }
    });
    const seen = new Map(); for (const c of chapters) { const n = seen.get(c.id) || 0; seen.set(c.id, n + 1); if (n) c.id = c.id + '-' + (n + 1); }
    return { kind:'paid', title, lead, chapters, original, months, skipped };
  }
  return { buildFree, buildPaid, splitBlocks, sentences };
});
