(function attachFieldGuideView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.renderFieldGuide = api.renderFieldGuide;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createFieldGuideView() {
  'use strict';

  const SECTION_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function append(parent, ...children) {
    parent.append(...children.filter(Boolean));
    return parent;
  }

  function colorFor(guide, ohaeng) {
    const item = guide.constitution.items.find((entry) => entry.ohaeng === ohaeng);
    return item ? item.color : 'var(--fg-muted)';
  }

  function setColor(node, color) {
    node.style.setProperty('--fg-item-color', color);
  }

  function basisLine(value) {
    return value ? element('p', 'fg-basis', `근거 · ${value}`) : null;
  }

  function card(number, title, subtitle, className, basis) {
    const section = element('section', `fg-card ${className || ''}`.trim());
    section.setAttribute('aria-label', title);
    const heading = element('div', 'fg-card-heading');
    append(
      heading,
      element('span', 'fg-section-number', number),
      element('h2', '', title),
      element('span', 'fg-card-subtitle', subtitle),
    );
    append(section, heading);
    section.fgBody = element('div', 'fg-card-body');
    append(section, section.fgBody, basisLine(basis));
    return section;
  }

  function renderCover(guide) {
    const cover = element('header', 'fg-cover');
    const copy = element('div', 'fg-cover-copy');
    const mark = element('span', 'fg-cover-mark', '수달이 기록한 사주 도감');
    const identity = element('p', 'fg-cover-identity', `No.${guide.cover.no} · ${guide.cover.iljuKo} ${guide.cover.ilju}`);
    const title = element('h1', 'fg-title', guide.name.display);
    append(title, ' ', element('span', 'fg-title-suffix', '사주 도감'));
    const story = element('p', 'fg-cover-story', guide.cover.alias);
    const oneLine = element('p', 'fg-cover-one-line', guide.cover.oneLine);
    const facts = element('div', 'fg-cover-facts');
    (guide.cover.facts || []).forEach((fact) => {
      const chip = element('span', 'fg-fact', `${fact.label} · ${fact.value}`);
      append(facts, chip);
    });
    append(copy, mark, identity, title, story, oneLine, facts);

    const stamp = element('div', 'fg-number-stamp');
    append(stamp, element('span', '', '도감 번호'), element('strong', '', guide.cover.no), element('small', '', `${guide.cover.total}종 중`));
    const art = element('img', 'fg-cover-art');
    art.setAttribute('src', '/illustrations/otter-field-guide.png');
    art.setAttribute('alt', '사주 도감을 살펴보는 수달');
    append(cover, copy, stamp, art);
    return cover;
  }

  function renderPillars(guide) {
    const section = card(SECTION_NUMBERS[0], '분류 기록', '태어난 해·달·날·시의 글자', 'fg-pillars', '실제 만세력으로 계산한 사주(원국)');
    const row = element('div', 'fg-pillar-layout');
    const pillars = element('div', 'fg-pillar-grid');
    guide.pillars.forEach((pillar) => {
      const tile = element('div', `fg-pillar${pillar.isMe ? ' is-me' : ''}${pillar.unknown ? ' fg-pillar-unknown' : ''}`);
      append(tile, element('span', 'fg-pillar-label', pillar.label));
      if (pillar.unknown) {
        append(tile, element('strong', 'fg-pillar-unknown-text', '모름'));
      } else {
        const glyphs = element('div', 'fg-pillar-glyphs');
        const stem = element('span', '');
        const branch = element('span', '');
        stem.textContent = pillar.stem;
        branch.textContent = pillar.branch;
        setColor(stem, colorFor(guide, pillar.stemOhaeng));
        setColor(branch, colorFor(guide, pillar.branchOhaeng));
        append(glyphs, stem, branch);
        append(tile, glyphs, element('span', 'fg-pillar-ko', `${pillar.stemKo}${pillar.branchKo}`));
      }
      append(tile, element('span', 'fg-pillar-meaning', pillar.meaning));
      append(pillars, tile);
    });

    const list = element('ul', 'fg-ohaeng-list');
    guide.constitution.items.forEach((item) => {
      const rowItem = element('li', item.count === 0 ? 'is-empty' : '');
      const marker = element('span', 'fg-ohaeng-marker');
      setColor(marker, item.color);
      append(rowItem, marker, element('span', '', `${item.name} ${item.hanja}`), element('strong', '', item.count));
      append(list, rowItem);
    });
    append(row, pillars, list);
    append(section.fgBody, row);
    return section;
  }

  function renderConstitution(guide) {
    const section = card(SECTION_NUMBERS[1], '체질', '다섯 기운 배터리', 'fg-constitution', guide.constitution.basis);
    const batteries = element('div', 'fg-batteries');
    guide.constitution.items.forEach((item) => {
      const battery = element('div', 'fg-battery');
      const symbol = element('strong', 'fg-battery-symbol', item.hanja);
      setColor(symbol, item.color);
      const shell = element('div', 'fg-battery-shell');
      shell.setAttribute('role', 'img');
      shell.setAttribute('aria-label', `${item.name} ${item.count}개, ${item.label}`);
      const segments = element('div', 'fg-battery-segments');
      for (let index = 0; index < 4; index += 1) {
        const segment = element('i', index < item.cells ? 'is-filled' : '');
        setColor(segment, item.color);
        append(segments, segment);
      }
      append(shell, segments);
      append(battery, symbol, shell, element('span', 'fg-battery-count', `${item.count}/${guide.constitution.total}`), element('small', '', item.label));
      append(batteries, battery);
    });
    append(section.fgBody, batteries, element('p', 'fg-summary', guide.constitution.summary));
    return section;
  }

  function renderHabit(guide) {
    const section = card(SECTION_NUMBERS[2], '습성', '내가 자주 쓰는 힘', 'fg-habit', guide.habit.basis);
    const layout = element('div', 'fg-habit-layout');
    const chart = element('div', 'fg-donut');
    const values = guide.habit.legend.filter((entry) => entry.count > 0);
    const total = values.reduce((sum, entry) => sum + entry.count, 0);
    let cursor = 0;
    const stops = values.map((entry) => {
      const start = cursor;
      cursor += total ? (entry.count / total) * 360 : 0;
      return `${entry.color} ${start}deg ${cursor}deg`;
    });
    chart.style.setProperty('--fg-donut', stops.length ? `conic-gradient(${stops.join(', ')})` : 'conic-gradient(var(--surface-2) 0deg 360deg)');
    const dayStem = guide.pillars.find((pillar) => pillar.isMe);
    append(chart, element('span', '', dayStem ? dayStem.stem : '·'));

    const legend = element('ul', 'fg-habit-legend');
    guide.habit.legend.forEach((entry) => {
      const item = element('li', entry.count === 0 ? 'is-empty' : '');
      const marker = element('i', 'fg-legend-marker');
      setColor(marker, entry.color);
      append(item, marker, element('span', '', entry.label), element('strong', '', `${entry.count}`));
      append(legend, item);
    });
    append(layout, chart, legend);
    append(section.fgBody, layout, element('h3', 'fg-habit-headline', guide.habit.headline), element('p', 'fg-habit-body', guide.habit.body));
    if (guide.habit.missing) append(section.fgBody, element('p', 'fg-habit-missing', guide.habit.missing));
    return section;
  }

  function renderTraits(guide) {
    const section = card(SECTION_NUMBERS[3], '특이 행동', '타고난 특별한 표지', 'fg-traits', guide.traits.basis);
    const list = element('div', 'fg-trait-list');
    guide.traits.items.forEach((trait) => {
      const row = element('article', 'fg-trait');
      append(row, element('span', 'fg-trait-seal', trait.seal || '平'), element('span', 'fg-trait-copy', ''));
      const copy = row.children[1];
      append(copy, element('strong', '', trait.title), element('span', '', trait.desc));
      append(list, row);
    });
    append(section.fgBody, list);
    return section;
  }

  function renderGrowth(guide) {
    const section = card(SECTION_NUMBERS[4], '성장 기록', '10년마다 바뀌는 인생의 계절', 'fg-growth', guide.growth.basis);
    const timeline = element('div', 'fg-timeline');
    guide.growth.items.forEach((item) => {
      const entry = element('article', `fg-growth-item${item.isNow ? ' is-now' : ''}`);
      if (item.isNow) append(entry, element('span', 'fg-now-label', '지금 여기'));
      const circle = element('div', 'fg-growth-glyphs');
      const stem = element('span', '', item.ganZhi[0]);
      const branch = element('span', '', item.ganZhi[1]);
      setColor(stem, colorFor(guide, item.stemOhaeng));
      setColor(branch, colorFor(guide, item.branchOhaeng));
      append(circle, stem, branch);
      const age = element('strong', 'fg-growth-age', `${item.startAge}~${item.endAge}세`);
      append(age, element('small', 'fg-growth-ko', `${item.ganZhiKo} 대운`));
      const description = element('p', 'fg-growth-line');
      if (item.highlight) append(description, element('b', '', item.highlight), element('span', '', item.line));
      else description.textContent = item.line;
      append(entry, circle, age, description);
      append(timeline, entry);
    });
    append(section.fgBody, timeline);
    return section;
  }

  function renderYearly(guide) {
    const section = card(SECTION_NUMBERS[5], '올해의 관찰 기록', '올해와 내년의 흐름', 'fg-yearly', guide.yearly.basis);
    const years = element('div', 'fg-year-grid');
    guide.yearly.items.forEach((item) => {
      const year = element('article', `fg-year${item.label ? ' is-highlighted' : ''}`);
      const glyphs = element('strong', 'fg-year-glyphs');
      const stem = element('span', '', item.ganZhi[0]);
      const branch = element('span', '', item.ganZhi[1]);
      setColor(stem, item.label ? 'var(--gold)' : colorFor(guide, item.stemOhaeng));
      setColor(branch, item.label ? 'var(--gold)' : colorFor(guide, item.branchOhaeng));
      append(glyphs, stem, branch);
      append(year, glyphs, element('h3', 'fg-year-title', item.title));
      if (item.label) append(year, element('span', 'fg-year-label', item.label));
      append(year, element('p', 'fg-year-body', item.body));
      append(years, year);
    });
    append(section.fgBody, years);
    return section;
  }

  function renderChemistry(guide) {
    const section = card(SECTION_NUMBERS[6], '어울리는 종 · 부딪히는 종', '상대의 띠로 보는 궁합', 'fg-chemistry', guide.chemistry.basis);
    const list = element('div', 'fg-chemistry-list');
    guide.chemistry.items.forEach((item) => {
      const row = element('article', `fg-chemistry-row kind-${item.kind}`);
      append(row, element('span', 'fg-chemistry-kind', item.label));
      const branches = element('div', 'fg-branch-list');
      item.branches.forEach((branch) => {
        const token = element('span', 'fg-branch');
        setColor(token, colorFor(guide, branch.ohaeng));
        append(token, element('b', '', branch.hanja));
        append(branches, token);
      });
      const copy = element('div', 'fg-chemistry-copy');
      append(copy, element('strong', '', item.animals), element('p', '', item.line));
      append(row, branches, copy);
      append(list, row);
    });
    append(section.fgBody, list);
    return section;
  }

  function renderApproach(guide) {
    const section = card(SECTION_NUMBERS[7], '다가가는 법', '주변 사람을 위한 팁', 'fg-approach', guide.approach.basis);
    const list = element('div', 'fg-qa-list');
    guide.approach.items.forEach((item) => {
      const row = element('article', 'fg-qa');
      append(row, element('h3', 'fg-question', item.q), element('p', 'fg-answer', item.a));
      append(list, row);
    });
    append(section.fgBody, list);
    return section;
  }

  function renderFavorites(guide) {
    const favorites = guide.favorites;
    const section = card(SECTION_NUMBERS[8], '좋아하는 것과 서식지', favorites ? `나에게 힘이 되는 ${favorites.name} 기운` : '생활 참고 기록', 'fg-favorites', favorites ? favorites.basis : null);
    if (!favorites) {
      append(section.fgBody, element('p', 'fg-empty', '이 기록은 아직 비어 있어요.'));
      return section;
    }
    const table = element('dl', 'fg-favorites-list');
    favorites.rows.forEach((row) => {
      const item = element('div', `fg-favorite-row${row.hand ? ' is-handwritten' : ''}`);
      append(item, element('dt', '', row.label), element('dd', '', row.value));
      append(table, item);
    });
    append(section.fgBody, table, element('p', 'fg-favorite-note', favorites.note));
    return section;
  }

  function renderMemo(guide) {
    const section = element('section', 'fg-memo');
    const illustration = element('img', 'fg-memo-art');
    illustration.setAttribute('src', '/tiles/noble.webp');
    illustration.setAttribute('alt', '수달의 사주 관찰 삽화');
    const note = element('div', 'fg-memo-note');
    append(note, element('h2', '', '관찰자 수달의 메모'));
    (guide.memo.lines || []).forEach((line) => append(note, element('p', 'fg-memo-line', line)));
    append(note, element('p', 'fg-memo-hand', guide.memo.hand));
    const tags = element('div', 'fg-tags');
    (guide.tags || []).forEach((tag) => append(tags, element('span', '', tag)));
    append(note, tags);
    append(section, illustration, note);
    return section;
  }

  function renderFooter() {
    const footer = element('footer', 'fg-report-footer');
    const brand = element('a', 'fg-brand');
    brand.setAttribute('href', '/');
    const logo = element('img', '');
    logo.setAttribute('src', '/logo.png');
    logo.setAttribute('alt', '사주보는 수달');
    append(brand, logo, element('span', '', '사주보는 수달'), element('small', '', '실제 만세력으로 계산해요'));
    const callout = element('div', 'fg-footer-callout');
    append(callout, element('span', '', '친구 도감도 모아 보세요 · 60종'));
    const link = element('a', 'fg-footer-button', '내 사주 도감 무료로 만들기 →');
    link.setAttribute('href', '#fieldGuideForm');
    append(callout, link);
    append(footer, brand, callout);
    return footer;
  }

  function renderFieldGuide(guide, container) {
    if (!guide || !container) throw new TypeError('guide와 container가 필요해요.');
    const report = element('article', 'fg-report');
    report.setAttribute('aria-label', `${guide.name.display} 사주 도감`);
    append(report, renderCover(guide));
    // 분류 기록 카드가 표지 위로 겹쳐 올라가므로, 시각 안내는 그 카드 바로 아래에 둔다.
    const note = guide.note ? element('p', 'fg-hour-note', guide.note) : null;
    const top = element('div', 'fg-card-grid fg-grid-3');
    append(top, renderConstitution(guide), renderHabit(guide), renderTraits(guide));
    const middle = element('div', 'fg-card-grid fg-grid-2');
    append(middle, renderYearly(guide), renderChemistry(guide));
    const lower = element('div', 'fg-card-grid fg-grid-2');
    append(lower, renderApproach(guide), renderFavorites(guide));
    append(report, renderPillars(guide), note, top, renderGrowth(guide), middle, lower, renderMemo(guide), renderFooter());
    container.replaceChildren(report);
    return report;
  }

  return { renderFieldGuide };
}));
