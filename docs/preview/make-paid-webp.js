'use strict';
// 개발용: paid-shots-source/paid-N.png(390x844 @2x)에 휴대폰 테두리를 씌워 public/love-assets/preview/paid-N.webp(폭 720)로 만든다.
const puppeteer = require('puppeteer');
const fs = require('node:fs'), path = require('node:path');
const src = path.join(__dirname, 'paid-shots-source');
const out = path.join(__dirname, '../../public/love-assets/preview');
const Q = Number(process.argv[2]) || 82;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  for (const n of [1, 2, 3]) {
    const png = fs.readFileSync(path.join(src, 'paid-' + n + '.png')).toString('base64');
    const page = await browser.newPage();
    await page.setViewport({ width: 720, height: 1600, deviceScaleFactor: 1 });
    await page.setContent('<body style="margin:0;background:transparent"><div id="f" style="width:720px;box-sizing:border-box;padding:14px;background:#0b0508;border:3px solid #5a3a46;border-radius:64px;overflow:hidden"><img style="display:block;width:100%;border-radius:50px" src="data:image/png;base64,' + png + '"></div></body>');
    await page.evaluate(() => document.images[0].decode());
    const box = await (await page.$('#f')).boundingBox();
    const file = path.join(out, 'paid-' + n + '.webp');
    await page.screenshot({ path: file, type: 'webp', quality: Q, omitBackground: true, clip: { x: 0, y: 0, width: 720, height: Math.ceil(box.height) } });
    console.log('paid-' + n + '.webp 720x' + Math.ceil(box.height) + ' ' + fs.statSync(file).size + ' bytes');
    await page.close();
  }
  await browser.close();
})();

