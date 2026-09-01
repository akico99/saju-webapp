'use strict';
const express = require('express');
const bannerPositions = require('../../db/bannerPositions');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/banners', (req, res) => {
  res.json({ positions: bannerPositions.readPositions() });
});

router.post('/admin/banners', requireAdmin, (req, res) => {
  const positions = bannerPositions.writePositions(req.body.positions || {});
  res.json({ positions });
});

module.exports = router;
