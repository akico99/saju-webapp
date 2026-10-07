'use strict';
/* 심층 리딩 공유 카드 샘플 렌더러 — AI 호출 없이 고정 본문으로 카드 PNG를 만든다.
   사용: node test/manual-deep-card.js [폴더이름] [주제,주제]   (결과: output/visual-samples/<폴더이름>/deep-card-<주제>.png) */
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../src/engine');
const { buildTimingData, DEEP_TOPICS } = require('../src/llm/deepReading');
const { renderDeepCard } = require('../src/pdf/renderDeepCard');

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-readings.json'), 'utf8'));
const outDir = path.join(__dirname, '..', 'output', 'visual-samples', process.argv[2] || 'afterE');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const engine = computeSaju(fx.birth);
  const now = new Date('2026-09-30T12:00:00+09:00');
  const topics = (process.argv[3] || 'wealth,love').split(',');
  for (const topic of topics) {
    const base = fx.deep.wealth;
    const data = buildTimingData(engine, now, { topicKey: topic, gender: fx.person.gender || fx.birth.gender });
    const reading = { topicKey: topic, title: DEEP_TOPICS[topic].label, chapters: base.chapters.map((c) => ({ ...c, title: DEEP_TOPICS[topic].label })), timing: { ...base.timing, data } };
    const out = path.join(outDir, 'deep-card-' + topic + '.png');
    const t0 = Date.now();
    await renderDeepCard(fx.person, reading, out);
    console.log(topic, Date.now() - t0 + 'ms', Math.round(fs.statSync(out).size / 1024) + 'KB', out);
  }
})().catch((e) => { console.error(e); process.exit(1); });

