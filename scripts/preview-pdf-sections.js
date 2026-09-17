'use strict';
/* LLM 호출 없이 실제 엔진 값으로 대운·궁합·본문의 짧은 검수본만 출력한다. */
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { computeSaju } = require('../src/engine');
const { analyzeCompatibility } = require('../src/engine/compatibility');
const { computeDaewoonScores } = require('../src/pdf/charts');
const { getReportCss } = require('../src/pdf/reportCss');
const { renderMarkup } = require('../src/pdf/textMarkup');
const { getChapterKeywords } = require('../src/pdf/chapterKeywords');
const { buildOhaengQuest } = require('../src/pdf/ohaengQuest');
const { renderCompatHtml } = require('../src/pdf/renderCompatHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

const root = path.join(__dirname, '..');
const outputDir = path.join(root, 'output', 'pdf');
const engineA = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });

function chapterHtml(chapter) {
  const templatePath = path.join(root, 'src', 'pdf', 'templates', 'partials', 'chapter.ejs');
  const content = ejs.render(fs.readFileSync(templatePath, 'utf8'), {
    chapter, engine: engineA, daewoonRows: computeDaewoonScores(engineA.daewoon, engineA.yongshin.final.main),
    getChapterKeywords, buildOhaengQuest, renderMarkup
  }, { filename: templatePath });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${getReportCss()}</style></head>
    <body class="lifetime-report">${content}<script>window.__chartsReady = true;</script></body></html>`;
}

async function write(name, html, label) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, name);
  await renderPdf(html, outputPath, { name: '홍길동', label });
  console.log(outputPath);
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'daewoon') {
    await write('daewoon-light-preview.pdf', chapterHtml({
      id: 7, title: '대운 흐름 - 10년 단위 인생 그래프',
      text: '대운은 10년 단위로 바뀌는 기운의 흐름을 뜻합니다. 이 명식에서는 용신과의 관계를 기준으로 시기별 수치를 비교합니다.'
    }), '대운 미리보기');
  } else if (mode === 'chapter') {
    await write('chapter-light-preview.pdf', chapterHtml({
      id: 1, title: '총평',
      text: '홍길동 님의 일간과 명식 구조를 함께 읽어보겠습니다. **한 가지 숫자로 삶을 단정하지 않고**, 여러 단서를 모아 설명합니다.\n\n이 장에서는 먼저 일간을 살펴보고, 오행 분포와 격국·용신을 연결합니다. 실제 선택은 언제나 본인의 상황과 판단에 따라 달라질 수 있습니다.'
    }), '본문 미리보기');
  } else if (mode === 'chapter-long') {
    const paragraph = '명식에서 읽히는 특징은 한 가지 수치로 단정할 수 없습니다. 오행의 배치와 일간의 관계를 함께 살피고, 실제 생활의 맥락에 맞춰 해석해야 합니다. 따라서 이 문장은 결과를 예언하기보다 스스로 선택을 검토할 때 참고할 단서를 제공합니다.';
    await write('chapter-layout-stress.pdf', chapterHtml({
      id: 1, title: '총평', text: Array.from({ length: 18 }, (_, index) => `${index + 1}. ${paragraph}`).join('\n\n')
    }), '본문 긴 글 배치 검수');
  } else if (mode === 'compat') {
    const engineB = computeSaju({ year: 1992, month: 9, day: 3, hour: 14, minute: 0, gender: '여' });
    const compat = analyzeCompatibility(engineA, engineB);
    const text = [
      '두 명식의 일지 관계와 서로를 바라보는 십신을 함께 살펴보면, **관계의 단서를 하나로 단정하지 않는 태도**가 중요합니다.',
      '합과 충은 서로 다른 방식으로 작용하는 관계 단서입니다. 점수가 높거나 낮다는 이유만으로 관계의 결과를 예측할 수는 없습니다.',
      '서로의 선택과 현재의 상황을 함께 고려하면서, 어떤 방식으로 소통하면 좋은지 살펴보세요.'
    ].join('\n\n');
    await write('compat-light-preview.pdf',
      renderCompatHtml(engineA, engineB, { name: '홍길동' }, { name: '김영희' }, compat, text),
      '궁합 미리보기');
  } else {
    throw new Error('사용법: node scripts/preview-pdf-sections.js daewoon|chapter|chapter-long|compat');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
