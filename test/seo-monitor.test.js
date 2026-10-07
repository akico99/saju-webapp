'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { run } = require('../scripts/seoMonitor');

const urls = ['/good.html', '/noindex.html', '/broken.html', '/canonical.html', '/soft404.html'];
let injectProblems = false;
function html(pathname) {
  const noindex = injectProblems && pathname === '/noindex.html' ? '<meta name="robots" content="noindex,follow">' : '';
  const ld = injectProblems && pathname === '/broken.html' ? '{bad json' : '{"@context":"https://schema.org","@type":"WebPage"}';
  const canonical = injectProblems && pathname === '/canonical.html' ? '/wrong.html' : pathname;
  const body = pathname === '/soft404.html' ? 'Not found' : '사주 풀이 서비스 정보입니다. '.repeat(65);
  return `<!doctype html><html><head><title>정상 SEO 점검 페이지</title><meta name="description" content="${'설명'.repeat(40)}"><link rel="canonical" href="http://127.0.0.1:0${canonical}"><meta property="og:title" content="정상 제목"><meta property="og:description" content="설명"><meta property="og:image" content="/image.jpg"><script type="application/ld+json">${ld}</script>${noindex}</head><body><h1>SEO 점검</h1><p>${body}</p></body></html>`;
}

test('SEO monitor reports critical HTML failures from fetched HTML', async t => {
  let origin;
  const server = http.createServer((req, res) => {
    if (req.url === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(`<urlset>${urls.map(u => `<url><loc>${origin}${u}</loc><lastmod>2026-10-01</lastmod></url>`).join('')}</urlset>`); return;
    }
    if (req.url === '/robots.txt') { res.writeHead(200); res.end(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`); return; }
    if (req.url === '/llms.txt') { res.writeHead(200); res.end('Test information.'); return; }
    if (req.url === '/image.jpg') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end('image'); return; }
    if (req.url === '/__seo_check_404__' || req.url === '/new-year.html') { res.writeHead(404); res.end('missing'); return; }
    const pathname = new URL(req.url, origin).pathname;
    if (urls.includes(pathname)) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html(pathname).replaceAll('http://127.0.0.1:0', origin)); return; }
    res.writeHead(404); res.end('missing');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  origin = `http://127.0.0.1:${server.address().port}`;
  injectProblems = false;
  const healthy = await run({ baseUrl: origin, timeout: 2000 });
  assert.equal(healthy.summary.critical, 0);
  injectProblems = true;
  const report = await run({ baseUrl: origin, timeout: 2000 });
  assert.equal(report.summary.critical, 3);
  const problems = report.items.filter(x => x.severity === 'critical');
  assert.ok(problems.some(x => x.url.endsWith('/noindex.html') && x.check === 'noindex'));
  assert.ok(problems.some(x => x.url.endsWith('/broken.html') && x.check === 'JSON-LD 파싱'));
  assert.ok(problems.some(x => x.url.endsWith('/canonical.html') && x.check === 'canonical'));
  assert.equal(report.summary.urls, urls.length);
  assert.ok(report.items.some(x => x.url.endsWith('/soft404.html') && x.check === '본문 텍스트'));
  injectProblems = false;
});
