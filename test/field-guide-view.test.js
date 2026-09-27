'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFieldGuide } = require('../src/engine/fieldGuide');
const { renderFieldGuide } = require('../public/field-guide-view');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.ownText = '';
    this.style = { setProperty(name, value) { this[name] = value; } };
  }

  set textContent(value) {
    this.children = [];
    this.ownText = String(value ?? '');
  }

  get textContent() {
    return this.ownText + this.children.map((child) => child.textContent).join('');
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node instanceof FakeElement) this.children.push(node);
      else this.children.push(new FakeText(String(node)));
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  get classList() {
    return {
      add: (...names) => {
        const values = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => values.add(name));
        this.className = [...values].join(' ');
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }

  get innerHTML() {
    return '';
  }

  set innerHTML(_value) {
    throw new Error('renderer must not write innerHTML');
  }

  findByClass(name) {
    if (this.classList.contains(name)) return this;
    for (const child of this.children) {
      if (child instanceof FakeElement) {
        const found = child.findByClass(name);
        if (found) return found;
      }
    }
    return null;
  }
}

class FakeText {
  constructor(value) { this.textContent = value; }
}

function makeDocument() {
  return { createElement: (tagName) => new FakeElement(tagName) };
}

function sampleGuide(name = '지은') {
  return readFieldGuide(
    { year: 1996, month: 5, day: 21, hour: 14, minute: 30, gender: '여' },
    { name, now: new Date('2026-09-27') },
  );
}

test('renders guide sections and inserts a supplied name as text', () => {
  global.document = makeDocument();
  const container = new FakeElement('main');
  const guide = sampleGuide('<img src=x>');

  renderFieldGuide(guide, container);

  assert.ok(container.findByClass('fg-report'));
  assert.ok(container.findByClass('fg-cover'));
  assert.ok(container.findByClass('fg-pillars'));
  assert.ok(container.findByClass('fg-growth'));
  assert.ok(container.findByClass('fg-favorites'));
  assert.ok(container.textContent.includes(guide.name.display));
  assert.ok(container.textContent.includes('관찰자 수달의 메모'));
  assert.ok(!container.textContent.includes('undefined'));
});

test('shows an unknown birth hour as unavailable and includes the guide note', () => {
  global.document = makeDocument();
  const container = new FakeElement('main');
  const guide = readFieldGuide(
    { year: 1996, month: 5, day: 21, gender: '여' },
    { name: '수아', now: new Date('2026-09-27') },
  );

  renderFieldGuide(guide, container);

  const hour = container.findByClass('fg-pillar-unknown');
  assert.ok(hour);
  assert.ok(hour.textContent.includes('모름'));
  assert.ok(container.textContent.includes(guide.note));
});
