'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeYongshin } = require('../../src/engine/yongshin');

const noGuk = { samhap: { complete: [] }, banghap: { complete: [] } };

test('억부-조후 일치(조후 트리거 없음) — 단일 결론으로 병기', () => {
  const core = { ilgan: { ohaeng: '木' }, palja: { monthPillar: { branch: '寅' } } };
  const strength = { verdict: '신강', score: 5 };
  const counts = { ohaeng: { 木: 3, 火: 1, 土: 1, 金: 1, 水: 1 } };
  const r = analyzeYongshin(core, strength, noGuk, counts);
  assert.equal(r.eokbu.primary, '火'); // productOf(木)=火
  assert.equal(r.final.main, '火');
  assert.match(r.final.note, /상충하지 않음/);
});

test('억부-조후 불일치(겨울생 水과다) — 구조화된 채로 병기', () => {
  const core = { ilgan: { ohaeng: '水' }, palja: { monthPillar: { branch: '子' } } };
  const strength = { verdict: '신강', score: 5 };
  const counts = { ohaeng: { 木: 1, 火: 0, 土: 1, 金: 1, 水: 3 } };
  const r = analyzeYongshin(core, strength, noGuk, counts);
  assert.equal(r.eokbu.primary, '木'); // productOf(水)=木
  assert.equal(r.johu.element, '火');
  assert.notEqual(r.johu.element, r.eokbu.primary);
  assert.match(r.final.note, /억부용신은 木/);
  assert.match(r.final.note, /조후상 보완 오행은 火/);
});

test('병약용신 — 완전국이 다른 오행을 심하게 극할 때만 트리거', () => {
  const core = { ilgan: { ohaeng: '木' }, palja: { monthPillar: { branch: '寅' } } };
  const strength = { verdict: '중화', score: 0 };
  // 水局(申子辰) 완전 → 水克火, 火가 1개 이하면 병약후보 발동(水를 극하는 土)
  const hapchung = { samhap: { complete: [{ branches: ['申', '子', '辰'], element: '水' }] }, banghap: { complete: [] } };
  const counts = { ohaeng: { 木: 1, 火: 1, 土: 1, 金: 1, 水: 3 } };
  const r = analyzeYongshin(core, strength, hapchung, counts);
  assert.equal(r.byeongyak.element, '土'); // whoControls('水') = '土'
});
