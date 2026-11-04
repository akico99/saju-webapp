'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dir = path.join(__dirname, '../public');
const read = p => fs.readFileSync(path.join(dir, p), 'utf8');

test('무료 그래프 소개는 결과 보기로 연결되고 샘플 단위를 구분한다', () => {
  assert.ok(fs.existsSync(path.join(dir,'webtoon/life-graph.html')), '무료 인생 그래프 소개 파일이 필요하다');
  const html = read('webtoon/life-graph.html');
  assert.deepEqual([...html.matchAll(/<section class="s-(problem|turn|service|close)" aria-labelledby=/g)].map(m=>m[1]), ['problem','turn','service','close']);
  assert.equal((html.match(/href="\/life-graph.html\?from=life-graph-webtoon"/g)||[]).length,2);
  assert.match(html,/무료 인생 그래프 결과 보기/);
  assert.match(html,/1년 흐름/);
  assert.match(html,/원본에서 1년 흐름 선택/);
  assert.match(html,/가상 인물/);
  assert.match(html,/원문 발췌·모바일 재배치/);
  assert.doesNotMatch(html,/990원|3초|AI가 분석|맞춤 풀이|18,900원/);
  assert.equal((html.match(/src="\/track.js"/g)||[]).length,1);
  assert.equal((html.match(/googletagmanager.com\/gtag\/js/g)||[]).length,1);
  assert.doesNotMatch(html,/fbq\(|kakaoPixel\(/);
});

test('그래프 소개의 발췌와 점수는 공개 샘플 응답 및 원문에 일치한다', () => {
  const html = read('webtoon/life-graph.html');
  const sample = JSON.parse(read('samples/life-graph/data.json'));
  const p = sample.운영응답.yearPoints.find(p=>p.year===2026);
  assert.equal(p.score,78);
  assert.equal(p.score-sample.운영응답.yearPoints.find(p=>p.year===2025).score,31);
  assert.match(html,/78 <span>\/ 100<\/span>/);
  assert.match(html,/▲31/);
  const source = read('life-graph.html').replace(/\\n/g,' ');
  for (const [,text] of html.matchAll(/data-source="[^"]+">([^<]+)<\/(?:p|blockquote)>/g)) {
    assert.ok(source.includes(text),'실제 서비스에 없는 문장: '+text);
  }
  assert.match(html,/흐름이 풀리기 시작하는 시기예요/);
  assert.match(html,/꾸준히 이어갈 습관과 관계를 다져두기/);
  assert.ok(fs.existsSync(path.join(dir,'samples/life-graph/index.html')));
});

test('그래프 소개 그림은 선언 크기와 용량을 지키며 발견 경로가 있다', async () => {
  const html = read('webtoon/life-graph.html');
  const images=[...html.matchAll(/<img src="(\/webtoon\/life-graph\/[^"]+)" width="(\d+)" height="(\d+)" alt="([^"]{8,})"/g)];
  assert.equal(images.length,7,'그림 4장과 실제 증거 캡처 3개');
  let total=0;
  for(const [,src,w,h] of images) {
    const f=path.join(dir,src.slice(1)),m=await sharp(f).metadata();
    assert.equal(m.width,+w);assert.equal(m.height,+h);assert.equal(m.format,'webp');
    const bytes=fs.statSync(f).size;assert.ok(bytes<300*1024,src);total+=bytes;
  }
  assert.ok(total<1024*1024,'전체 그림 용량: '+total);
  assert.match(read('index.html'),/\/webtoon\/life-graph.html\?from=home-life-graph-story/);
  assert.match(fs.readFileSync(path.join(__dirname,'../scripts/injectGA.js'),'utf8'),/'webtoon\/life-graph.html'/);
  const {PAGES}=require('../scripts/buildSeo');
  assert.ok(PAGES.some(p=>p.file==='webtoon/life-graph.html'&&p.sitemap&&p.manageHead===false));
  assert.match(read('sitemap.xml'),/https:\/\/sajuotter.com\/webtoon\/life-graph.html/);
});
