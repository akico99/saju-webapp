'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFieldGuide, nameForms } = require('../src/engine/fieldGuide');
const { ILJU } = require('../src/engine/fieldGuideIlju');
const { HEAVENLY_STEMS, EARTHLY_BRANCHES } = require('../src/engine/constants');
const fixture = require('./fixtures/field-guide-1996.json');

function projectGuide(guide) {
  return {
    name: { display: guide.name.display, vocative: guide.name.vocative },
    cover: {
      no: guide.cover.no,
      ilju: guide.cover.ilju,
      iljuKo: guide.cover.iljuKo,
      alias: guide.cover.alias
    },
    pillars: guide.pillars.filter((pillar) => !pillar.unknown)
      .map((pillar) => pillar.stem + pillar.branch),
    ohaeng: Object.fromEntries(guide.constitution.items.map(({ ohaeng, count }) => [ohaeng, count])),
    groups: guide.habit.groups,
    traitKeys: guide.traits.items.map((item) => item.key),
    growth: guide.growth.items.map(({ ganZhi, startAge, isNow, highlight }) => ({ ganZhi, startAge, isNow, highlight })),
    yearly: guide.yearly.items.map(({ year, ganZhi, label }) => ({ year, ganZhi, label })),
    chemistry: Object.fromEntries(guide.chemistry.items.map(({ kind, animals }) => [kind, animals])),
    favorites: guide.favorites?.ohaeng ?? null,
    tags: guide.tags
  };
}

function emptyStrings(value, prefix = 'guide') {
  if (typeof value === 'string') return value.trim() ? [] : [prefix];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => emptyStrings(child, `${prefix}.${key}`));
}

test('matches the known-time and unknown-time reference fixtures', () => {
  const guide = readFieldGuide(fixture.input, {
    ...fixture.opts,
    now: new Date(fixture.opts.now)
  });
  assert.deepEqual(projectGuide(guide), fixture.expect);

  const noHourGuide = readFieldGuide(fixture.noHour.input, {
    ...fixture.noHour.opts,
    now: new Date(fixture.noHour.opts.now)
  });
  const noHourProjection = {
    name: { display: noHourGuide.name.display, vocative: noHourGuide.name.vocative },
    hourKnown: noHourGuide.hourKnown,
    hourPillarUnknown: noHourGuide.pillars[3].unknown,
    ohaeng: Object.fromEntries(noHourGuide.constitution.items.map(({ ohaeng, count }) => [ohaeng, count])),
    traitKeys: noHourGuide.traits.items.map((item) => item.key)
  };
  assert.deepEqual(noHourProjection, fixture.noHour.expect);
});

test('has all 60 일주 entries in cycle order and respects every copy limit', () => {
  const expected = Array.from({ length: 60 }, (_, i) => HEAVENLY_STEMS[i % 10] + EARTHLY_BRANCHES[i % 12]);
  assert.deepEqual(Object.keys(ILJU), expected);

  for (const [ilju, entry] of Object.entries(ILJU)) {
    assert.ok(entry.alias.length <= 14, `${ilju}: alias exceeds 14 characters`);
    assert.ok(entry.habitat.length <= 8, `${ilju}: habitat exceeds 8 characters`);
    assert.ok(entry.oneLine.length <= 24 && entry.oneLine.endsWith('사람'), `${ilju}: invalid oneLine`);
    assert.equal(entry.approach.length, 3, `${ilju}: expected three approach tips`);
    for (const [index, tip] of entry.approach.entries()) {
      assert.ok(tip.q.length > 0 && tip.q.length <= 16, `${ilju}: question ${index + 1} length`);
      assert.ok(tip.a.length > 0 && tip.a.length <= 50, `${ilju}: answer ${index + 1} length`);
    }
    assert.equal(entry.memo.length, 3, `${ilju}: expected three memo lines`);
    for (const [index, line] of entry.memo.entries()) {
      assert.ok(line.length <= 28 && line.endsWith('요.'), `${ilju}: memo ${index + 1} length or ending`);
    }
    assert.ok(entry.hand.length > 0 && entry.hand.length <= 20, `${ilju}: hand length`);
  }
});

test('name particles match the name and blank-name rules', () => {
  assert.deepEqual(nameForms('지은'), { raw: '지은', display: '지은이', vocative: '지은아' });
  assert.deepEqual(nameForms('수아'), { raw: '수아', display: '수아', vocative: '수아야' });
  assert.deepEqual(nameForms('   '), { raw: '', display: '나', vocative: null });
});

test('unknown birth time omits the hour and counts six characters', () => {
  const guide = readFieldGuide({ ...fixture.noHour.input }, {
    ...fixture.noHour.opts,
    now: new Date(fixture.noHour.opts.now)
  });
  assert.equal(guide.hourKnown, false);
  assert.equal(guide.pillars[3].unknown, true);
  assert.equal(guide.constitution.total, 6);
  assert.equal(guide.constitution.items.reduce((sum, item) => sum + item.count, 0), 6);
});

test('every day pillar produces a complete guide with its fixed copy', () => {
  const seen = new Set();
  const now = new Date(fixture.opts.now);

  for (let offset = 0; offset < 60; offset++) {
    const date = new Date(Date.UTC(1996, 4, 21 + offset));
    const guide = readFieldGuide({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: 14,
      minute: 30,
      gender: '여'
    }, { name: '도감 테스트', now });
    const ilju = guide.cover.ilju;

    seen.add(ilju);
    assert.ok(ILJU[ilju], `${ilju}: fixed copy missing`);
    assert.deepEqual(guide.approach.items, ILJU[ilju].approach, `${ilju}: approach copy differs`);
    assert.deepEqual(guide.memo.lines, ILJU[ilju].memo, `${ilju}: memo copy differs`);
    assert.equal(guide.memo.hand, ILJU[ilju].hand, `${ilju}: hand copy differs`);
    assert.deepEqual(emptyStrings(guide), [], `${ilju}: output contains an empty string`);
  }

  assert.equal(seen.size, 60, 'the 60 consecutive dates should cover all day pillars');
});
