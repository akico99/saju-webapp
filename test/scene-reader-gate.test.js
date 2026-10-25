'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const PATHS = ['/reading-view.js', '/reading-view.css', '/reading-model-compat.js', '/reading-assets/reading/greeting.webp', '/READING-VIEW.JS', '/reading-view%2Ejs', '/reading%2Dview.css', '/reading-assets%2Freading/greeting.webp', '//reading-view.js', '/./reading-view.js', '/x/../reading-view.css', '/%2e/reading-model-compat.js', '//reading-assets/reading/greeting.webp', '/reading-assets/./reading/greeting.webp', '/reading-assets/reading/../reading/greeting.webp', '/compat.html', '/compat-app.js'];
const CHILD = "\nconst app = require('./src/server/app');\nconst http = require('http');\nconst server = app.listen(0, '127.0.0.1', async () => {\n  try {\n    const port = server.address().port;\n    const raw = (p) => new Promise((resolve) => {\n      const req = http.request({ host: '127.0.0.1', port, path: p, headers: { Connection: 'close' } }, (res) => { res.resume(); resolve(res.statusCode); });\n      req.on('error', () => resolve(-1)); req.end();\n    });\n    const paths = JSON.parse(process.env.GATE_PATHS);\n    const out = {};\n    for (const p of paths) out[p] = await raw(p);\n    const cfg = await new Promise((ok) => http.get({ host: '127.0.0.1', port, path: '/api/scene-reader', headers: { Connection: 'close' } }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => ok(JSON.parse(b))); }));\n    console.log(JSON.stringify({ out, cfg }));\n    server.closeAllConnections(); server.close(); setTimeout(() => process.exit(0), 100);\n  } catch (e) { console.error(e); process.exit(1); }\n});";

function probe(enabled) {
  return JSON.parse(execFileSync(process.execPath, ['-e', CHILD], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, SCENE_READER_ENABLED: enabled ? '1' : '', SAJU_DB_PATH: ':memory:', GATE_PATHS: JSON.stringify(PATHS) }
  }));
}
const off = probe(false);
const on = probe(true);

test('꺼진 장면형 읽기 화면은 스크립트·스타일·그림이 모두 404이고 우회 경로도 막힌다', () => {
  assert.equal(off.cfg.enabled, false);
  for (const [p, s] of Object.entries(off.out)) {
    if (p === '/compat.html' || p === '/compat-app.js') assert.equal(s, 200, p); else assert.equal(s, 404, '꺼짐: ' + p + ' → ' + s);
  }
});

test('켜면 읽기 화면 파일이 열린다', () => {
  assert.equal(on.cfg.enabled, true);
  for (const p of ['/reading-view.js', '/reading-view.css', '/reading-model-compat.js', '/reading-assets/reading/greeting.webp', '/./reading-view.js']) assert.equal(on.out[p], 200, p);
  assert.equal(on.out['/compat.html'], 200);
});
