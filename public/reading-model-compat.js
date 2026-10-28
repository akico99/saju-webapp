(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ReadingModelCompat = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  /* 궁합 리포트 본문 → 읽기 화면 모델. 서버가 쓰는 소제목("### …")을 장으로 나누고, 장마다 고정 장면 그림을 붙인다.
     글은 한 글자도 만들지 않는다(문장을 1~3개씩 묶어 문단으로 나눌 뿐). 원문 전체는 model.original에 그대로 둔다.
     "### 지금 할 것 / 피할 것"은 화면의 카드가 따로 그리므로 장에서 뺀다(compatOutlines.splitCompatText와 같은 규칙). */
  const clean = (v) => (v == null ? '' : String(v));
  const GROUP_MAX = 260, GROUP_GOAL = 190, GROUP_SENTENCES = 3;
  const LEAD_GOAL = 90;
  const TERMS = '.!?。！？…', CLOSERS = '"\'”’)]」』）*';

  function splitReport(text) {
    const prose = [], dos = [], donts = [];
    let mode = 'prose';
    clean(text).split(/\r?\n/).forEach((line) => {
      const h = line.match(/^\s*#{2,4}\s*(.+?)\s*$/);
      if (h) {
        const title = h[1].replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
        if (title === '피할 것') { mode = 'donts'; return; }
        if (title === '할 것' || title === '지금 할 것') { mode = 'dos'; return; }
        mode = 'prose';
      }
      if (mode === 'prose') { prose.push(line); return; }
      const target = mode === 'dos' ? dos : donts;
      const b = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*\S)\s*$/);
      if (b) target.push(b[1].trim());
      else if (line.trim() && target.length) target[target.length - 1] += ' ' + line.trim();
    });
    return { prose: prose.join('\n').trim(), dos, donts };
  }

  // 마침표 뒤 공백에서 문장을 나눈다. 소수점·날짜·번호는 자르지 않는다.
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
  function group(list) {
    const out = []; let cur = '', count = 0;
    for (const t of list) {
      if (cur && (count >= GROUP_SENTENCES || cur.length >= GROUP_GOAL || cur.length + 1 + t.length > GROUP_MAX)) { out.push(cur); cur = ''; count = 0; }
      cur = cur ? cur + ' ' + t : t; count++;
    }
    if (cur) out.push(cur);
    return out;
  }
  // 묶음 경계에서 **강조**가 끊기면 앞 묶음 끝을 닫고 다음 묶음 앞에서 다시 연다.
  function balance(groups) {
    let open = false;
    return groups.map((g) => {
      let t = open ? '**' + g : g;
      const odd = (t.match(/\*\*/g) || []).length % 2 === 1;
      if (odd) t += '**';
      open = odd;
      return t;
    });
  }

  function blocksOf(lines) {
    const out = [];
    clean(lines).split(/\r?\n\s*\r?\n/).forEach((para) => {
      const rows = para.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      let run = [];
      const flush = () => { if (run.length) { balance(group(run)).forEach((g) => out.push({ type: 'prose', text: g })); run = []; } };
      rows.forEach((row) => {
        const sub = /^#{4,6}\s*(.+?)\s*#*$/.exec(row);
        if (sub) { flush(); out.push({ type: 'heading', text: sub[1].replace(/\*+/g, '').trim() }); return; }
        const b = /^([-•*]|\d{1,2}[.)])\s+(.+)$/.exec(row);
        if (b) { flush(); out.push({ type: 'prose', text: /^\d/.test(b[1]) ? row : '• ' + b[2] }); return; }
        run.push(...sentences(row));
      });
      flush();
    });
    return out.filter((b) => b.text);
  }

  // 소제목 → [장면, 이동 단추에 쓸 짧은 이름]. 장면은 공유 그림 10종 중 하나다.
  const RULES = [
    [/서로에게 어떤 존재/, 'meeting', '서로의 존재'],
    [/배우자궁/, 'empathy', '배우자궁'],
    [/끌리는 지점/, 'conversation', '끌림과 부딪힘'],
    [/다툼/, 'distance', '다툼과 푸는 법'],
    [/살림/, 'conversation', '함께 꾸리는 살림'],
    [/오래 가는 힘/, 'thinking', '오래 가는 힘'],
    [/먼저 다가가도/, 'greeting', '먼저 다가가기'],
    [/가까워질수록/, 'caution', '가까워질수록'],
    [/그때 왜 어긋/, 'distance', '어긋난 이유'],
    [/다시 만난다면/, 'cheer', '달라질 지점'],
    [/앞으로 (?:3년|6개월)/, 'new-start', '앞으로의 흐름'],
    [/함께 올라가는|큰 결정|다가가기 좋은 때|연락을 한다면/, 'explain', '시기를 쓰는 법'],
    [/점수가 말하는/, 'thinking', '점수의 뜻'],
    [/핵심 요약/, 'greeting', '핵심 요약']
  ];
  const SPARE = ['explain', 'thinking', 'empathy', 'cheer', 'greeting', 'caution', 'meeting', 'distance', 'conversation', 'new-start'];
  function sceneFor(title, used) {
    const hit = RULES.find((r) => r[0].test(title));
    let scene = hit ? hit[1] : '';
    if (!scene || used.has(scene)) scene = SPARE.find((s) => !used.has(s)) || scene || 'explain';
    used.add(scene);
    return { scene, short: hit ? hit[2] : '' };
  }

  function build(report) {
    const original = clean(report);
    const prose = splitReport(original).prose;
    if (!prose.trim()) return null;
    const sections = []; let cur = null;
    const pre = [];
    prose.split(/\r?\n/).forEach((line) => {
      const h = /^\s*#{1,3}\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) { cur = { title: h[1].replace(/\*+/g, '').replace(/\s+/g, ' ').trim(), lines: [] }; sections.push(cur); }
      else if (cur) cur.lines.push(line);
      else pre.push(line);
    });
    const used = new Set(), chapters = [];
    const add = (id, title, body) => {
      const blocks = blocksOf(body);
      // 말풍선에는 첫 1~2문장(합쳐서 약 90자 이내)만 넣고, 나머지는 같은 문단의 본문으로 이어 붙인다.
      if (blocks.length && blocks[0].type === 'prose' && !blocks[0].text.startsWith('• ')) {
        const ss = sentences(blocks[0].text);
        let take = 1;
        if (ss.length > 1 && ss[0].length + 1 + ss[1].length <= LEAD_GOAL) take = 2;
        if (ss.length > take) {
          const parts = balance([ss.slice(0, take).join(' '), ss.slice(take).join(' ')]);
          blocks.splice(0, 1, { type: 'prose', text: parts[0] }, { type: 'prose', text: parts[1] });
        }
      }
      if (!blocks.length) return;
      const s = sceneFor(title, used);
      chapters.push({ id, title, short: s.short || title, scene: s.scene, blocks });
    };
    if (pre.join('').trim()) add('intro', sections.length ? '들어가며' : '궁합 풀이', pre.join('\n'));
    sections.forEach((s, i) => add('c' + (i + 1), s.title, s.lines.join('\n')));
    if (!chapters.length) return null;
    // 글이 하나도 빠지지 않았는지 확인한다. 어긋나면 null을 돌려 기존 화면으로 되돌린다.
    const strip = (t) => clean(t).replace(/[\s*#•\-]/g, '');
    const expected = strip(pre.join('') + sections.map((x) => x.lines.join('')).join(''));
    const actual = strip(chapters.map((c) => c.blocks.map((b) => b.text).join('')).join(''));
    if (expected !== actual) return null;
    return { kind: 'paid', title: '', lead: '', chapters, original, months: [] };
  }

  return { build, splitReport, sentences, blocksOf };
});
