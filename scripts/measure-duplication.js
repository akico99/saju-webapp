'use strict';
/* 챕터 간 중복도 측정 — 평생사주 100p 리포트의 병렬화 전후를 같은 잣대로 비교하기 위한 기준선 도구.

   왜 필요한가: 지금 중복 방지는 generateReport.js의 summarize()가 넘기는 '앞 챕터 첫 두 문장 120자'가
   전부다. 이걸 배분표 + 병렬 집필로 바꿀 때 중복이 늘었는지 줄었는지 말하려면 숫자가 먼저 있어야 한다.

   사용법:
     node scripts/measure-duplication.js                     output 폴더의 최신 chapters.json
     node scripts/measure-duplication.js <경로/chapters.json>
     node scripts/measure-duplication.js <경로/report.pdf>
     node scripts/measure-duplication.js <경로> --json       전후 비교 자동화용

   핵심 지표는 '중복 문자 비율'이다. 20자가 연속으로 일치하면 우연이 아니라고 보고, 그렇게 겹친
   구간이 전체 글자에서 차지하는 몫을 센다. */

const fs = require('fs');
const path = require('path');

const SHINGLE = 20;          // 우연의 일치로 보기 어려운 최소 길이
const MIN_SENTENCE = 15;     // 이보다 짧은 문장은 상투구라 비교에서 뺀다
const SIM_THRESHOLD = 0.6;   // 문장 유사도 기준
const TOP_N = 20;

function normalize(text) {
  return String(text || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*|__|\*|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------- 입력 ---------- */

/* PDF에는 본문이 아닌 붙박이 요소가 섞여 들어온다 — 페이지마다 찍히는 푸터(이름·페이지 번호),
   페이지 구분자, 챕터 오프너의 한자 번호. 이것들은 모든 챕터에 반복되므로 걷어내지 않으면
   중복률이 실제보다 크게 부풀려진다(샘플에서 상위 구간 다수가 푸터였다). */
function stripPdfFurniture(text) {
  return text
    .replace(/\S{1,20}\s*님의\s*[^0-9]{1,20}?\s*\d+\s*\/\s*\d+/g, ' ')
    .replace(/--\s*\d+\s*of\s*\d+\s*--/g, ' ')
    .replace(/第\s*[\d\s]{1,6}章/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function loadFromJson(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('chapters.json이 배열이 아닙니다: ' + file);
  return raw.filter(Boolean).map((c, i) => ({
    id: c.id != null ? c.id : i + 1,
    title: c.title || ('챕터 ' + (i + 1)),
    text: normalize(c.text)
  })).filter((c) => c.text.length > 0);
}

async function loadFromPdf(file) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: fs.readFileSync(file) });
  let full;
  try {
    full = (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
  const { CHAPTERS } = require('../src/llm/chapters');
  const flat = stripPdfFurniture(normalize(full));

  // 제목 위치로 잘라낸다. 까다로운 점이 둘 있다. 목차에 모든 제목이 앞쪽에 몰려 나오고,
  // 뒷 챕터가 앞 챕터 제목을 다시 언급하기도 한다(마무리 장이 건강운을 다시 거론하는 식).
  // 그래서 챕터 순서대로 훑으면서 '직전 챕터보다 뒤에 있고 충분히 떨어진' 첫 등장을 고른다.
  // 목차 항목들은 서로 바짝 붙어 있어 이 간격 조건에서 자연히 걸러진다.
  const MIN_GAP = 800;
  const marks = [];
  let cursor = -1;
  for (const ch of CHAPTERS) {
    const title = normalize(ch.title);
    if (!title) continue;
    const spots = [];
    for (let at = flat.indexOf(title); at >= 0; at = flat.indexOf(title, at + 1)) spots.push(at);
    const pick = spots.find((at) => at > cursor + MIN_GAP);
    if (pick == null) continue;
    cursor = pick;
    marks.push({ id: ch.id, title: ch.title, at: pick, titleLen: title.length });
  }
  if (!marks.length) throw new Error('PDF에서 챕터 제목을 하나도 찾지 못했습니다. chapters.json을 대신 넘겨보세요.');
  const missing = CHAPTERS.length - marks.length;
  if (missing > 0) console.warn('경고: 제목을 못 찾은 챕터 ' + missing + '개는 제외하고 잽니다.');

  return marks.map((m, i) => ({
    id: m.id,
    title: m.title,
    text: flat.slice(m.at + m.titleLen, i + 1 < marks.length ? marks[i + 1].at : flat.length).trim()
  })).filter((c) => c.text.length > SHINGLE);
}

function findLatestChaptersJson() {
  const root = path.join(__dirname, '..', 'output');
  if (!fs.existsSync(root)) return null;
  const found = [];
  for (const dir of fs.readdirSync(root)) {
    const p = path.join(root, dir, 'chapters.json');
    if (fs.existsSync(p)) found.push({ p, mtime: fs.statSync(p).mtimeMs });
  }
  if (!found.length) return null;
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0].p;
}

/* ---------- 지표 ---------- */

/** 20자 윈도를 챕터별로 모아, 두 개 이상의 챕터에 걸친 윈도를 찾는다. */
function buildSharedIndex(chapters) {
  const owners = new Map(); // 윈도 문자열 -> 그 윈도를 가진 챕터 인덱스 집합
  chapters.forEach((ch, ci) => {
    const seen = new Set();
    for (let i = 0; i + SHINGLE <= ch.text.length; i++) {
      const w = ch.text.slice(i, i + SHINGLE);
      if (seen.has(w)) continue;
      seen.add(w);
      let set = owners.get(w);
      if (!set) owners.set(w, (set = new Set()));
      set.add(ci);
    }
  });
  for (const [w, set] of owners) if (set.size < 2) owners.delete(w);
  return owners;
}

/** 챕터마다 '다른 챕터와 겹치는 윈도'가 덮는 글자 수를 센다. */
function measureCoverage(chapters, shared) {
  return chapters.map((ch, ci) => {
    const covered = new Uint8Array(ch.text.length);
    const runs = [];
    let run = null;
    for (let i = 0; i + SHINGLE <= ch.text.length; i++) {
      const partners = shared.get(ch.text.slice(i, i + SHINGLE));
      const isShared = partners && (partners.size > 1 || !partners.has(ci)) && [...partners].some((x) => x !== ci);
      if (isShared) {
        covered.fill(1, i, i + SHINGLE);
        if (run && run.end + 1 === i) { run.end = i; for (const p of partners) if (p !== ci) run.partners.add(p); }
        else { if (run) runs.push(run); run = { start: i, end: i, partners: new Set([...partners].filter((x) => x !== ci)) }; }
      }
    }
    if (run) runs.push(run);
    let dup = 0;
    for (let i = 0; i < covered.length; i++) if (covered[i]) dup++;
    return {
      chapterIndex: ci,
      chars: ch.text.length,
      duplicatedChars: dup,
      runs: runs.map((r) => ({
        text: ch.text.slice(r.start, r.end + SHINGLE),
        length: r.end + SHINGLE - r.start,
        partners: [...r.partners]
      }))
    };
  });
}

function topRuns(chapters, coverage) {
  const best = new Map(); // 같은 문구가 양쪽 챕터에서 두 번 잡히므로 텍스트로 합친다
  coverage.forEach((cov) => {
    cov.runs.forEach((r) => {
      const prev = best.get(r.text);
      const entry = prev || { text: r.text, length: r.length, chapters: new Set() };
      entry.chapters.add(cov.chapterIndex);
      r.partners.forEach((p) => entry.chapters.add(p));
      best.set(r.text, entry);
    });
  });
  return [...best.values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, TOP_N)
    .map((e) => ({
      length: e.length,
      text: e.text.slice(0, 120),
      chapters: [...e.chapters].sort((a, b) => a - b).map((i) => chapters[i].id + '장 ' + chapters[i].title)
    }));
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length >= MIN_SENTENCE);
}

function bigrams(s) {
  const set = new Set();
  for (let i = 0; i + 2 <= s.length; i++) set.add(s.slice(i, i + 2));
  return set;
}

function jaccard(a, b) {
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) inter++;
  return inter / (a.size + b.size - inter);
}

function similarSentences(chapters) {
  const items = [];
  chapters.forEach((ch, ci) => {
    splitSentences(ch.text).forEach((s) => items.push({ ci, s, g: bigrams(s) }));
  });
  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].ci === items[j].ci) continue;
      const la = items[i].s.length, lb = items[j].s.length;
      if (Math.min(la, lb) / Math.max(la, lb) < 0.5) continue; // 길이가 너무 다르면 볼 필요 없다
      const sim = jaccard(items[i].g, items[j].g);
      if (sim >= SIM_THRESHOLD) pairs.push({ sim, a: items[i], b: items[j] });
    }
  }
  return pairs.sort((x, y) => y.sim - x.sim).slice(0, TOP_N).map((p) => ({
    similarity: Number(p.sim.toFixed(3)),
    from: chapters[p.a.ci].id + '장 ' + chapters[p.a.ci].title,
    to: chapters[p.b.ci].id + '장 ' + chapters[p.b.ci].title,
    textA: p.a.s.slice(0, 120),
    textB: p.b.s.slice(0, 120)
  }));
}

function analyze(chapters) {
  const shared = buildSharedIndex(chapters);
  const coverage = measureCoverage(chapters, shared);
  const totalChars = coverage.reduce((n, c) => n + c.chars, 0);
  const dupChars = coverage.reduce((n, c) => n + c.duplicatedChars, 0);
  return {
    shingleSize: SHINGLE,
    chapterCount: chapters.length,
    totalChars,
    duplicatedChars: dupChars,
    duplicationRatio: totalChars ? dupChars / totalChars : 0,
    perChapter: coverage.map((c) => ({
      chapter: chapters[c.chapterIndex].id + '장 ' + chapters[c.chapterIndex].title,
      chars: c.chars,
      duplicatedChars: c.duplicatedChars,
      ratio: c.chars ? c.duplicatedChars / c.chars : 0
    })),
    topRuns: topRuns(chapters, coverage),
    similarSentences: similarSentences(chapters)
  };
}

/* ---------- 출력 ---------- */

const pct = (x) => (x * 100).toFixed(2) + '%';

function printReport(r, source) {
  console.log('챕터 간 중복도 측정');
  console.log('대상: ' + source);
  console.log('기준: ' + r.shingleSize + '자 연속 일치');
  console.log('');
  console.log('챕터 ' + r.chapterCount + '개, 총 ' + r.totalChars.toLocaleString('ko-KR') + '자');
  console.log('중복 문자 ' + r.duplicatedChars.toLocaleString('ko-KR') + '자 — 중복 비율 ' + pct(r.duplicationRatio));
  console.log('');
  console.log('[챕터별]');
  r.perChapter
    .slice()
    .sort((a, b) => b.ratio - a.ratio)
    .forEach((c) => console.log('  ' + pct(c.ratio).padStart(7) + '  ' + String(c.chars).padStart(6) + '자  ' + c.chapter));
  console.log('');
  console.log('[가장 긴 공통 구간]');
  if (!r.topRuns.length) console.log('  없음');
  r.topRuns.forEach((x, i) => {
    console.log('  ' + (i + 1) + '. ' + x.length + '자 · ' + x.chapters.join(' / '));
    console.log('     ' + x.text);
  });
  console.log('');
  console.log('[유사 문장 쌍]');
  if (!r.similarSentences.length) console.log('  없음');
  r.similarSentences.forEach((x, i) => {
    console.log('  ' + (i + 1) + '. 유사도 ' + x.similarity + ' · ' + x.from + ' ↔ ' + x.to);
    console.log('     A: ' + x.textA);
     console.log('     B: ' + x.textB);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  let target = args.find((a) => !a.startsWith('--')) || findLatestChaptersJson();

  if (!target) {
    console.error('측정할 대상을 찾지 못했습니다.');
    console.error('');
    console.error('다음 중 하나를 넘겨주세요.');
    console.error('  node scripts/measure-duplication.js <경로>/chapters.json');
    console.error('  node scripts/measure-duplication.js <경로>/report.pdf');
    console.error('');
    console.error('완성된 리포트 PDF로도 잴 수 있으니, 이미 만들어진 주문의 PDF를 내려받아 넘기면 됩니다.');
    process.exit(1);
  }
  if (!fs.existsSync(target)) {
    console.error('파일이 없습니다: ' + target);
    process.exit(1);
  }

  const chapters = target.toLowerCase().endsWith('.pdf') ? await loadFromPdf(target) : loadFromJson(target);
  if (chapters.length < 2) {
    console.error('비교할 챕터가 2개 미만입니다.');
    process.exit(1);
  }

  const result = analyze(chapters);
  if (asJson) console.log(JSON.stringify({ source: target, ...result }, null, 2));
  else printReport(result, target);
}

main().catch((e) => { console.error('측정 실패: ' + e.message); process.exit(1); });
