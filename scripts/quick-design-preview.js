'use strict';
/* Manual PDF layout fixture; no model call or points charged. */
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('../src/engine');
const { renderQuickHtml } = require('../src/pdf/renderQuickHtml');
const { renderPdf } = require('../src/pdf/renderPdf');

async function main() {
  const engine = computeSaju({ year: 1990, month: 5, day: 15, hour: 10, minute: 30, gender: '남' });
  const person = { name: '홍길동', gender: '남' };
  const paragraphs = [
    '이번 재물운은 **새로운 수입을 무리하게 늘리기보다 지금의 지출 흐름을 정리하는 일**에서 출발해 보세요. 작은 선택을 꾸준히 기록하는 편이 도움이 됩니다.',
    '기본 명식의 기운을 살펴보면, 성급한 결정보다는 이미 손에 익은 방식에서 안정감을 찾는 경향이 드러납니다. 중요한 지출은 하루 정도 여유를 두고 다시 확인해 보세요.',
    '이번 달에는 고정비와 반복 결제를 먼저 점검해 보세요. 여유 자금의 사용 목적을 한 가지로 정하면 선택이 조금 더 명확해질 수 있습니다.'
  ];
  const isStressTest = process.argv.includes('--long');
  if (isStressTest) paragraphs.push(...Array(12).fill('추가 풀이가 이어지는 경우에도 문단과 페이지 가장자리의 여백이 일정해야 합니다. 기운의 흐름을 한 가지 결론으로 단정하지 않고, 실제 선택에 참고할 수 있도록 차분하게 정리합니다.'));
  const text = paragraphs.join('\n\n');
  const outputDir = path.join(__dirname, '..', 'output', 'pdf');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, isStressTest ? 'quick-layout-stress.pdf' : 'quick-design-preview.pdf');
  await renderPdf(renderQuickHtml(engine, person, '재물운', text), outputPath, { name: person.name, label: '재물운' });
  console.log(outputPath);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
