/* 오늘의 운세 결과 렌더 — today-preview.html(무료 체험)과 today-fortune.html(회원)이 공유한다.
   API 응답(fortune, week)은 그대로 두고 화면만 그린다. 두 페이지의 요소 id는 접두어만
   다르므로(tp / tf) prefix로 받는다. */
(function () {
  'use strict';

  const WEATHER_ICON = {
    '맑음': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    '구름 조금': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 5.5a3.5 3.5 0 0 1 6.6 1.6"/><path d="M4 11a3 3 0 0 1 2.7-3h.4"/><path d="M7 19h10a4 4 0 0 0 .5-8 5 5 0 0 0-9.6 1.4A3.5 3.5 0 0 0 7 19z"/></svg>',
    '흐림': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .5-8 5 5 0 0 0-9.6 1.4A3.5 3.5 0 0 0 7 18z"/></svg>',
    '비': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15h10a4 4 0 0 0 .5-8 5 5 0 0 0-9.6 1.4A3.5 3.5 0 0 0 7 15z"/><path d="M9 18v2M13 18v3M17 18v2"/></svg>'
  };

  const el = (id) => document.getElementById(id);
  const li = (items) => items.map((s) => { const n = document.createElement('li'); n.textContent = s; return n; });

  // "2026년 09월 18일" → "9월 18일". 오늘 결과에 연도는 소음이고 0은 표 같아 보인다.
  function shortDate(dateStr) {
    const m = /(\d+)월\s*(\d+)일/.exec(dateStr || '');
    return m ? `${Number(m[1])}월 ${Number(m[2])}일` : dateStr;
  }

  function renderWeek(week, prefix) {
    const box = el(prefix + 'Week');
    box.innerHTML = '';
    week.days.forEach((d) => {
      const day = document.createElement('div');
      day.className = 'day' + (d.offset === 0 ? ' today' : '') + (d.offset === week.bestOffset ? ' best' : '');
      day.title = d.date + ' · ' + d.title;
      const num = document.createElement('span'); num.className = 'num'; num.textContent = d.score;
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.style.height = Math.max(8, Math.round(d.score * 0.85)) + 'px';
      const wd = document.createElement('span'); wd.className = 'wd'; wd.textContent = d.offset === 0 ? '오늘' : d.weekday;
      day.append(num, bar, wd);
      box.appendChild(day);
    });

    const best = week.days[week.bestOffset];
    const sub = el(prefix + 'WeekBest');
    sub.innerHTML = '';
    if (best.offset === 0) {
      const b = document.createElement('b'); b.textContent = '오늘';
      sub.append(b, '의 참고 지수가 이번 주 가장 높습니다.');
    } else {
      const b = document.createElement('b'); b.textContent = `${shortDate(best.date)} ${best.weekday}요일 ${best.score}점`;
      sub.append(b, '의 참고 지수가 이번 주 가장 높습니다.');
    }
  }

  function render(fortune, week, prefix) {
    const weekday = week && week.days[0] ? `${week.days[0].weekday}요일 · ` : '';
    el(prefix + 'Date').textContent = `${shortDate(fortune.date)} ${weekday}${fortune.gapja}`;
    el(prefix + 'Title').textContent = fortune.title;
    el(prefix + 'Score').textContent = fortune.score;
    el(prefix + 'Meter').style.width = fortune.score + '%';

    const w = fortune.weather || {};
    el(prefix + 'WeatherLabel').innerHTML = (WEATHER_ICON[w.label] || '') + '<em style="font-style:normal">' + (w.label || '') + '</em>';
    el(prefix + 'WeatherNote').textContent = w.note || '';

    const summary = el(prefix + 'Summary');
    summary.innerHTML = ''; summary.append(...li(fortune.summary3 || []));

    if (el(prefix + 'Desc')) el(prefix + 'Desc').textContent = fortune.desc || '';
    const dos = el(prefix + 'Dos'); dos.innerHTML = ''; dos.append(...li(fortune.dos || []));
    const donts = el(prefix + 'Donts'); donts.innerHTML = ''; donts.append(...li(fortune.donts || []));

    // 다음 장 — 오늘 나온 주제(topic)를 먼저 말하고 그 주제의 상품을 잇는다. 읽은 내용과
    // 권하는 상품이 같은 흐름이어야 추천으로 읽힌다.
    const lead = el(prefix + 'TopicLead');
    lead.innerHTML = '';
    if (fortune.topicLabel) {
      const b = document.createElement('b'); b.textContent = fortune.topicLabel;
      lead.append('오늘은 ', b, ' 쪽으로 기운이 기울어 있어요.');
    } else {
      lead.textContent = fortune.upsell.label;
    }
    const up = fortune.upsell;
    el(prefix + 'UpsellName').textContent = up.name + ' 보기';
    el(prefix + 'UpsellPrice').textContent = up.price;
    el(prefix + 'Upsell').href = up.href;

    if (week) renderWeek(week, prefix);
  }

  window.FortuneResult = { render, renderWeek, shortDate };
})();
