'use strict';
/* 메인 배너 슬라이드(index.html)의 이미지 위치(object-position)만 저장하는 작은 JSON 저장소.
   슬라이드 개수가 6개로 고정이고 자주 안 바뀌는 설정값이라 SQLite 테이블 대신 파일 하나로 둔다. */
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', '..', 'data', 'banner-positions.json');
const SLIDE_IDS = ['1', '2', '3', '4', '5', '6'];
const DEFAULT_POSITION = '50% 50%';

function readPositions() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (e) {
    saved = {};
  }
  const positions = {};
  SLIDE_IDS.forEach((id) => {
    positions[id] = saved[id] || DEFAULT_POSITION;
  });
  return positions;
}

function writePositions(positions) {
  const clean = {};
  SLIDE_IDS.forEach((id) => {
    const value = positions[id];
    const ok = typeof value === 'string' && /^\d{1,3}% \d{1,3}%$/.test(value);
    clean[id] = ok ? value : DEFAULT_POSITION;
  });
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

module.exports = { readPositions, writePositions, SLIDE_IDS };
