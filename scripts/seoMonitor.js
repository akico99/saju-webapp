'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PAGES } = require('./buildSeo');

const DEFAULT_OUT = path.join(__dirname, '..', 'docs', 'seo-reports');
const TEXT_MIN = 800;
const MANUAL = [
  '- [ ] Google Search Console: 사이트맵 처리, 핵심 URL 색인 여부·마지막 수집일·선택 canonical·실패 사유 확인',
  '- [ ] 네이버 서치어드바이저: 사이트맵 처리, 핵심 URL 수집·색인 상태와 사유 확인',
  '- [ ] Bing Webmaster Tools: 사이트맵 처리와 핵심 URL 검사 확인',
  '- [ ] 세 검색 도구: 완료된 최근 28일 노출·클릭·CTR, 검색어·페이지, 색인 수·오류 사유 확인 (데이터 없음은 0건과 구분)'
];

function parseArgs(argv) {
  const opts = { baseUrl: 'https://sajuotter.com', out: DEFAULT_OUT, json: false, write: true, timeout: 15000 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--no-write') opts.write = false;
    else if (['--base-url', '--out', '--timeout'].includes(arg)) {
      if (!argv[i + 1]) throw new Error(`${arg} 값이 필요합니다`);
      const val = argv[++i];
      if (arg === '--base-url') opts.baseUrl = val.replace(/\/$/, '');
      if (arg === '--out') opts.out = path.resolve(val);
      if (arg === '--timeout') opts.timeout = Math.max(1, Number(val) || 15000);
    } else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  return opts;
}

function decode(s) { return s.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>'); }
function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re); return m ? decode(m[1] || m[2] || m[3] || '') : '';
}
function metas(html, key, value) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].filter(([tag]) => attr(tag, key).toLowerCase() === value.toLowerCase()).map(([tag]) => attr(tag, 'content'));
}
function entities(html) { return decode(html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')).replace(/\s+/g, ' ').trim(); }
function add(items, severity, url, check, detail) { items.push({ severity, url, check, detail }); }

function createRequester(timeout) {
  let active = 0; const waiters = [];
  return async (url, method = 'GET', follow = 'manual') => {
    if (active >= 4) await new Promise(resolve => waiters.push(resolve));
    active++;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { method, redirect: follow, signal: controller.signal, headers: { 'user-agent': 'SajuOtterSeoMonitor/1.0' } });
      const body = method === 'HEAD' ? '' : await res.text();
      return { status: res.status, headers: res.headers, body, url: res.url, redirected: res.redirected, location: res.headers.get('location') };
    } finally { clearTimeout(timer); active--; const next = waiters.shift(); if (next) next(); }
  };
}

async function pool(values, limit, fn) {
  const out = new Array(values.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) { const i = next++; if (i >= values.length) return; out[i] = await fn(values[i], i); }
  }));
  return out;
}

function extractUrls(xml) { return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(m => decode(m[1].trim())); }
function extractLastmods(xml) { return [...xml.matchAll(/<lastmod>([\s\S]*?)<\/lastmod>/gi)].map(m => m[1].trim()); }
function todayKst() { return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); }
function inDisallow(url, robots) {
  const pathname = new URL(url).pathname;
  return [...robots.matchAll(/^\s*Disallow:\s*(\S+)/gim)].some(m => m[1] !== '/' && pathname.startsWith(m[1]));
}

async function run(options = {}) {
  const opts = { baseUrl: 'https://sajuotter.com', timeout: 15000, ...options };
  const request = createRequester(opts.timeout);
  const items = [];
  let sitemapUrls = [];
  const root = opts.baseUrl;
  let sitemap;
  try { sitemap = await request(root + '/sitemap.xml'); }
  catch (e) { add(items, 'critical', root + '/sitemap.xml', '사이트맵 요청', `네트워크 실패: ${e.message}`); return result(items, 0, true); }
  if (sitemap.status !== 200) { add(items, 'critical', root + '/sitemap.xml', '사이트맵 상태', `HTTP ${sitemap.status}`); return result(items, 0, true); }
  sitemapUrls = extractUrls(sitemap.body);
  const counts = new Map(); for (const u of sitemapUrls) counts.set(u, (counts.get(u) || 0) + 1);
  for (const [url, n] of counts) if (n > 1) add(items, 'critical', url, '사이트맵 중복', `${n}회 등록`);
  for (const lm of extractLastmods(sitemap.body)) {
    const parsed = Date.parse(lm);
    if (!Number.isFinite(parsed) || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(lm)) add(items, 'critical', root + '/sitemap.xml', 'lastmod 날짜', `유효하지 않음: ${lm}`);
    else if (lm.slice(0, 10) > todayKst()) add(items, 'critical', root + '/sitemap.xml', 'lastmod 미래 날짜', lm);
  }

  let robots = '';
  try {
    const r = await request(root + '/robots.txt'); robots = r.body;
    if (r.status !== 200) add(items, 'critical', root + '/robots.txt', 'robots.txt 상태', `HTTP ${r.status}`);
    const sitemapLine = (robots.match(/^\s*Sitemap:\s*(\S+)/im) || [])[1];
    if (!sitemapLine) add(items, 'critical', root + '/robots.txt', '사이트맵 선언', 'Sitemap 줄이 없습니다');
    else if (inDisallow(sitemapLine, robots)) add(items, 'critical', sitemapLine, 'robots 차단', '사이트맵 URL이 Disallow 규칙에 걸립니다');
  } catch (e) { add(items, 'critical', root + '/robots.txt', 'robots.txt 요청', e.message); }

  let llms = '';
  try {
    const r = await request(root + '/llms.txt'); llms = r.body;
    if (r.status !== 200) add(items, 'critical', root + '/llms.txt', 'llms.txt 상태', `HTTP ${r.status}`);
    const links = [...llms.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(m => m[1]);
    const checks = await pool(links, 4, async url => { try { return { url, res: await request(url, 'GET') }; } catch (e) { return { url, error: e.message }; } });
    for (const c of checks) if (c.error || c.res.status !== 200) add(items, 'warn', c.url, 'llms 링크', c.error || `HTTP ${c.res.status}`);
  } catch (e) { add(items, 'critical', root + '/llms.txt', 'llms.txt 요청', e.message); }

  const expected = PAGES.filter(p => p.sitemap).map(p => new URL(p.file === 'index.html' ? '/' : '/' + p.file, root).href);
  const actualSet = new Set(sitemapUrls);
  const expectedSet = new Set(expected);
  for (const u of expectedSet) if (!actualSet.has(u)) add(items, 'warn', u, '사이트맵과 빌드 목록', 'buildSeo.js의 sitemap:true 항목이 사이트맵에 없습니다');
  for (const u of actualSet) if (!expectedSet.has(u)) add(items, 'warn', u, '사이트맵과 빌드 목록', 'buildSeo.js 목록에 없는 URL입니다');

  const pageResults = await pool(sitemapUrls, 4, async url => {
    try { return { url, res: await request(url) }; }
    catch (e) { add(items, 'critical', url, '페이지 요청', `네트워크 실패: ${e.message}`); return { url, error: e.message }; }
  });
  for (const { url, res } of pageResults) {
    if (!res) continue;
    if (res.status !== 200 || res.redirected || res.url !== url) add(items, 'critical', url, '페이지 상태·리다이렉트', `HTTP ${res.status}${res.redirected ? ` → ${res.url}` : ''}`);
    const html = res.body;
    const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const titleText = title ? entities(title) : '';
    if (!titleText) add(items, 'warn', url, 'title', 'title이 없습니다');
    else if (titleText.length < 10 || titleText.length > 65) add(items, 'warn', url, 'title 길이', `${titleText.length}자 (권장 10~65자)`);
    const desc = metas(html, 'name', 'description')[0] || '';
    if (!desc) add(items, 'warn', url, 'meta description', 'description이 없습니다');
    else if (desc.length < 70 || desc.length > 165) add(items, 'warn', url, 'description 길이', `${desc.length}자 (권장 70~165자)`);
    const canonicalTag = (html.match(/<link\b[^>]*\brel\s*=\s*(?:"canonical"|'canonical'|canonical)[^>]*>/i) || [])[0];
    const canonical = canonicalTag && attr(canonicalTag, 'href');
    if (!canonical || canonical !== url) add(items, 'critical', url, 'canonical', `기대 ${url}, 실제 ${canonical || '없음'}`);
    const robotsMeta = metas(html, 'name', 'robots').join(' ');
    const xrobots = res.headers.get('x-robots-tag') || '';
    if (/noindex/i.test(robotsMeta + ' ' + xrobots)) add(items, 'critical', url, 'noindex', `meta=${robotsMeta || '-'}, X-Robots-Tag=${xrobots || '-'}`);
    const h1s = [...html.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)];
    if (!h1s.length) add(items, 'warn', url, 'H1', 'H1이 없습니다');
    else if (h1s.some(m => /(?:sr-only|visually-hidden)/i.test(m[1]))) add(items, 'warn', url, 'H1 가시성', 'sr-only 또는 숨김 클래스 H1이 있습니다');
    const body = (html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || [])[1] || html;
    const visibleText = entities(body.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ''));
    if (visibleText.length < TEXT_MIN) add(items, 'warn', url, '본문 텍스트', `${visibleText.length}자 (최소 권장 ${TEXT_MIN}자)`);
    const jsonBlocks = [...html.matchAll(/<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)];
    if (!jsonBlocks.length) add(items, 'warn', url, 'JSON-LD', '구조화 데이터 블록이 없습니다');
    for (const [i, m] of jsonBlocks.entries()) {
      try { const data = JSON.parse(m[1]); if (!data['@context']) add(items, 'critical', url, 'JSON-LD @context', `블록 ${i + 1}에 @context가 없습니다`); }
      catch (e) { add(items, 'critical', url, 'JSON-LD 파싱', `블록 ${i + 1}: ${e.message}`); }
    }
    const ogTitle = metas(html, 'property', 'og:title')[0]; const ogDesc = metas(html, 'property', 'og:description')[0]; const ogImage = metas(html, 'property', 'og:image')[0];
    if (!ogTitle) add(items, 'warn', url, 'OG title', 'og:title이 없습니다');
    if (!ogDesc) add(items, 'warn', url, 'OG description', 'og:description이 없습니다');
    if (!ogImage) add(items, 'warn', url, 'OG image', 'og:image가 없습니다');
    else {
      try { const imageUrl = new URL(ogImage, url).href; const imageRes = await request(imageUrl, 'GET');
        if (imageRes.status !== 200 || !String(imageRes.headers.get('content-type') || '').toLowerCase().startsWith('image/')) add(items, 'warn', url, 'OG image 응답', `${imageUrl}: HTTP ${imageRes.status}, ${imageRes.headers.get('content-type') || 'content-type 없음'}`);
      } catch (e) { add(items, 'warn', url, 'OG image 요청', e.message); }
    }
    const years = [...titleText.matchAll(/20\d{2}/g)].map(m => m[0]);
    if (years.length) add(items, 'info', url, 'title 연도', [...new Set(years)].join(', '));
  }

  try { const missing = await request(root + '/__seo_check_404__'); if (missing.status !== 404) add(items, 'critical', root + '/__seo_check_404__', '없는 주소 응답', `HTTP ${missing.status} (404 기대)`); }
  catch (e) { add(items, 'critical', root + '/__seo_check_404__', '없는 주소 점검', e.message); }
  try { const gated = await request(root + '/new-year.html'); if (gated.status === 200) add(items, 'info', root + '/new-year.html', '신년운세 판매 게이트', '공개 상태, sitemap·noindex와 일치하는지 확인'); else if (gated.status !== 404) add(items, 'warn', root + '/new-year.html', '신년운세 판매 게이트', `HTTP ${gated.status} (현재 404 정상)`); }
  catch (e) { add(items, 'warn', root + '/new-year.html', '신년운세 판매 게이트', e.message); }

  if (/^https:\/\//i.test(root)) {
    for (const [label, from] of [['http→https', root.replace(/^https:/, 'http:')], ['www→apex', root.replace('://', '://www.')]]) {
      try {
        const r = await request(from, 'GET');
        let targetOk = false;
        try {
          const target = new URL(r.location || '', from);
          targetOk = label === 'http→https' ? target.protocol === 'https:' : target.host.toLowerCase() === new URL(root).host.toLowerCase();
        } catch (_) {}
        if (r.status !== 301 || !targetOk) add(items, 'warn', from, `${label} 리다이렉트`, `HTTP ${r.status}${r.location ? ` → ${r.location}` : ''} (요구: 301 및 목적지 확인)`);
      }
      catch (e) { add(items, 'warn', from, `${label} 리다이렉트`, e.message); }
    }
  }
  const indexnowFiles = fs.existsSync(path.join(__dirname, '..', 'public')) ? fs.readdirSync(path.join(__dirname, '..', 'public')).filter(f => /^[a-f0-9]+\.txt$/i.test(f) && f !== 'llms.txt' && f !== 'robots.txt') : [];
  for (const file of indexnowFiles) {
    const key = path.basename(file, '.txt');
    try { const r = await request(root + '/' + file); add(items, r.status === 200 && r.body.trim() === key ? 'info' : 'warn', root + '/' + file, 'IndexNow 키', `HTTP ${r.status}, 본문 ${r.body.trim() === key ? '일치' : '불일치'}`); }
    catch (e) { add(items, 'warn', root + '/' + file, 'IndexNow 키', e.message); }
  }
  const nextYear = Number(todayKst().slice(0, 4)) + 1;
  if (Number(todayKst().slice(5, 7)) >= 11) {
    const titles = pageResults.filter(x => x.res && (new URL(x.url).pathname === '/' || /\.html$/.test(new URL(x.url).pathname))).map(x => (x.res.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').join(' ');
    if (!titles.includes(String(nextYear))) add(items, 'warn', root, '신년운세 연도 문구', '신년운세 연도 문구 낡음 가능성');
  }
  return result(items, sitemapUrls.length, false);
}

function result(items, urls, networkFailed) {
  return { summary: { urls, critical: items.filter(x => x.severity === 'critical').length, warn: items.filter(x => x.severity === 'warn').length, info: items.filter(x => x.severity === 'info').length }, items, networkFailed };
}
function problemKey(item) { return `${item.severity}|${item.url}|${item.check}|${item.detail}`; }
function changes(previous, current) {
  const old = new Set((previous && previous.items || []).map(problemKey)); const now = new Set(current.items.map(problemKey));
  return { 새로_생김: [...now].filter(x => !old.has(x)), 사라짐: [...old].filter(x => !now.has(x)) };
}
function markdown(report, delta, date) {
  const rows = report.items.map(i => `| ${i.severity} | ${i.url} | ${i.check} | ${i.detail.replace(/\|/g, '\\|')} |`).join('\n');
  return `# SEO 자동 점검 (${date})\n\n- URL 수: ${report.summary.urls}\n- 치명: ${report.summary.critical}\n- 경고: ${report.summary.warn}\n- 정보: ${report.summary.info}\n\n## 점검 결과\n\n| 심각도 | URL | 항목 | 내용 |\n|---|---|---|---|\n${rows || '| - | - | 문제 없음 | - |'}\n\n## 변화\n\n### 새로 생김\n\n${delta.새로_생김.map(x => `- ${x}`).join('\n') || '- 없음'}\n\n### 사라짐\n\n${delta.사라짐.map(x => `- ${x}`).join('\n') || '- 없음'}\n\n## 수동 확인 항목\n\n${MANUAL.join('\n')}\n`;
}

async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { process.stderr.write(`옵션 오류: ${e.message}\n`); return 2; }
  const report = await run(opts);
  let previous = null; const latestPath = path.join(opts.out, 'latest.json');
  if (opts.write) { try { previous = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch (_) {} }
  const delta = changes(previous, report); const date = todayKst();
  const output = { ...report, changes: delta, manualChecks: MANUAL };
  if (opts.write) {
    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, `${date}.md`), markdown(report, delta, date), 'utf8');
    fs.writeFileSync(latestPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
  }
  if (opts.json) process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  else process.stdout.write(markdown(report, delta, date));
  return report.networkFailed ? 2 : report.summary.critical ? 1 : 0;
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(err => { process.stderr.write(`점검 실패: ${err.stack || err.message}\n`); process.exitCode = 2; });
module.exports = { run, main, parseArgs, extractUrls, TEXT_MIN };
