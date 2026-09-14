'use strict';
/* 메인 배너 슬라이드 콘텐츠 저장소 — 이미지 경로/위치, 링크, 텍스트 정렬, 그리고 배너에
   올릴 텍스트 블록 목록을 배열로 저장한다. 개수 제한이 없어서 자유롭게 추가/삭제할 수 있다.

   형식이 두 번 바뀌었고, 배포 중인 서버의 data/ 폴더에는 운영자가 이미 커스터마이징한
   값이 들어있을 수 있어서 옛 형식을 만나면 값을 살려서 새 형식으로 옮긴다(마이그레이션).

   v1: 정확히 6개 슬라이드를 '1'~'6' 키를 가진 객체로 고정 저장.
   v2: 배열로 바뀜. 슬라이드마다 eyebrow/headline/price/cta 네 칸이 고정.
   v3(현재): 네 칸 고정을 없애고 blocks 배열로 바꿈 — 원하는 종류의 블록을 원하는 개수만큼,
       원하는 순서로 넣는다. 버튼도 블록 중 하나라서 아예 안 넣을 수 있다(v2까지는 cta가
       비어도 '지금 보기 →'가 자동으로 들어가서 버튼 없는 배너를 만들 수 없었다).
       v2 데이터는 네 칸을 label/title/body/button 블록 4개로 옮겨 화면이 그대로 유지된다. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE_PATH = path.join(__dirname, '..', '..', 'data', 'banner-positions.json');
const TEXT_ALIGNS = ['left', 'center', 'right'];
const TEXT_VALIGNS = ['top', 'center', 'bottom'];
const BLOCK_TYPES = ['label', 'title', 'body', 'button'];
// 이미지 위에 깔리는 어둠 — 밝은 이미지에 흰 글씨를 올리면 글자가 사라지므로 기본은 켜둔다.
// 하단을 의도적으로 비워 만든 이미지라면 관리자가 배너별로 끌 수 있다.
const OVERLAYS = ['none', 'weak', 'strong'];
const LEGACY_IDS = ['1', '2', '3', '4', '5', '6'];

// v2 네 칸이 각각 어떤 블록으로 옮겨가는지 — 순서도 화면에 나오던 순서 그대로다.
const LEGACY_FIELD_TO_BLOCK = [
  ['eyebrow', 'label'],
  ['headline', 'title'],
  ['price', 'body'],
  ['cta', 'button']
];

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

// 색은 화면에 style로 직접 꽂히므로 #rgb / #rrggbb 형식만 통과시킨다 —
// 아무 문자열이나 받으면 배너 문구 칸을 통해 CSS를 밀어넣을 수 있게 된다.
function isValidColor(v) {
  return typeof v === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

function cleanBlock(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const scale = Number(v.scale);
  // 줄바꿈은 살리되(\n) 캐리지리턴은 없앤다 — 화면에서 white-space:pre-line으로 그대로 나온다.
  const text = typeof v.text === 'string' ? v.text.replace(/\r/g, '').slice(0, 200) : '';
  return {
    id: typeof v.id === 'string' && v.id ? v.id : crypto.randomUUID(),
    type: BLOCK_TYPES.includes(v.type) ? v.type : 'body',
    text,
    scale: Number.isFinite(scale) ? Math.max(0.6, Math.min(3, scale)) : 1,
    // 빈 값이면 기본 색(흰 글씨, 버튼은 흰 배경에 검은 글씨)을 그대로 쓴다.
    color: isValidColor(v.color) ? v.color.toLowerCase() : '',
    bgColor: isValidColor(v.bgColor) ? v.bgColor.toLowerCase() : ''
  };
}

/* v2(고정 네 칸) 슬라이드를 블록 4개로 펴준다. 빈 칸은 블록으로 만들지 않는다 —
   v2에서는 빈 칸도 자리를 차지했지만 눈에 보이는 건 없었으므로 화면은 그대로다. */
function blocksFromLegacyFields(v) {
  const scale = Number(v.textScale);
  const s = Number.isFinite(scale) ? Math.max(0.6, Math.min(3, scale)) : 1;
  return LEGACY_FIELD_TO_BLOCK
    .filter(([field]) => typeof v[field] === 'string' && v[field].trim())
    // v2의 textScale은 버튼에는 적용되지 않았다(버튼은 항상 12px 고정). 배율을 조정해둔
    // 배너의 버튼 크기가 이 마이그레이션 때문에 달라지지 않도록 버튼만 1로 둔다.
    .map(([field, type]) => cleanBlock({ type, text: v[field], scale: type === 'button' ? 1 : s }));
}

function cleanBanner(raw, fallback) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const def = fallback || {};
  // 내용이 빈 블록은 저장하지 않는다 — 빈 버튼이 알약만 덩그러니 뜨는 걸 막는다.
  const blocks = Array.isArray(v.blocks)
    ? v.blocks.map(cleanBlock).filter((b) => b.text.trim())
    : blocksFromLegacyFields(Object.assign({}, def, v));
  return {
    id: typeof v.id === 'string' && v.id ? v.id : (def.id || crypto.randomUUID()),
    image: typeof v.image === 'string' && v.image ? v.image : (def.image || ''),
    imagePosition: isValidPosition(v.imagePosition) ? v.imagePosition : (def.imagePosition || '50% 50%'),
    href: typeof v.href === 'string' && v.href.trim() ? v.href.trim().slice(0, 200) : (def.href || '#'),
    textAlign: TEXT_ALIGNS.includes(v.textAlign) ? v.textAlign : (def.textAlign || 'left'),
    textVAlign: TEXT_VALIGNS.includes(v.textVAlign) ? v.textVAlign : (def.textVAlign || 'bottom'),
    overlay: OVERLAYS.includes(v.overlay) ? v.overlay : (def.overlay || 'strong'),
    blocks: blocks.slice(0, 12)
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
  return LEGACY_IDS.map((id) => cleanBanner({}, LEGACY_DEFAULTS[id]));
}

function writeBanners(list) {
  const clean = Array.isArray(list) ? list.map((b) => cleanBanner(b)).filter((b) => b.image) : [];
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(clean, null, 2));
  return clean;
}

module.exports = { readBanners, writeBanners, BLOCK_TYPES };
