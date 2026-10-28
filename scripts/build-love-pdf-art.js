'use strict';
/* 연애 리포트 PDF용 그림을 미리 만든다(한 번만 실행, 결과 JPEG를 커밋).
   Chromium은 PDF에 webp를 넣을 때 압축을 풀어 장당 약 1.6MB로 키웠다(2026-10-28 실측, PDF 7.5MB 중 6.6MB).
   JPEG는 압축된 그대로 들어가므로, PDF에 보이는 비율로 미리 잘라 JPEG로 저장한다.
   사용: node scripts/build-love-pdf-art.js */
const path = require('path');
const sharp = require('sharp');
const SRC = path.join(__dirname, '..', 'public', 'love-assets', 'reading');
const OUT = path.join(__dirname, '..', 'src', 'pdf', 'assets', 'love');
// [원본, 결과, 너비px, 높이px, 세로 위치(0=위, 1=아래)] — renderLoveHtml.js의 표시 크기와 같은 비율
const JOBS = [
  ['cover-comic.webp', 'cover.jpg', 1100, 795, 0.30],   // 표지 166×120mm
  ['timing-comic.webp', 'timing.jpg', 1240, 224, 0.32], // 장 배너 170×30mm
  ['thread-comic.webp', 'thread.jpg', 1240, 224, 0.32],
  ['door-comic.webp', 'door.jpg', 1240, 224, 0.32]
];
(async () => {
  require('fs').mkdirSync(OUT, { recursive: true });
  for (const [src, out, w, h, posY] of JOBS) {
    const img = sharp(path.join(SRC, src));
    const meta = await img.metadata();
    const scaledH = Math.round(meta.height * w / meta.width);
    const top = Math.max(0, Math.round((scaledH - h) * posY));
    const info = await img.resize(w).extract({ left: 0, top, width: w, height: Math.min(h, scaledH - top) })
      .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, out));
    console.log(out, info.width + 'x' + info.height, Math.round(info.size / 1024) + 'KB');
  }
})();

