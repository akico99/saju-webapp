'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

// 앱은 세션 정리 타이머를 가지므로 별도 프로세스로 띄우고 테스트가 끝나면 종료한다.
function startServer() {
  const child = spawn(process.execPath, ['-e', "const app = require('./src/server/app'); const s = app.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, LOVE_TIMING_ENABLED: 'true', SAJU_DB_PATH: ':memory:' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let out = '';
    child.on('exit', (code) => reject(new Error('server exited ' + code)));
    child.stdout.on('data', (d) => {
      out += d;
      const m = /PORT (\d+)/.exec(out);
      if (m) resolve({ child, port: Number(m[1]) });
    });
  });
}

test('모바일 상품 소개에서 실제 무료 해석, 재입력, 가입 없는 결제 페이지까지 연결된다', { timeout: 60000 }, async () => {
  const { child, port } = await startServer();
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const base = 'http://127.0.0.1:' + port;
    const errors = [];
    let purchases = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', (req) => { if(req.url() === base + '/api/pay/start') purchases++; return req.url().startsWith(base) ? req.continue() : req.abort(); });
    // 상품 목록 시안은 메인(/)으로 옮겨 갔다. 메인의 넘침을 보고, 상황별 진입 주소로 바로 들어간다.
    await page.goto(base + '/', { waitUntil: 'networkidle0' });
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'home overflow at ' + width);
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-home-mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-home-first-screen.png'), fullPage: false });
    await page.goto(base + '/love.html?concern=some', { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('[name=situation]', e => e.value), 'some');
    // 첫 화면에서는 히어로 버튼만 보이고 고정 바는 숨겨진다(클릭·포커스도 받지 않는다). 아래로 스크롤하면 고정 바가 나온다.
    await page.waitForFunction(() => document.querySelector('.landing-dock').hidden === true);
    assert.equal(await page.$eval('.landing-dock', e => getComputedStyle(e).display), 'none');
    assert.equal(await page.$eval('#startLove', e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), true);
    await page.evaluate(() => window.scrollTo(0, document.getElementById('startLove').getBoundingClientRect().bottom + scrollY + 80));
    await page.waitForFunction(() => document.querySelector('.landing-dock').hidden === false);
    assert.notEqual(await page.$eval('.landing-dock', e => getComputedStyle(e).display), 'none');
    await page.click('#startLoveDock');
    assert.equal(await page.$eval('.landing-dock', e => getComputedStyle(e).display), 'none');
    await page.click('#closeInput');
    await page.goto(base + '/love.html', { waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#stage', (e) => getComputedStyle(e).display), 'none');
    await page.waitForFunction(() => !document.querySelector('#characterPortrait').hidden);
    assert.ok(await page.$eval('#characterPortrait', (e) => e.naturalWidth > 0));
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-brand-mobile.png'), fullPage: true });
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'overflow at ' + width);
    }
    await page.setViewport({ width: 390, height: 844 });
    await page.click('#startLove');
    await page.click('[data-gender="여"]');
    await page.type('[name="year"]', '1995');
    await page.type('[name="month"]', '5');
    await page.type('[name="day"]', '15');
    await page.click('[data-step="1"] [data-next]');
    await page.click('[name="hourUnknown"]');
    await page.click('[data-step="2"] [data-next]');
    await page.click('[data-situation="single"]');
    assert.ok(await page.$('[data-focus="timing"]'));
    await page.click('[data-focus="timing"]');
    await page.type('[name="name"]', '테스트');
    await page.click('[data-step="5"] [data-next]');
    await page.click('#previewBtn');
    await page.waitForFunction(() => !document.getElementById('freeResult').classList.contains('hidden'));
    assert.match(await page.$eval('#freeTitle', (e) => e.textContent), /테스트/);
    await page.waitForSelector('#freeReader .lr-reader', { visible: true });
    assert.equal(await page.$eval('#legacyFreeReading', e => getComputedStyle(e).display), 'none');
    assert.ok(await page.$$eval('#freeReader .lr-chapter', es => es.length) >= 5);
    // 결과 첫 화면: 제목 바로 아래 세 달 카드(1·2위 잠금, 3위 공개)와 결제 버튼이 두 화면 안에 있다.
    const hook = await page.$eval('#freeReader .love-hook', (e) => ({
      ranks: [...e.querySelectorAll('.love-hook-rank')].map((n) => n.textContent),
      locked: e.querySelectorAll('li.is-locked').length,
      ctaTop: e.querySelector('.love-hook-cta').getBoundingClientRect().top + scrollY,
      afterLead: e.previousElementSibling && e.previousElementSibling.classList.contains('lr-lead')
    }));
    assert.deepEqual(hook.ranks, ['1위', '2위', '3위']);
    assert.equal(hook.locked, 2);
    assert.ok(hook.afterLead);
    assert.ok(hook.ctaTop < 844 * 2, '세 달 카드의 결제 버튼은 두 화면 안에 있다: ' + hook.ctaTop);
    // 판매 첫 화면: 첫 문장과 1위 행이 같은 구간을 알려 주고, 이어 읽을 내용은 질문으로 답한다.
    const sales = await page.$eval('#freeReader', (e) => ({
      lead: e.querySelector('.lr-lead').textContent,
      first: e.querySelector('.love-hook-months li').textContent,
      h4: e.querySelector('.love-hook-offer h4').textContent,
      asks: [...e.querySelectorAll('.love-hook-includes li b')].map((n) => n.textContent)
    }));
    const band = /앞으로 (3개월 안|6개월 안|7~12개월 사이)/.exec(sales.lead);
    assert.ok(band, '첫 문장에 구간이 있다: ' + sales.lead);
    assert.match(sales.lead, /^테스트님의 인연 신호가 가장 (강한|나은) 달은 .+에 있어요\. 정확한 달과 그달에 할 일은 전체 풀이에서 알려 드려요\.$/);
    assert.ok(sales.first.includes(band[0] + ' · 정확한 달은 전체 풀이'), '1위 행 힌트: ' + sales.first);
    assert.equal(sales.h4, '전체 풀이에서 답해 드려요');
    assert.deepEqual(sales.asks, ['1위 달은 정확히 몇 월이고, 그달엔 뭘 해야 할까?', '처음 끌리는 사람과 오래 갈 사람, 같은 사람일까?', '테스트님이 사람을 만나기 쉬운 자리는 어디일까?']);
    assert.equal(await page.$('#freeReader [data-chapter-id="seasons"] .lr-teaser[data-lock-kind="timing"]'), null);
    assert.ok(await page.$$eval('#freeReader .lr-art', (es) => es.length) <= 3);
    assert.match(await page.$eval('#stickyUnlock', (e) => e.textContent), /14,900원/);
    // 결과 샘플을 열어 읽고 닫아도 구매 동작과 무료로 공개한 달이 유지된다.
    const sample = '#freeReader .love-hook-sample';
    assert.equal(await page.$eval(sample, e => e.tagName), 'DETAILS');
    assert.equal(await page.$eval(sample, e => e.open), false);
    await page.click(sample + ' summary');
    assert.equal(await page.$eval(sample, e => e.open), true);
    assert.ok(await page.$eval(sample, e => e.textContent.includes('개인 결과 아님')));
    assert.equal(await page.$$eval(sample + ' blockquote', es => es.length), 2);
    await page.click(sample + ' summary');
    assert.equal(await page.$eval(sample, e => e.open), false);
    assert.equal(await page.$$eval('#freeReader .love-hook-months .is-open', es => es.length), 1);
    await page.click('#freeReader .love-hook-cta');
    assert.equal(await page.$eval('#checkoutSheet', (e) => e.open), true);
    await page.click('#closeCheckout');
    await page.waitForFunction(() => !document.querySelector('#checkoutSheet').open);
    for (const width of [320, 390, 1280]) {
      await page.setViewport({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'free result overflow at ' + width);
    }
    await page.setViewport({ width: 390, height: 844 });
    assert.equal(await page.$eval('#loveLanding', (e) => getComputedStyle(e).display), 'none');
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-brand-result.png'), fullPage: true });
    await page.click('#redoBtn');
    assert.equal(await page.$eval('#stage', (e) => getComputedStyle(e).display), 'flex');
    await page.click('#closeInput');
    await page.click('#startLoveBottom');
    await page.click('[data-gender="여"]');
    await page.click('[data-step="1"] [data-next]');
    await page.click('[data-step="2"] [data-next]');
    await page.click('[data-situation="single"]');
    await page.click('[data-focus="timing"]');
    await page.click('[data-step="5"] [data-next]');
    await page.click('#previewBtn');
    await page.waitForFunction(() => !document.getElementById('freeResult').classList.contains('hidden'), { timeout: 8000 }).catch(async (e) => {
      const state = await page.evaluate(() => ({ steps: [...document.querySelectorAll('.stage-step')].map((s) => s.hidden), err: document.getElementById('stageError').textContent, errHidden: document.getElementById('stageError').hidden, stage: document.getElementById('stage').className, free: document.getElementById('freeResult').className, body: document.body.className }));
      throw new Error(e.message + ' ' + JSON.stringify(state));
    });
    await page.click('#unlockBtn');
    assert.equal(await page.$eval('#checkoutSheet',e=>e.open),true);
    assert.equal(await page.$eval('.checkout-header',e=>getComputedStyle(e).backgroundColor),'rgb(33, 27, 30)');
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#checkoutSheet').open);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'unlockBtn');
    await page.click('.lr-teaser-lock');
    assert.equal(await page.$eval('#checkoutSheet',e=>e.open),true);
    await page.click('#closeCheckout');
    await page.click('#stickyUnlock');
    assert.equal(await page.$eval('#checkoutSheet',e=>e.open),true);
    for (const width of [320,390]) {
      await page.setViewport({width,height:844});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    await page.screenshot({path:path.join(__dirname,'../docs/preview/checkout-mobile.png'),fullPage:false});
    assert.equal(purchases,0,'구매 확인 전에는 유료 API를 호출하면 안 됨');
    await page.click('#checkoutConfirm');
    assert.equal(purchases,0,'이메일과 동의 없이는 구매하지 않는다');
    await page.type('#deliveryEmail','fictional@example.test');
    assert.match(await page.$eval('#deliveryEcho',e=>e.textContent),/fictional@example\.test/);
    await page.click('#consentItems summary');
    await page.click('#deliveryConsent');
    await page.click('#checkoutConfirm');
    assert.equal(purchases,0,'필수 동의를 모두 하기 전에는 구매하지 않는다');
    assert.match(await page.$eval('#deliveryError',e=>e.textContent),/동의/);
    await page.click('#agreeAll');
    assert.equal(await page.$$eval('#checkoutSheet [data-agree]',es=>es.every(e=>e.checked)),true);
    assert.equal(await page.$eval('#deliveryError',e=>e.hidden),true,'모두 동의하면 오류 문구가 사라진다');
    await page.click('#consentItems summary');
    await page.screenshot({path:path.join(os.tmpdir(),'love-guest-checkout.png'),fullPage:false});
    await Promise.all([page.waitForNavigation(), page.click('#checkoutConfirm')]);
    assert.equal(purchases,1);
    assert.match(page.url(), /\/pay\.html\?orderId=/, '로그인 없이 결제 페이지로 바로 간다');
    // 테스트는 외부(토스) 스크립트를 막으므로 결제수단 위젯은 뜨지 않는다. 주문 금액과 동의 상태만 본다.
    await page.waitForFunction(()=>/동의했어요/.test(document.getElementById('payConsent').textContent));
    assert.equal(await page.$eval('#orderAmount',e=>e.textContent),'14,900원');
    assert.equal(await page.$$eval('#payConsent input[type=checkbox]',es=>es.length),0,'결제 페이지에서 동의를 다시 묻지 않는다');
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    child.removeAllListeners('exit');
    child.kill();
  }
});
