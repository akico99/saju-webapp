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
    const seen = [];
    page.on('request', (req) => { seen.push({ url: req.url(), body: req.postData() || '' }); });
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
    // 결과 전 이메일 단계: 이메일·필수 동의 없이는 못 넘어가고, 건너뛰기가 없다.
    await page.waitForSelector('[data-step="6"]:not([hidden]) input[name="leadEmail"]', { visible: true });
    assert.match(await page.$eval('#wizardCount', (e) => e.textContent), /^07 \/ 08$/);
    assert.equal(await page.$('[data-step="6"] .wizard-skip'), null, '이메일 단계에는 건너뛰기가 없다');
    const stepText = await page.$eval('[data-step="6"]', (e) => e.textContent);
    assert.ok(stepText.includes('[필수] 개인정보 수집·이용: 이메일·이름(별명)·생년월일시·성별·연애 상황을 무료 분석 결과 전달과 메일 링크로 결과 다시 보기에 씁니다. 30일 뒤 삭제합니다. 동의하지 않으면 무료 분석을 볼 수 없어요.'));
    assert.ok(stepText.includes('[선택] 광고성 정보 수신: 1위 달 시작 알림과 전체 풀이 안내를 이메일로 받아요. 언제든 메일 아래 링크로 그만 받을 수 있어요. 동의하면 위 정보를 수신 거부 또는 마지막 알림 뒤 30일까지(최대 13개월) 보관합니다.'));
    assert.ok(stepText.includes('만 14세 이상만 이용할 수 있어요.'));
    assert.equal(await page.$eval('input[name="agreeMarketing"]', (e) => e.checked), false, '광고성 정보 수신은 기본으로 체크되어 있지 않다');
    await page.click('[data-step="6"] [data-next]');
    assert.match(await page.$eval('#stageError', (e) => e.textContent), /이메일/);
    await page.type('input[name="leadEmail"]', 'not-an-email');
    await page.click('[data-step="6"] [data-next]');
    assert.match(await page.$eval('#stageError', (e) => e.textContent), /이메일을 정확히/);
    await page.$eval('input[name="leadEmail"]', (e) => { e.value = ''; });
    await page.type('input[name="leadEmail"]', 'fictional');
    await page.click('[data-lead-domain="naver.com"]');
    assert.equal(await page.$eval('input[name="leadEmail"]', (e) => e.value), 'fictional@naver.com');
    await page.click('[data-step="6"] [data-next]');
    assert.match(await page.$eval('#stageError', (e) => e.textContent), /개인정보 수집·이용에 동의/);
    assert.equal(await page.$eval('[data-step="6"]', (e) => e.hidden), false, '동의 없이는 다음 단계로 가지 않는다');
    await page.click('input[name="agreeLeadPrivacy"]');
    await page.screenshot({ path: path.join(os.tmpdir(), 'love-email-step.png'), fullPage: false });
    await page.click('[data-step="6"] [data-next]');
    await page.waitForSelector('[data-step="7"]:not([hidden]) #previewBtn', { visible: true });
    assert.ok(await page.evaluate(() => sessionStorage.getItem('so_email_love_timing')), 'EmailSubmit은 이메일 단계를 통과할 때 한 번 기록된다');
    assert.ok((await page.$eval('#wizardReview', (e) => e.textContent)).includes('fictional@naver.com'));
    await page.click('#previewBtn');
    await page.waitForFunction(() => !document.getElementById('freeResult').classList.contains('hidden'));
    assert.match(await page.$eval('#freeTitle', (e) => e.textContent), /테스트/);
    await page.waitForSelector('#freeReader .lr-reader', { visible: true });
    assert.equal(await page.$eval('#legacyFreeReading', e => getComputedStyle(e).display), 'none');
    assert.ok(await page.$$eval('#freeReader .lr-chapter', es => es.length) >= 4);
    // 쉬운 말: 사주 원본 보기(접힘) 밖의 본문에는 명리 용어가 없고, 원본은 접힌 상자 안에만 있다.
    const plainCheck = await page.$eval('#freeReader', (e) => {
      const c = e.cloneNode(true);
      const orig = c.querySelector('details.lr-saju-original');
      const origText = orig ? orig.textContent : '';
      if (orig) orig.remove();
      return { body: c.textContent, origText, origOpen: document.querySelector('#freeReader details.lr-saju-original').open, origLast: !!e.querySelector('.lr-reader > details.lr-saju-original:last-child') };
    });
    assert.doesNotMatch(plainCheck.body, /일간|일주|월주|연주|시주|비견|겁재|식신|상관|정재|편재|정관|편관|정인|편인|장성|역마|도화|화개|반안|망신|육해|지살|천을귀인|지장간|12운성|용신|대운|신살|오행|명식|[甲乙丙丁戊己庚辛壬癸]/);
    assert.equal(plainCheck.origOpen, false);
    assert.ok(plainCheck.origLast && /일주/.test(plainCheck.origText) && /오행 균형/.test(plainCheck.origText));
    // 계절 흐름은 탭 없이 막대 네 개, 잠금 카드는 자기 항목을 가진다(앞 카드와 같은 세 줄이 아니다).
    assert.equal(await page.$$eval('#freeReader .lr-sbar', (n) => n.length), 4);
    assert.equal(await page.$$eval('#freeReader .lr-seasons .lr-tab', (n) => n.length), 0);
    const locks = await page.$$eval('#freeReader .lr-teaser', (n) => n.map((e) => ({ kind: e.dataset.lockKind, title: e.querySelector('.lr-teaser-title').textContent, rows: [...e.querySelectorAll('.lr-hidden-row span')].map((s) => s.textContent) })));
    const byKind = Object.fromEntries(locks.map((x) => [x.kind, x]));
    assert.deepEqual(byKind.person.rows, ['나에게 끌리는 사람', '내가 끌리는 사람', '만남이 생기기 쉬운 자리']);
    assert.deepEqual(byKind.action.rows, ['반복되는 연애 패턴', '조심할 사람의 신호', '지금 상황에 맞는 행동']);
    assert.equal(byKind.situation.title, '솔로인 지금 할 일');
    assert.equal(byKind.situation.rows.length, 3);
    assert.notDeepEqual(byKind.action.rows, byKind.person.rows);
    // 실물 화면 줄: 세 장, 대체 글, 표기. 카드 아래(질문 3개 뒤)에 있다.
    const strip = await page.$eval('#freeReader .love-preview-strip', (e) => ({ n: e.querySelectorAll('figure img').length, alts: [...e.querySelectorAll('img')].every((i) => i.alt.length > 8), note: e.querySelector('.love-preview-note').textContent, afterHook: e.previousElementSibling && e.previousElementSibling.classList.contains('love-hook') }));
    assert.equal(strip.n, 3);
    assert.ok(strip.alts && strip.afterHook);
    assert.equal(strip.note, '전체 풀이 예시 화면 · 가상 인물');
    // 무료 결과 전체 길이(390px)
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight) <= 7500, '무료 결과는 7,500px 이하');
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
    await page.click('[data-step="6"] [data-next]');
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
    assert.equal(await page.$eval('#deliveryEmail', (e) => e.value), 'fictional@naver.com', '결제 창 이메일 칸은 결과 받을 이메일로 미리 채워진다');
    assert.match(await page.$eval('#deliveryEcho',e=>e.textContent),/fictional@naver\.com/);
    // 이메일은 무료 분석 요청 본문에만 있고, URL·다른 요청에는 없다. 구버전 필드 없이도 결과는 이미 그려졌다.
    const previewReq = seen.find((r) => r.url === base + '/api/love/preview');
    const sent = JSON.parse(previewReq.body);
    assert.equal(sent.leadFlow, 2);
    assert.equal(sent.leadEmail, 'fictional@naver.com');
    assert.equal(sent.agreeLeadPrivacy, true);
    assert.equal(sent.agreeMarketing, false);
    assert.equal(sent.deliveryEmail, undefined);
    for (const r of seen) {
      assert.ok(!/fictional/.test(r.url), '이메일이 URL에 있다: ' + r.url);
      if (r.url !== base + '/api/love/preview' && r.url !== base + '/api/pay/start') assert.ok(!/fictional/.test(r.body), '이메일이 다른 요청에 실렸다: ' + r.url);
    }
    assert.ok(!/fictional/.test(page.url()));
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
