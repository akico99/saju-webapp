'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');
const bannerPositions = require('../../db/bannerPositions');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 업로드된 배너 이미지는 public/banners(=git 배포 트리)가 아니라 data/ 아래에 저장한다.
// public/은 배포할 때마다 git 커밋 내용으로 통째로 교체되므로, 런타임에 업로드한 파일을
// 거기 저장하면 다음 배포에서 그대로 사라진다(2026-09-08에 output/ PDF 파일로 겪었던
// 것과 같은 문제 — data/ 는 Render 영구 디스크가 마운트된 경로라 배포와 무관하게 남는다).
// URL은 기존과 동일하게 /banners/*로 유지하기 위해 app.js에서 이 폴더를 같은 경로에
// 추가로 static 서빙한다(기본 6개 배너는 여전히 public/banners에서 서빙됨).
const BANNERS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'uploads', 'banners');
fs.mkdirSync(BANNERS_DIR, { recursive: true });
const ALLOWED_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

/* 배너는 최대 480px 폭(.app)으로 보이므로 3배수인 1440px이면 고해상도 화면에서도 충분하다.
   올린 파일을 그대로 저장하면 폰에서 찍은 5MB짜리 사진이 그대로 서비스에 나가고, 슬라이드
   6장이 전부 처음에 로드되는 구조라 첫 화면에서만 수십 MB를 받게 된다(2026-09에 기본 배너
   6장이 PNG 1.6MB씩이라 약 10MB였다). 그래서 업로드 시점에 한 번 줄여서 저장한다.
   자르지는 않는다 — 어디를 보여줄지는 관리자가 이미지 위치 슬라이더로 정한다. */
const MAX_WIDTH = 1440;
const MAX_HEIGHT = 1440;
const JPEG_QUALITY = 82;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXT[file.mimetype]) return cb(new Error('PNG, JPEG, WEBP 이미지만 업로드할 수 있어요.'));
    cb(null, true);
  }
});

router.get('/banners', (req, res) => {
  res.json({ banners: bannerPositions.readBanners() });
});

router.post('/admin/banners', requireAdmin, (req, res) => {
  const banners = bannerPositions.writeBanners(req.body.banners || []);
  res.json({ banners });
});

router.post('/admin/banners/upload', requireAdmin, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({ error: tooBig ? '8MB 이하 이미지만 올릴 수 있어요.' : (err.message || '업로드 실패') });
    }
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });

    const filename = `banner-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    try {
      // withoutEnlargement — 작은 이미지를 억지로 키워서 흐려지게 만들지 않는다.
      const out = await sharp(req.file.buffer)
        .rotate() // 폰 사진의 EXIF 방향을 실제 픽셀에 반영해서 눕지 않게 한다
        .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      fs.writeFileSync(path.join(BANNERS_DIR, filename), out);
      console.log(`[배너 업로드] ${req.file.originalname} ${Math.round(req.file.size / 1024)}KB -> ${filename} ${Math.round(out.length / 1024)}KB`);
      res.json({ path: '/banners/' + filename, bytes: out.length, originalBytes: req.file.size });
    } catch (e) {
      console.error('[배너 업로드] 이미지 변환 실패:', e.message);
      res.status(400).json({ error: '이미지를 읽을 수 없어요. 다른 파일로 시도해주세요.' });
    }
  });
});

module.exports = router;
