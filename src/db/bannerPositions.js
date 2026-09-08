'use strict';
/* 메인 배너 슬라이드(index.html) 콘텐츠 저장소 — 이미지 경로, 위치, 문구(eyebrow/headline/price/cta),
   링크, 텍스트 정렬·크기까지 배열로 저장한다. 개수 제한이 없어서 자유롭게 추가/삭제할 수 있다.

   과거 버전은 정확히 6개 슬라이드를 '1'~'6' 키를 가진 객체로 고정해서 저장했다(이미지 파일도
   /banners/{id}.png로 고정). 이 파일을 배열 형태로 바꾸면서, 예전 형식으로 저장된 데이터가
   남아있으면 그 값 그대로 배열로 옮겨 살린다(마이그레이션) — 배포 중인 서버의 data/ 폴더에는
   운영자가 이미 커스터마이징한 값이 들어있을 수 있어서, 새 코드가 그걸 날려버리면 안 된다. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, '..', '..', 'data', 'banner-positions.json');
const TEXT_ALIGNS = ['left', 'center', 'right'];
const TEXT_VALIGNS = ['top', 'center', 'bottom'];
const LEGACY_IDS = ['1', '2', '3', '4', '5', '6'];

const LEGACY_DEFAULTS = {
  1: { image: '/banners/1.png', imagePosition: '50% 50%', eyebrow: "TODAY'S PICK", headline: '깊게 볼 필요 없을 땐, 990원', price: '오늘의 나 — 총평 빠른 리딩', href: 'quick.html?topic=total', cta: '지금 보기 →', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  2: { image: '/banners/2.png', imagePosition: '50% 50%', eyebrow: 'HOT', headline: '지금 인연의 흐름이 궁금할 때', price: '애정운 빠른 리딩 · 990원', href: 'quick.html?topic=love', cta: '지금 보기 →', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  3: { image: '/banners/3.png', imagePosition: '50% 50%', eyebrow: 'COMPATIBILITY', headline: '둘이 보는 진짜 궁합', price: '궁합 리포트 · 4,900원', href: 'compat.html', cta: '지금 보기 →', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  4: { image: '/banners/4.png', imagePosition: '50% 50%', eyebrow: 'MONEY', headline: '돈이 들어오고 나가는 흐름', price: '재물운 빠른 리딩 · 990원', href: 'quick.html?topic=wealth', cta: '지금 보기 →', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  5: { image: '/banners/5.png', imagePosition: '50% 50%', eyebrow: 'FREE', headline: '내 인생, 흐름으로 한눈에 보기', price: '인생 그래프 · 무료 체험', href: 'life-graph.html', cta: '무료로 보기 →', textAlign: 'left', textVAlign: 'bottom', textScale: 1 },
  6: { image: '/banners/6.png', imagePosition: '50% 50%', eyebrow: 'FULL REPORT', headline: '인생 전체를 18장으로', price: '평생사주 100p 정식 리포트 · 14,900원', href: 'lifetime-report.html', cta: '지금 보기 →', textAlign: 'left', textVAlign: 'bottom', textScale: 1 }
};

function isValidPosition(v) {
  return typeof v === 'string' && /^\d{1,3}% \d{1,3}%$/.test(v);
}

function cleanBanner(raw, fallback) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const def = fallback || {};
  const scale = Number(v.textScale);
  return {
    id: typeof v.id === 'string' && v.id ? v.id : (def.id || crypto.randomUUID()),
    image: typeof v.image === 'string' && v.image ? v.image : (def.image || ''),
    imagePosition: isValidPosition(v.imagePosition) ? v.imagePosition : (def.imagePosition || '50% 50%'),
    eyebrow: typeof v.eyebrow === 'string' ? v.eyebrow.slice(0, 30) : (def.eyebrow || ''),
    headline: typeof v.headline === 'string' ? v.headline.slice(0, 60) : (def.headline || ''),
    price: typeof v.price === 'string' ? v.price.slice(0, 60) : (def.price || ''),
    cta: typeof v.cta === 'string' && v.cta.trim() ? v.cta.slice(0, 20) : (def.cta || '지금 보기 →'),
    href: typeof v.href === 'string' && v.href.trim() ? v.href.trim().slice(0, 200) : (def.href || '#'),
    textAlign: TEXT_ALIGNS.includes(v.textAlign) ? v.textAlign : (def.textAlign || 'left'),
    textVAlign: TEXT_VALIGNS.includes(v.textVAlign) ? v.textVAlign : (def.textVAlign || 'bottom'),
    textScale: Number.isFinite(scale) ? Math.max(0.7, Math.min(1.6, scale)) : (def.textScale || 1)
  };
}

function migrateLegacy(saved) {
  return LEGACY_IDS
    .filter((id) => saved[id])
    .map((id) => cleanBanner(saved[id], LEGACY_DEFAULTS[id]));
}

function readBanners() {
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (e) {
    saved = null;
  }
  if (Array.isArray(saved)) {
    return saved.map((b) => cleanBanner(b));
  }
  if (saved && typeof saved === 'object' && LEGACY_IDS.some((id) => saved[id])) {
    return migrateLegacy(saved);
  }
  // 저장된 파일이 아예 없으면(첫 실행) 기존과 동일하게 보이도록 기본 6개를 보여준다.
  return LEGACY_IDS.map((id) => cleanBanner(LEGACY_DEFAULTS[id]));
}

function writeBanners(list) {
  const clean = Array.isArray(list) ? list.map((b) => cleanBanner(b)).filter((b) => b.image) : [];
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

module.exports = { readBanners, writeBanners };
