'use strict';
// 궁합 전용 모바일 검수. SHOT_WIDTH·SHOT_HEIGHT·SHOT_PORT로 조절한다.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
async function main() {
  const out = path.join(__dirname,'..','output/webtoon-render/compat');
  fs.mkdirSync(out,{recursive:true});
  const width = Number(process.env.SHOT_WIDTH || 390), height = Number(process.env.SHOT_HEIGHT || 844);
  const origin = 'http://127.0.0.1:'+(process.env.SHOT_PORT || '4710');
  const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setViewport({width,height,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.setRequestInterception(true);
    page.on('request',req => {
      const url=req.url();
      const allowed=url.startsWith(origin)||url.includes('fonts.googleapis.com')||url.includes('fonts.gstatic.com')||url.includes('cdn.jsdelivr.net');
      (allowed?req.continue():req.abort()).catch(()=>{});
    });
    await page.goto(origin+'/webtoon/compat.html',{waitUntil:'domcontentloaded',timeout:60000});
    for(let y=0;y<await page.evaluate(()=>document.body.scrollHeight);y+=600) {
      await page.mouse.wheel({deltaY:600});
      await new Promise(r=>setTimeout(r,100));
    }
    await page.waitForFunction(()=>Array.from(document.images).filter(i=>!i.closest('details:not([open])')).every(i=>i.complete&&i.naturalWidth>0),{timeout:60000});
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>Promise.all([
      document.fonts.load('400 24px "Black Han Sans"','사주는'),
      document.fonts.load('400 24px "Nanum Pen Script"','사주는'),
      document.fonts.load('900 24px "Noto Serif KR"','사주'),
    ]));
    const report=await page.evaluate(()=>({
      width:innerWidth,height:document.body.scrollHeight,
      summaryTop:document.querySelector('.compat-summary p').getBoundingClientRect().top+scrollY,
      overflow:document.documentElement.scrollWidth>innerWidth,
      textOverflow:Array.from(document.querySelectorAll('h1,h2,h3,h4,p,blockquote,summary,td,th,.cta')).filter(el=>el.clientWidth&&el.scrollWidth>el.clientWidth+2).map(el=>el.className||el.tagName),
      fonts:['400 24px "Black Han Sans"','400 24px "Nanum Pen Script"','900 24px "Noto Serif KR"'].map(f=>document.fonts.check(f,'사주는')),
      images:Array.from(document.images).filter(i=>!i.closest('details:not([open])')).every(i=>i.complete&&i.naturalWidth>0),
      ctaWidth:document.querySelector('.cta').getBoundingClientRect().width,
      thoughtOverFace:document.querySelector('.compat-thoughts').getBoundingClientRect().bottom>document.querySelector('.art-confused').getBoundingClientRect().top+2,
      highlightContrast:(()=>{
        const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);
        const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
        const a=luminance(rgb(getComputedStyle(document.querySelector('.proof-excerpt blockquote')).color));
        const b=luminance(rgb(getComputedStyle(document.querySelector('.proof-excerpt')).backgroundColor));
        return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      })(),
    }));
    assert.equal(report.overflow,false,'가로 넘침');
    assert.deepEqual(report.textOverflow,[],'글자 요소의 내부 잘림');
    assert.ok(report.summaryTop<=1688,'첫 요약 본문이 1,688px 이후: '+report.summaryTop);
    assert.ok(report.fonts.every(Boolean),'세 웹폰트 로드');
    assert.equal(report.images,true,'이미지 로드');
    assert.ok(report.ctaWidth<=width,'고정 버튼 너비');
    assert.equal(report.thoughtOverFace,false,'생각 풍선 얼굴 겹침');
    assert.ok(report.highlightContrast>=4.5,'생활 언어 증거의 글자 대비 부족: '+report.highlightContrast);
    assert.equal(await page.$eval('.hl',el=>getComputedStyle(el).backgroundSize),'100% 100%','모션 줄이기');
    for(const detail of await page.$$('.sample-original')) {
      // 원본은 lazy 이미지다. 실제 사용자가 펼치는 화면으로 이동해 로드를 검증한다.
      await detail.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
      await detail.$eval('summary',el=>el.click());
      await page.waitForFunction(()=>Array.from(document.querySelectorAll('details[open] img')).every(i=>i.complete&&i.naturalWidth>0));
      await detail.$eval('summary',el=>el.click());
    }
    await page.evaluate(()=>scrollTo({top:document.querySelector('.proof-excerpt').getBoundingClientRect().top+scrollY-120,behavior:'instant'}));
    const proofFrame=await page.evaluate(()=>({excerptBottom:document.querySelector('.proof-excerpt').getBoundingClientRect().bottom,ctaTop:document.querySelector('.cta').getBoundingClientRect().top}));
    assert.ok(proofFrame.excerptBottom<proofFrame.ctaTop-16,'형광펜 증거 버튼 겹침');
    await page.screenshot({path:path.join(out,'proof-'+width+'.png')});
    await page.evaluate(()=>scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
    const close=await page.evaluate(()=>({bottom:document.querySelector('.close-line').getBoundingClientRect().bottom,ctaTop:document.querySelector('.cta').getBoundingClientRect().top}));
    assert.ok(close.bottom<close.ctaTop-16,'마지막 문장 버튼 겹침');
    await page.screenshot({path:path.join(out,'close-'+width+'.png')});
    await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(out,'viewport-'+width+'.png')});
    await page.addStyleTag({content:'.cta-bar{display:none!important}'});
    await page.screenshot({path:path.join(out,'full-'+width+'.png'),fullPage:true});
    await page.setJavaScriptEnabled(false);
    await page.reload({waitUntil:'load',timeout:60000});
    assert.equal(await page.$eval('.hl',el=>getComputedStyle(el).backgroundSize),'100% 100%','JS 비활성');
    assert.ok(await page.$eval('.compat-summary',el=>el.innerText.includes('역할 차이가 있습니다.')));
    await page.addStyleTag({content:'.headline .big,.thought,.brand-name,.perk-title,.close-line{font-family:Arial,"Malgun Gothic",sans-serif!important}'});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'대체 글꼴 가로 넘침');
    const samples=[];
    for(const name of ['연애','부부','시작전','재회']) {
      await page.goto(origin+'/samples/compat/'+name+'.html',{waitUntil:'load'});
      await page.evaluate(()=>Promise.all(['400 16px "ReportGothic"','700 16px "ReportGothic"','400 16px "ReportMyeongjo"','700 16px "ReportMyeongjo"'].map(f=>document.fonts.load(f,'홍길동 김영희 木火土金水'))));
      samples.push(await page.evaluate(name=>({name,overflow:document.documentElement.scrollWidth>innerWidth,text:document.body.innerText.includes('샘플 · 가상 인물'),fonts:Array.from(document.fonts).every(f=>f.status==='loaded')}),name));
    }
    samples.forEach(s=>{assert.equal(s.overflow,false,s.name+': 공개 샘플 가로 넘침');assert.equal(s.text,true);assert.equal(s.fonts,true,s.name+': 압축된 원문 글꼴 로드');});
    const result={...report,proofFrame,close,details:4,jsDisabled:true,fallbackFonts:true,samples};
    fs.writeFileSync(path.join(out,'metrics-'+width+'.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result));
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exit(1);});
