'use strict';
/* 상품별 화면 CSS를 만든다. 연애 상품 CSS가 바뀌면 다시 실행한다(test/product-theme.test.js가 최신인지 확인).
   사용: node scripts/build-product-themes.js */
const fs = require('fs');
const path = require('path');
const { themeCss } = require('../src/productTheme');
const PUB = path.join(__dirname, '..', 'public');
// 상품 페이지가 쓰는 연애 계열 CSS와 상품 전용 CSS. 결과는 public/<상품>-assets/css/<같은 이름>.css
const SHARED = ['love.css', 'love-assets/product.css', 'love-assets/reading.css', 'love-assets/reading-integration.css', 'love-assets/love-redesign.css', 'saju-chart.css'];
const PRODUCTS = {
  'new-year': { theme: 'newyear', own: 'new-year-reading.css' },
  reunion: { theme: 'reunion', own: 'reunion-product.css' },
  couple: { theme: 'couple', own: 'couple-app.css' }
};
function outputs() {
  const out = [];
  for (const [slug, p] of Object.entries(PRODUCTS)) {
    for (const src of [...SHARED, p.own]) {
      if (!fs.existsSync(path.join(PUB, src))) continue;
      const css = '/* 자동 생성: scripts/build-product-themes.js — ' + src + ' (' + p.theme + ' 색). 직접 고치지 마세요. */\n' + themeCss(fs.readFileSync(path.join(PUB, src), 'utf8'), p.theme);
      out.push({ file: path.join(PUB, slug + '-assets', 'css', path.basename(src)), href: '/' + slug + '-assets/css/' + path.basename(src), from: '/' + src, slug, css });
    }
  }
  return out;
}
if (require.main === module) {
  for (const o of outputs()) { fs.mkdirSync(path.dirname(o.file), { recursive: true }); fs.writeFileSync(o.file, o.css); console.log(o.href); }
}
module.exports = { outputs, PRODUCTS };

