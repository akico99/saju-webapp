'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../public/reading-model-compat.js');

const dir = path.join(__dirname, '..', 'public', 'samples', 'compat');

test('궁합 읽기 모델: 샘플 4종 모두 장으로 나뉘고 글이 빠지지 않는다', () => {
  for (const f of ['연애', '부부', '시작전', '재회']) {
    const text = fs.readFileSync(path.join(dir, f + '-본문.md'), 'utf8');
    const m = M.build(text);
    assert.ok(m, f);
    assert.equal(m.original, text);
    const heads = M.splitReport(text).prose.split(/\r?\n/).filter((l) => /^###\s/.test(l)).length;
    assert.equal(m.chapters.length, heads, f);
    assert.ok(m.chapters.every((c) => c.title && c.scene && c.blocks.length), f);
    assert.equal(new Set(m.chapters.map((c) => c.scene)).size, m.chapters.length, '장면이 장마다 다르다: ' + f);
    assert.ok(m.chapters.every((c) => c.blocks.every((b) => (b.text.match(/\*\*/g) || []).length % 2 === 0)), '강조 표시가 짝을 이룬다');
    for (const c of m.chapters) {
      const lead = c.blocks[0].text.replace(/\*\*/g, '');
      const n = M.sentences(lead).length;
      assert.ok(n === 1 || (n === 2 && lead.length <= 91), '말풍선은 1~2문장(2문장이면 약 90자 이내): ' + lead.length + '자 ' + n + '문장');
    }
  }
});

test('궁합 읽기 모델: 소제목이 없거나 본문이 비면 안전하게 처리한다', () => {
  assert.equal(M.build(''), null);
  assert.equal(M.build('### 지금 할 것\n- 하나\n'), null);
  const plain = M.build('소제목 없는 글입니다. 두 번째 문장입니다.');
  assert.equal(plain.chapters.length, 1);
  assert.equal(plain.chapters[0].blocks.map((b) => b.text).join(' '), '소제목 없는 글입니다. 두 번째 문장입니다.');
  const odd = M.build('### 알 수 없는 장\n**강조가 아주 긴 문장은 여기서 시작합니다. 둘째 문장도 강조입니다. 셋째 문장까지 이어집니다. 넷째 문장에서 끝납니다.** 마무리.');
  assert.ok(odd.chapters[0].blocks.every((b) => (b.text.match(/\*\*/g) || []).length % 2 === 0));
});
