'use strict';
/* 궁합 PDF·PNG 샘플 — AI 호출 없이 고정 본문으로 연애(dating)·재회(ex) 두 가지를 렌더한다.
   "### 지금 할 것/피할 것" 카드와 "두 사람의 앞으로 3년(6개월)" 패널 레이아웃을 눈으로 확인하는 용도다.
   사용: node test/manual-compat-sample.js [폴더이름]   (결과: output/visual-samples/<폴더이름>/, 기본 afterB) */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { computeSaju } = require('../src/engine');
const { analyzeCompatibility } = require('../src/engine/compatibility');
const { getCompatOutline } = require('../src/llm/compatOutlines');
const { buildCompatTiming } = require('../src/llm/compatTiming');
const { renderCompatHtml } = require('../src/pdf/renderCompatHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

const outDir = path.join(__dirname, '..', 'output', 'visual-samples', process.argv[2] || 'afterB');
fs.mkdirSync(outDir, { recursive: true });

const personA = { name: '김하늘' }, personB = { name: '이준호' };
const engineA = computeSaju({ year: 1994, month: 5, day: 17, hour: 9, minute: 30, gender: '여' });
const engineB = computeSaju({ year: 1992, month: 11, day: 3, hour: 14, minute: 0, gender: '남' });
const compat = analyzeCompatibility(engineA, engineB);

const PARA = [
  '하늘님에게 준호님은 겉으로는 차분해 보이지만 마음먹은 일은 끝까지 밀고 가는 사람으로 다가옵니다. 준호님이 보기에 하늘님은 말수는 적어도 분위기를 먼저 읽는 사람이라, 두 사람 사이에는 말하지 않아도 통하는 순간이 자주 생깁니다.',
  '다만 이 편안함이 오래 이어지면 서로가 알아서 해 주리라는 기대로 바뀌기 쉽습니다. 그때 **작은 서운함이 쌓이는 쪽은 먼저 참는 쪽**이고, 두 사람 중 누가 그쪽인지는 일상의 장면에서 드러납니다.'
];
const DOS = [
  '연지-월지에 충이 걸려 있으니 약속 시간과 연락 빈도를 **미리 합의**해 두세요',
  '하늘님은 용신 기운이 필요한 사람이라 준호님이 먼저 산책이나 가벼운 운동 약속을 잡아 보세요',
  '준호님이 하늘님을 편관으로 느끼는 만큼, 결정을 통보하기 전에 한 번 물어보세요',
  '평균 점수가 가장 높은 해에 함께 해 볼 큰 계획을 지금부터 이야기해 두세요',
  '서운한 일은 그날 안에 **한 문장으로** 먼저 꺼내 보세요'
];
const DONTS = [
  '점수가 낮게 나온 해를 이유로 중요한 대화를 미루지 마세요',
  '일지 관계가 충이라고 해서 서로의 성격 탓으로 돌리지 마세요',
  '상대의 침묵을 곧바로 거절로 읽지 마세요',
  '한쪽이 계속 양보하는 구조를 당연하게 두지 마세요',
  '문제가 생긴 날 밤에 결론까지 내리려 하지 마세요'
];

function bodyFor(relation) {
  const sections = getCompatOutline(relation).map((o) => '### ' + o.heading + '\n' + PARA.join('\n\n'));
  return sections.join('\n\n') + '\n\n### 지금 할 것\n' + DOS.map((d) => '- ' + d).join('\n') + '\n\n### 피할 것\n' + DONTS.map((d) => '- ' + d).join('\n') + '\n';
}

async function pngOf(html, file) {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.emulateMediaType('print');
    await page.screenshot({ path: file, fullPage: true });
  } finally { await browser.close(); }
}

(async () => {
  for (const relation of ['dating', 'ex']) {
    const timing = buildCompatTiming(engineA, engineB, relation);
    const html = renderCompatHtml(engineA, engineB, personA, personB, compat, bodyFor(relation), relation, timing);
    const name = 'compat-' + relation;
    const t0 = Date.now();
    await renderPdf(html, path.join(outDir, name + '.pdf'), { name: personA.name + ' · ' + personB.name, label: '궁합 리포트' });
    const ms = Date.now() - t0;
    await pngOf(html, path.join(outDir, name + '.png'));
    console.log(name, 'pdf', ms + 'ms', Math.round(fs.statSync(path.join(outDir, name + '.pdf')).size / 1024) + 'KB');
  }
})().catch((e) => { console.error(e); process.exit(1); });

