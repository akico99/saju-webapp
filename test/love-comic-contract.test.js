'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {buildFree} = require('../public/love-reading-model');
const fixture = require('../public/love-assets/reading-example.json');

test('짧은 연출 대사는 해설과 분리되고 원래 무료 해설은 모두 남는다', () => {
  const m = buildFree(fixture.free, {name:'여울',situation:'some',readingFocus:'timing'});
  assert.ok(m.chapters.filter(c => c.speech).length >= 4);
  assert.ok(m.chapters.every(c=>!c.speech || c.speech.length < 60));
  const body = m.chapters.flatMap(c=>c.blocks.map(b=>b.text)).join(' ');
  assert.ok(body.includes(fixture.free.charm.base.text));
  assert.ok(body.includes(fixture.free.seasonLead));
  assert.equal(m.focus,'timing');
  assert.ok(m.chapters.find(c=>c.id==='seasons').featured);
});

test('무료 도입은 실제 계산값과 관계 상황을 사용하고 이름을 HTML로 만들지 않는다', () => {
  const m=buildFree({...fixture.free,strongCount:0},{name:'<img src=x>',situation:'breakup'});
  assert.ok(!m.lead.includes('0번'));
  assert.ok(m.title.includes('<img src=x>'));
  assert.match(m.chapters[0].blocks.map(b=>b.text).join(' '),/이별/);
  assert.ok(!JSON.stringify(m.chapters).includes('상위 3%'));
});
