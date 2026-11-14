'use strict';
/* 쉬운 말 프롬프트 전/후 비교표를 docs/preview/love-plain-before-after.md 로 만든다.
   사용: node docs/preview/compare-love-plain.js  (이전 love-generated-{some,single}.json 과 새 love-generated-plain-*.json 필요) */
const fs = require('fs'); const path = require('path');
const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const TERMS = ['일간', '비견', '겁재', '식신', '상관', '정재', '편재', '정관', '편관', '정인', '편인', '장성', '역마', '도화', '화개', '지장간', '용신', '대운'];
const count = (text, re) => (text.match(re) || []).length;
const esc = s => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const BYEOL = /(?<![가-힣])별(?:이|은|을|가|의|도|만|과|로)?(?![가-힣])/g;
function sentencesOf(report) {
  const body = report.split('\n').filter(l => !/^\s*#{1,6}\s/.test(l) && !/^\s*\*\*[^*]{1,24}\*\*\s*$/.test(l))
    .map(l => l.replace(/^\s*-\s*/, '').replace(/\*\*/g, '').replace(/\(근거[^)]*\)/g, '')).join(' ');
  return body.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 4);
}
function metrics(report) {
  const out = {};
  // 낱말 시작 위치만 센다("감정인지"의 정인 같은 우연한 겹침 제외).
  for (const t of TERMS) out[t] = count(report, new RegExp('(?<![가-힣])' + esc(t), 'g'));
  const sents = sentencesOf(report);
  const lens = sents.map(s => s.length);
  return {
    terms: out, termTotal: Object.values(out).reduce((a, b) => a + b, 0),
    gi: count(report, /기운/g), byeol: count(report, BYEOL), hanja: count(report, /[\u4e00-\u9fff]/g),
    chars: report.length, sentences: sents.length,
    avg: Math.round(lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length) * 10) / 10,
    over60: Math.round(lens.filter(n => n > 60).length / Math.max(1, lens.length) * 100)
  };
}
const label = /^\*\*[^*]{1,24}\*\*\s*[:：]?\s*$/;
function section(report, title) {
  const parts = report.split(/^## /m).slice(1);
  const hit = parts.find(p => p.split('\n')[0].trim() === title);
  return hit ? hit.split('\n').slice(1).join('\n').trim() : '';
}
// 장(또는 1위 달 구간)의 앞 두 문단. 굵은 표지만 있는 줄과 달 제목 줄은 건너뛴다.
function firstParas(text, n) {
  const paras = text.split(/\n\s*\n/).map(p => p.split('\n').filter(l => l.trim() && !label.test(l.trim())).join(' ').trim()).filter(Boolean);
  return paras.slice(0, n);
}
function topMonth(report, ym) {
  const sec = section(report, '인연 신호가 강한 세 달');
  const i = sec.indexOf('**' + ym + '**');
  if (i < 0) return '';
  const rest = sec.slice(i + ym.length + 4);
  const j = rest.search(/\*\*\d{4}년 \d{1,2}월\*\*/);
  return (j < 0 ? rest : rest.slice(0, j)).trim();
}
const quote = paras => paras.map(p => '> ' + p).join('\n>\n');
function build(situation, before, after, parts) {
  const mb = metrics(before.report), ma = metrics(after.report);
  const row = (name, b, a) => '| ' + name + ' | ' + b + ' | ' + a + ' |';
  const lines = [];
  lines.push('### ' + situation.name + ' (' + situation.person + ')', '');
  lines.push('| 항목 | 이전 | 이후 |', '| --- | ---: | ---: |');
  lines.push(row('전체 글자 수', mb.chars, ma.chars));
  lines.push(row('금지 용어 합계', mb.termTotal, ma.termTotal));
  for (const t of TERMS) if (mb.terms[t] || ma.terms[t]) lines.push(row('- ' + t, mb.terms[t], ma.terms[t]));
  lines.push(row('한자 글자 수', mb.hanja, ma.hanja));
  lines.push(row('"기운" 출현', mb.gi, ma.gi), row('"별" 출현', mb.byeol, ma.byeol));
  lines.push(row('문장 수', mb.sentences, ma.sentences), row('평균 문장 길이(공백 포함 글자)', mb.avg, ma.avg), row('60자 넘는 문장 비율(%)', mb.over60, ma.over60), '');
  for (const p of parts) {
    lines.push('#### ' + p.name, '', '이전:', '', quote(p.before), '', '이후:', '', quote(p.after), '');
  }
  return lines.join('\n');
}
const sets = [
  { key: 'some', name: '썸', person: '서연, 가상 인물', title: '썸을 연애로 바꾸려면', before: 'love-generated-some.json', after: 'love-generated-plain-some.json' },
  { key: 'single', name: '솔로', person: '지우, 가상 인물', title: '', before: 'love-generated-single.json', after: 'love-generated-plain-single.json' }
];
const md = ['# 연애 시기 리포트: 쉬운 말 프롬프트 전/후 비교', '',
  '같은 가상 인물·같은 기준일(2026-10-28)로 실제 생성한 두 샘플을 비교했습니다. 결제·이메일 발송 없음. 문장 길이는 제목·표지·근거 괄호를 뺀 본문을 마침표 기준으로 나눠 센 값입니다. "별"은 단독 낱말(연인을 뜻하는 별 등)만 세고 "특별" 같은 낱말 속 글자는 세지 않았습니다.', ''];
md.push('금지 용어(일간·십성·신살·지장간·용신·대운)는 낱말이 그 글자로 시작할 때만 셉니다.', '');
for (const s of sets) {
  if (!fs.existsSync(path.join(__dirname, s.after))) continue;
  const b = read(s.before), a = read(s.after);
  const top = b.reading.timing.top3[0], ym = top.year + '년 ' + top.month + '월';
  const actionTitle = (b.reading.sections.find(x => x.key === 'action') || {}).title;
  const pick = (r, f) => firstParas(f(r.report), 2);
  const parts = [
    { name: '강한 달 1위 (' + ym + ')', before: pick(b, r => topMonth(r, ym)), after: pick(a, r => topMonth(r, ym)) },
    { name: '내가 끌리는 사람', before: pick(b, r => section(r, '내가 끌리는 사람')), after: pick(a, r => section(r, '내가 끌리는 사람')) },
    { name: '반복되기 쉬운 연애 패턴', before: pick(b, r => section(r, '반복되기 쉬운 연애 패턴')), after: pick(a, r => section(r, '반복되기 쉬운 연애 패턴')) },
    { name: '상황 행동: ' + actionTitle, before: pick(b, r => section(r, actionTitle)), after: pick(a, r => section(r, actionTitle)) }
  ];
  md.push(build(s, b, a, parts));
}
fs.writeFileSync(path.join(__dirname, 'love-plain-before-after.md'), md.join('\n'));
console.log('saved');
