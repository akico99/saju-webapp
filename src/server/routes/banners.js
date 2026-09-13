'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bannerPositions = require('../../db/bannerPositions');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const BANNERS_DIR = path.join(__dirname, '..', '..', '..', 'public', 'banners');
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
