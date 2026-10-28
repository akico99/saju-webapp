'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderLoveHtml } = require('../src/pdf/renderLoveHtml');

const engine = { meta:{ input:{ year:1995, month:5, day:15, hour:null, isLunar:false } } };
const timing = { months:Array.from({length:12}, (_,i) => ({ year:i < 2 ? 2026 : 2027, month:(i + 10) % 12 + 1 })) };
const reading = {
  title:'연애 시기 리포트',
  sections:[
    { key:'answer', title:'한 줄 답', text:'이번 흐름의 결론을 읽어요.' },
    { key:'pattern', title:'반복되기 쉬운 연애 패턴', text:'**근거**\n나만의 기운을 살펴보세요.\n\n**장면**\n대답을 기다리며 조급해질 수 있어요.\n\n**해볼 일**\n- 바로 묻기 전에 하루의 여유를 가져보세요.' },
    { key:'action', title:'지금 할 일', text:'- 상대의 답변을 재촉하지 말아 보세요.\n- 나의 바람을 구체적으로 말해 보세요.' }
  ],
  timing,
  monthNotes:timing.months.map(m => ({month:m.month, note:`${m.month}월 고유 해설입니다. 그 달의 관계를 차분히 살펴보세요.`}))
};

test('PDF contains every paid section and all twelve monthly notes in engine order with years', () => {
  const html = renderLoveHtml(engine, {name:'수달'}, reading);
  reading.sections.forEach(s => assert.ok(html.includes(`data-section-key="${s.key}"`)));
  assert.match(html, /이번 흐름의 결론을 읽어요/);
  assert.match(html, /나만의 기운을 살펴보세요/);
  assert.match(html, /바로 묻기 전에 하루의 여유를 가져보세요/);
  assert.match(html, /나의 바람을 구체적으로 말해 보세요/);
  assert.equal((html.match(/class="month"/g) || []).length, 12);
  let previous = -1;
  timing.months.forEach(m => {
    const index = html.indexOf(`<h3>${m.year}년 ${m.month}월</h3>`);
    assert.ok(index > previous, `${m.year}-${m.month} retains chronological order`);
    previous = index;
    assert.ok(html.includes(`${m.month}월 고유 해설입니다.`));
  });
  assert.match(html, /window\.__chartsReady = true/);
  assert.match(html, /data:image\/webp;base64,/);
  assert.match(html, /태어난 시각 모름/);
});

test('names, headings, and generated prose are escaped, without remote resources', () => {
  const html = renderLoveHtml(engine, {name:'<img src=x onerror=alert(1)>'}, {
    title:'<script>bad()</script>',
    sections:[{key:'" onclick="evil',title:'<b>제목</b>',text:'<script>alert(2)</script> & **강조**'}],
    monthNotes:[{month:1,note:'<img src=x onerror=alert(3)>'}]
  });
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;b&gt;제목&lt;/b&gt;'));
  assert.doesNotMatch(html, /<script>(?:bad|alert)/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/);
  assert.match(html, /data-section-key="&quot; onclick=&quot;evil"/);
});

test('legacy text is not truncated and unmatched month notes remain readable', () => {
  const long = '이 문장은 과거 결과에 저장된 내용입니다. '.repeat(90) + '마지막 고유 문장입니다.';
  const html = renderLoveHtml(null, null, {sections:[{key:'body',title:'풀이',text:long}], timing:{months:[{year:2027,month:1}]},monthNotes:[{month:1,note:'새해 기록'},{month:2,note:'누락시키면 안 되는 기록'}]});
  assert.equal((html.match(/이 문장은 과거 결과에 저장된 내용입니다/g) || []).length, 90);
  assert.match(html, /마지막 고유 문장입니다/);
  assert.match(html, /누락시키면 안 되는 기록/);
  assert.match(html, /box-decoration-break:clone/);
  assert.doesNotMatch(html, /text-overflow|line-clamp|overflow:hidden/);
});
