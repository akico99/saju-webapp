'use strict';
/* 상품별 PDF 그림을 미리 만든다(그림을 바꿀 때만 실행, 결과 JPEG를 커밋).
   Chromium은 PDF에 webp를 넣을 때 압축을 풀어 장당 약 1.6MB로 키웠다(2026-10-28 실측, PDF 7.5MB 중 6.6MB).
   JPEG는 압축된 그대로 들어가므로, PDF에 보이는 비율로 미리 잘라 JPEG로 저장한다.
   PDF 렌더러는 cover·timing·thread·door 네 이름을 쓴다. 상품마다 그 자리에 둘 그림을 아래 표가 정한다.
   사용: node scripts/build-love-pdf-art.js */
const path = require('path');
const sharp = require('sharp');
const PUB = path.join(__dirname, '..', 'public');
const OUT = path.join(__dirname, '..', 'src', 'pdf', 'assets');
const COVER = [1100, 795, 0.30];   // 표지 166×120mm
const BANNER = [1240, 224, 0.32];  // 장 배너 170×30mm
const SETS = {
  love: { cover: 'love-assets/reading/cover-comic.webp', timing: 'love-assets/reading/timing-comic.webp', thread: 'love-assets/reading/thread-comic.webp', door: 'love-assets/reading/door-comic.webp' },
  'new-year': { cover: 'new-year-assets/cover.webp', timing: 'new-year-assets/months.webp', thread: 'new-year-assets/work.webp', door: 'new-year-assets/plan.webp' },
  reunion: { cover: 'reunion-assets/cover.webp', timing: 'reunion-assets/flow.webp', thread: 'reunion-assets/drawn.webp', door: 'reunion-assets/heal.webp' },
  couple: { cover: 'couple-assets/cover.webp', timing: 'couple-assets/flow.webp', thread: 'couple-assets/attract.webp', door: 'couple-assets/keep.webp' }
};
(async () => {
  for (const [set, files] of Object.entries(SETS)) {
    require('fs').mkdirSync(path.join(OUT, set), { recursive: true });
    for (const [name, src] of Object.entries(files)) {
      const [w, h, posY] = name === 'cover' ? COVER : BANNER;
      const img = sharp(path.join(PUB, src));
      const meta = await img.metadata();
      const scaledH = Math.round(meta.height * w / meta.width);
      const top = Math.max(0, Math.round((scaledH - h) * posY));
      const info = await img.resize(w).extract({ left: 0, top, width: w, height: Math.min(h, scaledH - top) })
        .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, set, name + '.jpg'));
      console.log(set + '/' + name + '.jpg', info.width + 'x' + info.height, Math.round(info.size / 1024) + 'KB');
    }
  }
})();

