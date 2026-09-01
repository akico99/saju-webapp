#!/usr/bin/env node
'use strict';
/* 디버깅/회귀검증용 CLI — engine/index.js의 computeSaju()를 그대로 호출.
   사용법: node src/cli/manse.cjs "2008-03-15 06:30 남" [--json] */

const { CITY_LON } = require('../engine/longitude');
const { computeSaju } = require('../engine/index');

function parse(argv) {
  const a = { gender: null, isLunar: false, isLeap: false, json: false, hour: null, minute: 0, lonOff: false, lon: null, city: null };
  const tokens = argv.slice(2).flatMap(s => String(s).split(/\s+/)).filter(Boolean);
  const rest = [];
  for (const raw of tokens) {
    const t = raw.trim();
    if (!t) continue;
    let m;
    if (t === '--json') a.json = true;
    else if (t === '--lunar' || t === '음력' || t === '음') a.isLunar = true;
    else if (t === '--leap' || t === '윤달' || t === '윤') a.isLeap = true;
    else if (/^(남|남자|m|M|male)$/.test(t)) a.gender = '남';
    else if (/^(여|여자|f|F|female)$/.test(t)) a.gender = '여';
    else if (/^(--no-lon|--표준시|표준시|시계시각|무보정|보정없음)$/.test(t)) a.lonOff = true;
    else if ((m = t.match(/^(?:--lon=?|경도)(\d{2,3}(?:\.\d+)?)$/))) a.lon = +m[1];
    else if (CITY_LON[t] != null) a.city = t;
    else rest.push(t);
  }
  for (const t of rest) {
    let m;
    if ((m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/))) { a.year = +m[1]; a.month = +m[2]; a.day = +m[3]; }
    else if ((m = t.match(/^(\d{8})$/))) { a.year = +t.slice(0,4); a.month = +t.slice(4,6); a.day = +t.slice(6,8); }
    else if ((m = t.match(/^(\d{1,2}):(\d{2})$/))) { a.hour = +m[1]; a.minute = +m[2]; }
    else if ((m = t.match(/^(\d{1,2})시$/))) { a.hour = +m[1]; }
  }
  return a;
}

const a = parse(process.argv);
if (!a.year || !a.month || !a.day) {
  console.error('[입력 오류] 생년월일(YYYY-MM-DD)이 필요해.');
  process.exit(1);
}

let result;
try {
  result = computeSaju(a);
} catch (e) {
  console.error('[명식 계산 실패] ' + (e && e.message ? e.message : e));
  process.exit(1);
}

if (a.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log('=== 팔자 ===', JSON.stringify(result.palja));
console.log('=== 신강신약 ===', result.strength.verdict, result.strength);
console.log('=== 격국 ===', result.kyukguk);
console.log('=== 용신 ===', result.yongshin.final);
console.log('=== 형충회합 ===', JSON.stringify({ chung: result.hapchung.chung, samhap: result.hapchung.samhap }));
console.log('=== 신살(기둥별) ===', JSON.stringify(Object.fromEntries(['year','month','day','hour'].map(k => [k, result.manse[k].shinsals]))));
if (result.meta.warnings.length) console.log('⚠', result.meta.warnings.join(' / '));
