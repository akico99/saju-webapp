'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildFree, buildPaid, monthParts, splitBlocks } = require('../public/love-reading-model');
const { parseLoveText, toPlainText } = require('../src/llm/loveTimingReading');

test('free adapter uses only supplied preview facts and preserves arrays', () => {
  const reading = { strongCount:2, pillars:[{key:'day',hanja:'甲'}], note:'note', charm:{headline:'매력',base:{text:'근거'},found:[]}, balance:{headline:'균형',lead:'설명',bars:[{ko:'목',count:2}]}, seasons:[{label:'봄'}],seasonLead:'계절 안내',locked:['잠긴 항목'] };
  const model = buildFree(reading,{name:'민지',situation:'single'});
  assert.equal(model.kind,'free'); assert.equal(model.facts.pillars,reading.pillars);
  assert.equal(model.facts.balance,reading.balance); assert.equal(model.facts.balance.bars,reading.balance.bars); assert.equal(model.chapters.length,6);
  assert.match(model.chapters[2].blocks[0].text,/별도의 표식이 나타나지 않았/); assert.equal(model.original,reading);
  assert.equal(model.chapters[1].title,'당신이 가진 연애의 매력');
  assert.deepEqual(model.chapters[1].blocks.map(b=>b.text),['근거','사주에서 살펴본 근거','매력']);
  assert.match(model.chapters[0].blocks.map(b=>b.text).join(' '),/솔로/);
});

test('관심 질문은 무료 결과의 유료 목차 순서에만 반영하고 원래 목록을 바꾸지 않는다', () => {
  const reading = { locked:['인연 신호가 강한 세 달','나에게 끌리는 사람','반복되는 연애 패턴'] };
  const model = buildFree(reading, { readingFocus:'pattern' });
  assert.equal(model.facts.locked[0], '반복되는 연애 패턴');
  assert.equal(reading.locked[0], '인연 신호가 강한 세 달');
  assert.deepEqual(buildFree(reading, {}).facts.locked, reading.locked);
});

test('paid adapter retains exact original, legacy sections, paragraphs and year-qualified months', () => {
  const report = '### 한 줄 답\n12개월의 답입니다.\n\n### 나에게 끌리는 사람\n첫 문단입니다.\n\n둘째 문단입니다.\n\n### 내가 끌리는 사람\n다른 문단입니다.\n\n### 사용자 추가 장\n보존해야 할 문장입니다.\n\n### 월별 한 줄\n- 2026년 12월: 연말 흐름\n- 2027년 1월: 새해 흐름';
  const model = buildPaid(report);
  assert.equal(model.original,report);
  assert.deepEqual(model.months.map(({parts,...m})=>m),[{month:12,year:2026,text:'연말 흐름'},{month:1,year:2027,text:'새해 흐름'}]);
  assert.deepEqual(model.months[0].parts,[{label:'',text:'연말 흐름'}]);
  const attraction=model.chapters.find(c=>c.id==='attraction');
  assert.match(attraction.blocks.map(b=>b.text).join(' '),/나에게 끌리는 사람/);
  assert.match(attraction.blocks.map(b=>b.text).join(' '),/내가 끌리는 사람/);
  assert.ok(model.chapters.some(c=>c.title==='사용자 추가 장'));
  assert.match(model.lead,/12개월의 답입니다/);
  assert.ok(!model.chapters.some(c=>c.blocks.some(b=>b.text.includes('12개월의 답입니다'))));
});

test('plain legacy report and empty report remain readable', () => {
  const plain=buildPaid('기존 리포트 전체 본문');
  assert.equal(plain.original,'기존 리포트 전체 본문');
  assert.equal(plain.chapters[0].title,'풀이');
  assert.equal(plain.chapters[0].blocks[0].text,'기존 리포트 전체 본문');
  assert.equal(buildPaid('').chapters.length,1);
});

test('actual toPlainText output forms seven logical paid chapters with unique IDs and lead-only answer', () => {
  const titles=['한 줄 답','인연 신호가 강한 세 달','나에게 끌리는 사람','내가 끌리는 사람','만남이 생기기 쉬운 자리','반복되기 쉬운 연애 패턴','조심할 인연의 신호','썸을 연애로 바꾸려면'];
  const source=titles.map((title,i)=>`### ${title}\n${i===0?'가장 강한 달은 2026년 12월이에요.':`**근거** ${title}의 근거예요.\n\n**행동** 오늘 한 번 대화를 시작해 보세요.`}`).join('\n\n')+'\n\n### 월별 한 줄\n- 2026년 12월: 첫 달\n- 2027년 1월: 다음 달';
  const report=toPlainText(parseLoveText(source,'some'));
  const model=buildPaid(report);
  assert.equal(model.chapters.length,7);
  assert.equal(new Set(model.chapters.map(c=>c.id)).size,7);
  assert.match(model.lead,/2026년 12월/);
  assert.ok(!model.chapters.some(c=>c.blocks.some(b=>b.text.includes('가장 강한 달은 2026년 12월이에요.'))));
  assert.equal(model.chapters.find(c=>c.id==='action').title,'썸을 연애로 바꾸려면');
  assert.deepEqual(model.chapters.find(c=>c.id==='action').blocks.map(b=>b.type),['heading','prose','heading','action']);
  assert.deepEqual(model.months.map(m=>m.month),[12,1]);
});

test('nested titles and preamble stay attached; attraction paragraphs and action labels survive',()=>{
  const model=buildPaid('리포트 안내\n\n### 나에게 끌리는 사람\n**근거** 첫 근거예요.\n\n둘째 문단이에요.\n\n### 내가 끌리는 사람\n다른 장의 문단이에요.\n#### 보충 설명\n보충 문장입니다.');
  assert.equal(model.chapters[0].id,'legacy-preamble');
  const attraction=model.chapters[1];
  assert.equal(attraction.id,'attraction');
  assert.ok(attraction.blocks.some(b=>b.text.includes('둘째 문단이에요.')));
  assert.ok(attraction.blocks.some(b=>b.text.includes('보충 설명')));
  assert.deepEqual(attraction.blocks.filter(b=>b.text==='첫 근거예요.').map(b=>b.type),['prose']);
  assert.ok(attraction.blocks.some(b=>b.type==='heading'&&b.text==='보충 설명'));
  const action=buildPaid('### 솔로인 지금 할 일\n**근거** 이유예요.\n\n**행동** 작은 실천이에요.').chapters[0];
  assert.deepEqual(action.blocks.map(b=>b.type),['heading','prose','heading','action']);
  assert.deepEqual(action.blocks.filter(b=>b.type==='action').map(b=>b.text),['작은 실천이에요.']);
});

const flat = s => s.replace(/\*\*/g,'').replace(/[\s#]+/g,'');

test('짝이 맞는 강조(**구절**)는 남기고 짝 없는 별표는 지우며, 원문과 본문 글자는 잃지 않는다', () => {
  const report='### 한 줄 답\n**강한 달**은 12월이에요.\n\n### 반복되기 쉬운 연애 패턴\n**근거** 첫 문장이에요. 둘째 문장이에요.\n#### **보충**\n- 항목 하나\n* 항목 둘\n1. 항목 셋\n\n### 솔로인 지금 할 일\n설명 문장이에요.\n\n**오늘의 실천**\n- 연락하기\n- 2026년 12월 약속 잡기';
  const m=buildPaid(report);
  assert.equal(m.original,report);
  const seen=[m.lead,...m.chapters.flatMap(c=>c.blocks.map(b=>b.text))];
  // 강조 짝을 걷어 내면 별표가 하나도 남지 않아야 한다(화면에 별표가 그대로 보이면 안 된다).
  assert.ok(!seen.some(t=>t.replace(/\*\*[^*\n]+?\*\*/g,'').includes('*')));
  assert.equal(m.lead,'**강한 달**은 12월이에요.');
  const body=flat(report.replace(/^#{1,3}\s.*$/gm,'').replace(/^\s*(?:[-*]|\d+\.)\s+/gm,''));
  const titles=m.chapters.map(c=>c.title).join('');
  assert.equal(flat(seen.join('').replace(/\*\*/g,'')),flat(body.replace(/\*\*/g,'')));
  assert.ok(titles.length>0);
  const action=m.chapters.find(c=>c.id==='action');
  assert.deepEqual(action.blocks.filter(b=>b.type==='action').map(b=>b.text),['연락하기','2026년 12월 약속 잡기']);
  assert.ok(action.blocks.some(b=>b.type==='prose'&&b.text==='설명 문장이에요.'));
  const pattern=m.chapters.find(c=>c.id==='pattern');
  assert.ok(!pattern.blocks.some(b=>b.type==='action'));
  assert.deepEqual(pattern.blocks.filter(b=>b.type==='heading').map(b=>b.text),['근거','보충']);
});

test('duplicate answer sections keep every sentence; heading-only sections create no empty chapter', () => {
  const m=buildPaid('# 리포트 제목\n\n### 한 줄 답\n첫 답이에요.\n\n### 한 줄 답\n둘째 답이에요.\n\n### 조심할 인연의 신호\n\n### 월별 한 줄\n- 3월: 봄');
  assert.equal(m.title,'리포트 제목');
  assert.equal(m.lead,'첫 답이에요.');
  assert.ok(m.chapters.some(c=>c.blocks.some(b=>b.text==='둘째 답이에요.')));
  assert.ok(m.chapters.every(c=>c.blocks.length>0));
  assert.deepEqual(m.skipped,['조심할 인연의 신호']);
  assert.equal(buildPaid('# 제목','x').chapters.length,0);
});

test('scene mapping follows meaning', () => {
  const m=buildPaid('### 인연 신호가 강한 세 달\n가\n### 만남이 생기기 쉬운 자리\n나\n### 반복되기 쉬운 연애 패턴\n다\n### 조심할 인연의 신호\n라\n### 썸을 연애로 바꾸려면\n마\n### 월별 한 줄\n- 3월: 바');
  assert.deepEqual(m.chapters.map(c=>c.scene),['meeting','conversation','distance','caution','cheer','new-start']);
});

test('prose is grouped into 1-3 sentence cards, never truncated, dates and decimals stay whole', () => {
  const s=n=>'이것은 여섯 단어로 된 아주 긴 한 문장이에요 '.repeat(1).trim()+n+'.';
  const text=[1,2,3,4,5,6,7].map(s).join(' ')+' 2026. 12. 3. 이후에 1.5배가 됐어요.';
  const blocks=buildPaid('### 연애 패턴\n'+text).chapters[0].blocks;
  assert.ok(blocks.length>=3&&blocks.length<=6);
  assert.ok(blocks.every(b=>b.text.length<=260));
  assert.equal(blocks.map(b=>b.text).join(' ').replace(/\s+/g,''),text.replace(/\s+/g,''));
  assert.ok(blocks.some(b=>b.text.includes('2026. 12. 3.')));
  assert.ok(blocks.some(b=>b.text.includes('1.5배')));
  const long='가'.repeat(400)+'.';
  assert.equal(buildPaid('### 연애 패턴\n'+long).chapters[0].blocks[0].text,long);
});

test('model source avoids regex lookbehind', () => {
  assert.ok(!/\(\?<[=!]/.test(require('node:fs').readFileSync(require.resolve('../public/love-reading-model'),'utf8')));
});

test('월별 표지는 흐름·해볼 일·점검으로 나누고, 문장에 붙은 표지는 소제목으로 떼지 않는다', () => {
  assert.deepEqual(monthParts('**흐름** 표현이 살아나는 달. **해볼 일** 먼저 연락하기. **점검** 답장 속도 보기.'),
    [{label:'흐름',text:'표현이 살아나는 달.'},{label:'해볼 일',text:'먼저 연락하기.'},{label:'점검',text:'답장 속도 보기.'}]);
  const attached = splitBlocks('**근거**부터 보면, 불의 기운이에요.', false);
  assert.equal(attached.some(b=>b.type==='heading'), false);
  assert.match(attached.map(b=>b.text).join(' '), /^\*\*근거\*\*부터 보면/);
  const alone = splitBlocks('**근거**\n불의 기운이에요.', false);
  assert.deepEqual(alone[0], {type:'heading',text:'근거'});
});

test('강조 구절 안의 마침표에서는 문장을 자르지 않는다', () => {
  const blocks = splitBlocks('앞 문장이에요. **이 달이 가장 강해요.** 뒤 문장이에요.', false);
  for (const b of blocks) assert.equal((b.text.match(/\*\*/g) || []).length % 2, 0, b.text);
});
