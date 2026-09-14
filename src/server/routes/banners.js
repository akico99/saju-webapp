'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
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

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, BANNERS_DIR),
    filename: (req, file, cb) => {
      const ext = ALLOWED_EXT[file.mimetype] || '.png';
      cb(null, `banner-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    }
  }),
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
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || '업로드 실패' });
    if (!req.file) return res.status(400).json({ error: '파일이 없습니다.' });
    res.json({ path: '/banners/' + req.file.filename });
  });
});

module.exports = router;
