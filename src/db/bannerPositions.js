'use strict';
/* 메인 배너 슬라이드(index.html) 콘텐츠 저장소 — 이미지 위치뿐 아니라 텍스트(eyebrow/headline/price),
   링크, 텍스트 정렬·크기까지 저장한다. 슬라이드 개수가 6개로 고정이고 자주 안 바뀌는 설정값이라
   SQLite 테이블 대신 파일 하나로 둔다. DEFAULTS는 index.html에 원래 하드코딩되어 있던 문구 그대로라,
   이 파일이 처음 생성될 때(또는 값이 비어있을 때)도 화면이 기존과 똑같이 보인다. */
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', '..', 'data', 'banner-positions.json');
const SLIDE_IDS = ['1', '2', '3', '4', '5', '6'];
const TEXT_ALIGNS = ['left', 'center', 'right'];
const TEXT_VALIGNS = ['top', 'center', 'bottom'];

const DEFAULTS = {
  1: { imagePosition: '50% 50%', eyebrow: "TODAY'S PICK", headline: '깊게 볼 필요 없을 땐, 990원', price: '오늘의 나 — 총평 빠른 리딩', href: 'quick.html?topic=total', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  2: { imagePosition: '50% 50%', eyebrow: 'HOT', headline: '지금 인연의 흐름이 궁금할 때', price: '애정운 빠른 리딩 · 990원', href: 'quick.html?topic=love', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  3: { imagePosition: '50% 50%', eyebrow: 'COMPATIBILITY', headline: '둘이 보는 진짜 궁합', price: '궁합 리포트 · 4,900원', href: 'compat.html', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  4: { imagePosition: '50% 50%', eyebrow: 'MONEY', headline: '돈이 들어오고 나가는 흐름', price: '재물운 빠른 리딩 · 990원', href: 'quick.html?topic=wealth', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  5: { imagePosition: '50% 50%', eyebrow: 'FREE', headline: '내 인생, 흐름으로 한눈에 보기', price: '인생 그래프 · 무료 체험', href: 'life-graph.html', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  6: { imagePosition: '50% 50%', eyebrow: 'FULL REPORT', headline: '인생 전체를 18장으로', price: '평생사주 100p 정식 리포트 · 14,900원', href: 'lifetime-report.html', textAlign: 'left', textVAlign: 'bottom', textScale: 1 }
};

function isValidPosition(v) {
  return typeof v === 'string' && /^\d{1,3}% \d{1,3}%$/.test(v);
}

function cleanSlide(id, raw) {
  const def = DEFAULTS[id];
  const v = raw && typeof raw === 'object' ? raw : {};
  const scale = Number(v.textScale);
  return {
    imagePosition: isValidPosition(v.imagePosition) ? v.imagePosition : def.imagePosition,
    eyebrow: typeof v.eyebrow === 'string' ? v.eyebrow.slice(0, 30) : def.eyebrow,
    headline: typeof v.headline === 'string' ? v.headline.slice(0, 60) : def.headline,
    price: typeof v.price === 'string' ? v.price.slice(0, 60) : def.price,
    href: typeof v.href === 'string' && v.href.trim() ? v.href.trim().slice(0, 200) : def.href,
    textAlign: TEXT_ALIGNS.includes(v.textAlign) ? v.textAlign : def.textAlign,
    textVAlign: TEXT_VALIGNS.includes(v.textVAlign) ? v.textVAlign : def.textVAlign,
    textScale: Number.isFinite(scale) ? Math.max(0.7, Math.min(1.6, scale)) : def.textScale
  };
}

function readPositions() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (e) {
    saved = {};
  }
  const positions = {};
  SLIDE_IDS.forEach((id) => {
    positions[id] = cleanSlide(id, saved[id]);
  });
  return positions;
}

function writePositions(positions) {
  const clean = {};
  SLIDE_IDS.forEach((id) => {
    clean[id] = cleanSlide(id, positions[id]);
  });
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

module.exports = { readPositions, writePositions, SLIDE_IDS };
