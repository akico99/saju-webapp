'use strict';
/* 기준 사주 묶음 실행 — 프롬프트·생성기를 바꾼 뒤 실제 AI로 test/golden의 가상 인물 20명을 생성해 보고서를 만든다.
   보고서: 체크리스트(test/golden/checklist.json) 키워드 포함 여부, factCheck 오류·경고, 장별 근거 줄 누락, 분량·원가.
   실제 AI를 부르므로 자동 테스트에서는 실행하지 않는다(테스트는 scoreCase·renderReport만 가짜 결과로 부른다).

   사용: node scripts/golden-run.js [--only love-01,couple-02] [--product love|newyear|reunion|couple] [--concurrency 2] [--out 폴더]
   결과: output/golden/golden-<시각>.json, .md (기본) */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GOLDEN_DIR = path.join(ROOT, 'test', 'golden');

function loadGolden(dir = GOLDEN_DIR) {
  const cases = JSON.parse(fs.readFileSync(path.join(dir, 'cases.json'), 'utf8'));
  const checklist = JSON.parse(fs.readFileSync(path.join(dir, 'checklist.json'), 'utf8'));
  return { cases, checklist };
}

/** 장 key의 본문. 'months'는 월별 흐름, 빈 key는 전체 본문. */
function sectionText(reading, key) {
  const months = (reading.monthNotes || []).map((n) => (n.year ? n.year + '년 ' : '') + n.month + '월: ' + n.note).join('\n');
  if (!key) return (reading.sections || []).map((s) => s.title + '\n' + s.text).join('\n\n') + '\n\n' + months;
  if (key === 'months') return months;
  const s = (reading.sections || []).find((x) => x.key === key);
  return s ? s.text : null;
}

/** 생성 결과 하나를 체크리스트·자동 검사로 채점한다(AI 호출 없음). */
function scoreCase(reading, entry = {}) {
  const items = (entry.items || []).map((it) => {
    const keywords = (it.keywords || []).filter((k) => String(k).trim());
    const mustNot = (it.mustNot || []).filter((k) => String(k).trim());
    if (!keywords.length && !mustNot.length) return { section: it.section || '', expect: it.expect || '', status: 'blank' };
    const text = sectionText(reading, it.section);
    if (text == null) return { section: it.section, expect: it.expect || '', status: 'no-section' };
    const flat = text.replace(/\*\*/g, '');
    const found = keywords.filter((k) => flat.includes(k));
    const forbidden = mustNot.filter((k) => flat.includes(k));
    const status = forbidden.length ? 'forbidden' : (!keywords.length || found.length) ? 'pass' : 'miss';
    return { section: it.section || '', expect: it.expect || '', status, found, forbidden };
  });
  const keys = [...(reading.sections || []).map((s) => s.key), ...((reading.monthNotes || []).length ? ['months'] : [])];
  const evidence = reading.evidence || {};
  const checks = reading.checks || [];
  return {
    items,
    counts: ['pass', 'miss', 'forbidden', 'no-section', 'blank'].reduce((o, k) => ({ ...o, [k]: items.filter((i) => i.status === k).length }), {}),
    autoErrors: checks.filter((c) => c.level === 'error'),
    autoWarnings: checks.filter((c) => c.level !== 'error'),
    evidence: { total: keys.length, missing: keys.filter((k) => !evidence[k]) }
  };
}

function renderReport(results, meta = {}) {
  const lines = ['# 기준 사주 실행 보고서', '', '- 실행: ' + (meta.startedAt || '') + ' · 기준 시각 ' + (meta.now || ''), '- 사례 ' + results.length + '건', ''];
  lines.push('| 사례 | 상품 | 결과 | 분량 | 원가($) | 체크 통과/누락/금지/미작성 | 자동 오류 | 자동 경고 | 근거 없는 장 |');
  lines.push('|---|---|---|---:|---:|---|---:|---:|---|');
  for (const r of results) {
    if (r.error) { lines.push('| ' + r.id + ' | ' + r.product + ' | 실패: ' + r.error.replace(/\|/g, '/').slice(0, 80) + ' | | | | | | |'); continue; }
    const c = r.score.counts;
    lines.push('| ' + [r.id, r.product, '완료 ' + r.seconds + '초', r.chars, r.costUsd == null ? '' : r.costUsd.toFixed(3),
      c.pass + '/' + c.miss + '/' + c.forbidden + '/' + c.blank, r.score.autoErrors.length, r.score.autoWarnings.length,
      r.score.evidence.missing.join(', ') || '없음'].join(' | ') + ' |');
  }
  for (const r of results.filter((x) => !x.error)) {
    const bad = r.score.items.filter((i) => ['miss', 'forbidden', 'no-section'].includes(i.status));
    const checks = [...r.score.autoErrors, ...r.score.autoWarnings];
    if (!bad.length && !checks.length) continue;
    lines.push('', '## ' + r.id);
    for (const i of bad) lines.push('- 체크 ' + i.status + ' [' + (i.section || '전체') + '] ' + i.expect + (i.forbidden && i.forbidden.length ? ' — 금지어: ' + i.forbidden.join(', ') : ''));
    for (const c of checks) lines.push('- 자동 ' + (c.level === 'error' ? '오류' : '경고') + ' [' + c.section + '] ' + c.message + ' — ' + c.quote);
  }
  return lines.join('\n') + '\n';
}

/** 사례 하나를 실제 생성기로 만든다. generate를 주면 그 함수로 생성한다(테스트·드라이런). */
async function runCase(c, { now, generate } = {}) {
  const { computeSaju } = require('../src/engine');
  const i = c.input;
  const opts = generate ? { generate } : {};
  if (c.product === 'love') {
    const { generateLoveReading } = require('../src/llm/loveTimingReading');
    return generateLoveReading(computeSaju(i.birth), { name: i.name, gender: i.birth.gender }, i.situation, now, { ...opts, readingFocus: i.readingFocus });
  }
  if (c.product === 'newyear') {
    const { generateNewYearReading } = require('../src/llm/newYearReading');
    return generateNewYearReading(computeSaju(i.birth), { name: i.name, gender: i.birth.gender }, opts);
  }
  if (c.product === 'reunion') {
    const { generateReunionReading } = require('../src/llm/reunionReading');
    const people = { me: { name: i.me.name, gender: i.me.birth.gender }, them: { name: i.them.name, gender: i.them.birth.gender } };
    return generateReunionReading(computeSaju(i.me.birth), computeSaju(i.them.birth), people, i.story, now, opts);
  }
  if (c.product === 'couple') {
    const { generateCoupleReading } = require('../src/llm/coupleReading');
    return generateCoupleReading(computeSaju(i.a.birth), computeSaju(i.b.birth), { a: { name: i.a.name }, b: { name: i.b.name } }, i.relation, now, opts);
  }
  throw new Error('알 수 없는 상품: ' + c.product);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = /^--(only|product|concurrency|out)$/.exec(argv[i]);
    if (m) out[m[1]] = argv[++i];
  }
  return out;
}

async function main() {
  // 작업 트리(.worktrees/...)에는 .env가 없을 수 있다. 저장소 본체의 .env도 읽는다(이미 있는 값은 덮지 않는다).
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(ROOT, '.env') });
  dotenv.config({ path: path.join(ROOT, '..', '..', '.env') });
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY가 없어 실제 생성을 할 수 없습니다.');
  const args = parseArgs(process.argv.slice(2));
  const { cases, checklist } = loadGolden();
  const only = args.only ? new Set(args.only.split(',')) : null;
  const list = cases.cases.filter((c) => (!only || only.has(c.id)) && (!args.product || c.product === args.product));
  const now = new Date(cases.now);
  const { costUsd } = require('../src/llm/client');
  const startedAt = new Date().toISOString();
  const results = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const idx = next++;
      const c = list[idx];
      const t0 = Date.now();
      try {
        const reading = await runCase(c, { now });
        const chars = sectionText(reading, '').replace(/[*#\s]/g, '').length;
        // 가상 인물이라 본문까지 남긴다(검토·비교용). output/은 저장소에 올라가지 않는다.
        results[idx] = { id: c.id, product: c.product, seconds: Math.round((Date.now() - t0) / 1000), chars, costUsd: reading.usage ? costUsd(reading.usage) : null,
          score: scoreCase(reading, checklist.cases[c.id]), evidence: reading.evidence, checks: reading.checks,
          reading: { title: reading.title, sections: reading.sections, monthNotes: reading.monthNotes } };
      } catch (e) {
        results[idx] = { id: c.id, product: c.product, error: e.message };
      }
      const r = results[idx];
      console.log(r.error ? r.id + ' 실패: ' + r.error : r.id + ' 완료 ' + r.seconds + '초, 자동 오류 ' + r.score.autoErrors.length + ', 근거 없는 장 ' + r.score.evidence.missing.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, Number(args.concurrency) || 2)) }, worker));
  const outDir = args.out ? path.resolve(args.out) : path.join(ROOT, 'output', 'golden');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(outDir, 'golden-' + stamp + '.json'), JSON.stringify({ startedAt, now: cases.now, results }, null, 2));
  fs.writeFileSync(path.join(outDir, 'golden-' + stamp + '.md'), renderReport(results, { startedAt, now: cases.now }));
  console.log('보고서: ' + path.join(outDir, 'golden-' + stamp + '.md'));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });

module.exports = { loadGolden, scoreCase, renderReport, runCase, sectionText };

