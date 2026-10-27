'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'public');
const profilesPage = fs.readFileSync(path.join(root, 'profiles.html'), 'utf8');
const pickerSource = fs.readFileSync(path.join(root, 'profile-picker.js'), 'utf8');
const injection = '<img src=x onerror=alert(1)>';

function node(tag) {
  return {
    tag, children: [], attributes: {}, textContent: '', value: '', className: '', listeners: {},
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    get classList() { return { remove() {}, add() {} }; },
    set innerHTML(value) {
      if (value) throw new Error('untrusted profile data must never be parsed as HTML');
      this.children = [];
    }
  };
}

function textOf(rootNode) {
  return [rootNode.textContent || '', ...(rootNode.children || []).map(textOf)].join('');
}

function tagsOf(rootNode) {
  return [rootNode.tag, ...(rootNode.children || []).flatMap(tagsOf)];
}

test('saved profile rows render names and labels as text', () => {
  assert.doesNotMatch(profilesPage, /div\.innerHTML\s*=/);
  const declaration = profilesPage.match(/function createProfileItem\(p\) \{[\s\S]*?\n  \}/);
  assert.ok(declaration, 'profile list should have an isolated DOM row renderer');
  const createProfileItem = vm.runInNewContext(`(${declaration[0]})`, {
    document: { createElement: node },
    summarize: () => '1994.05.17 (양력) · 09:00',
    PRIMARY_BADGE: '내 정보 · 오늘의 운세'
  });

  const item = createProfileItem({ id: 7, label: injection, name: '<svg onload=alert(2)>', isPrimary: false });
  assert.ok(textOf(item.element).includes(injection));
  assert.equal(tagsOf(item.element).includes('img'), false);
  assert.equal(tagsOf(item.element).includes('svg'), false);
  assert.equal(item.editButton.textContent, '수정');
});

test('profile picker uses text nodes for API-provided labels and names', async () => {
  assert.doesNotMatch(pickerSource, /container\.innerHTML\s*=/);
  const saved = { id: 8, label: injection, name: '<svg onload=alert(3)>', gender: '여', birthYear: 1994, birthMonth: 5, birthDay: 17 };
  const container = node('div');
  const form = { elements: {} };
  const window = {};
  const document = { createElement: node };
  const fetch = async () => ({ ok: true, json: async () => ({ profiles: [saved] }) });
  vm.runInNewContext(pickerSource, { window, document, fetch });

  window.ProfilePicker.mount(container, form, { placeholder: injection });
  await new Promise(setImmediate);

  assert.equal(container.children[0].tag, 'label');
  assert.equal(container.children[1].tag, 'select');
  const options = container.children[1].children;
  assert.equal(options[0].textContent, injection);
  assert.equal(options[1].textContent, `${injection} · <svg onload=alert(3)>`);
  assert.equal(tagsOf(container).includes('img'), false);
  assert.equal(tagsOf(container).includes('svg'), false);
});
