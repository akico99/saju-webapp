'use strict';
/* 무료 미니 리딩 3종 — LLM 없이 엔진 값과 고정 해석표만으로 만든다(비용 0, 즉시 응답).
   오늘의 운세·인생 그래프처럼 "결제 없이 먼저 보는" 입구이고, 각각 3,900원 심층 리딩 하나로
   이어진다. 무료라고 허접하면 안 된다는 기준: 표에서 고르되 이 사람의 기둥·오행·신살에
   실제로 근거한 문장만 나오고, 없는 걸 지어내지 않는다(귀인이 없으면 없다고 말한다).

   noble   사주 속 귀인      → 대인관계·인복 심층 리딩
   balance 내 오행 밸런스     → 내 사주 첫 풀이
   charm   타고난 매력       → 애정·결혼운 심층 리딩 */
const { computeSaju } = require('./index');
const { grade } = require('./counts');

const PILLAR_KO = { year: '연주', month: '월주', day: '일주', hour: '시주' };
// 궁위(§0) — 각 기둥이 삶의 어느 영역·시기·관계를 뜻하는지
const PALACE = {
  year: { who: '조상·윗세대와 바깥 세상', when: '어린 시절과 삶의 초반', how: '집안 배경이나 나이 많은 어른, 사회적 인연' },
  month: { who: '부모와 사회, 직장', when: '청년기와 활동기', how: '부모·상사·선배, 일터에서 만나는 사람' },
  day: { who: '나 자신과 배우자', when: '삶의 한가운데', how: '가장 가까운 사람, 배우자나 그에 준하는 인연' },
  hour: { who: '자녀와 아랫사람, 말년', when: '삶의 후반', how: '자녀, 후배, 내가 이끄는 사람들' }
};

function ganziKo(p) { return `${p.stemKo}${p.branchKo}`; }
// 받침에 따라 이/가, 은/는, 을/를 — "목·수이" 같은 어색한 조사를 막는다.
function hasBatchim(word) {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 !== 0;
}
const iga = (w) => w + (hasBatchim(w) ? '이' : '가');
const eunneun = (w) => w + (hasBatchim(w) ? '은' : '는');
// 시각을 모르면 엔진이 정오로 가정해 시주를 만든다 — 귀인·매력처럼 "있다/없다"를 말하는
// 리딩에서는 가정한 기둥을 근거로 쓰면 안 되므로 시주를 뺀다.
function pillarsOf(r) {
  return r.meta.hourGiven === false || r.meta.input.hour == null ? ['year', 'month', 'day'] : ['year', 'month', 'day', 'hour'];
}
function stripBasis(name) { return name.replace(/\(.*?\)/g, ''); }
// 표지에 네 기둥을 한 줄로 보여주기 위한 목록 — 시각을 모르면 시주는 빠진다(pillarsOf와 같은 기준).
function pillarStrip(r) {
  return pillarsOf(r).map((key) => {
    const p = r.manse[key];
    return { key, ko: PILLAR_KO[key], hanja: p.stem + p.branch, ganzi: ganziKo(p) };
  });
}

/* ---------- A. 사주 속 귀인 ---------- */
const NOBLE = {
  '천을귀인': {
    title: '천을귀인 — 위기에서 손 내미는 사람',
    core: '열두 신살 가운데 가장 힘이 센 길신으로 꼽힙니다. 막다른 곳에서 뜻밖의 도움이 오거나, 어려운 일이 큰 탈 없이 지나가는 힘으로 읽습니다.',
    tip: '도움을 받았을 때 반드시 되갚는 사람에게 이 귀인은 다시 옵니다. 신세를 진 관계를 소홀히 하지 마세요.'
  },
  '문창귀인': {
    title: '문창귀인 — 글과 배움이 길이 되는 사람',
    core: '문서·학문·표현에 힘이 붙는 길신입니다. 시험·자격·글쓰기·기획처럼 머리와 손으로 정리하는 일에서 남보다 수월하게 풀립니다.',
    tip: '말보다 글로, 즉흥보다 정리해서 내놓을 때 이 기운이 삽니다. 중요한 제안은 문서로 남기세요.'
  },
  '암록': {
    title: '암록 — 보이지 않는 곳의 든든한 뒷배',
    core: '겉으로 드러나지 않지만 필요할 때 조용히 채워지는 복입니다. 큰 부자는 아니어도 끊기지 않는 수입, 티 안 나게 도와주는 사람으로 나타납니다.',
    tip: '요란한 기회보다 조용히 오래 가는 관계와 일이 이 사주에는 더 남습니다.'
  },
  '장성살': {
    title: '장성살 — 앞에 서면 힘이 나는 사람',
    core: '살(殺)이라는 이름이 붙었지만 리더의 기운으로 봅니다. 책임지는 자리, 이끄는 자리에서 오히려 기운이 살아납니다.',
    tip: '뒤에서 따라가면 답답해지는 사주입니다. 작은 모임이라도 맡아서 이끌어보세요.'
  },
  '반안살': {
    title: '반안살 — 품격과 안정을 부르는 자리',
    core: '말안장에 오른 모습에서 온 이름입니다. 지위·체면·안정된 자리와 인연이 있고, 남에게 대접받는 쪽으로 기운이 흐릅니다.',
    tip: '가볍게 보이는 것을 피하고 격을 지키는 선택이 이 기운을 살립니다.'
  }
};
const NOBLE_ORDER = ['천을귀인', '문창귀인', '암록', '장성살', '반안살'];

function readNoble(r) {
  const found = [];
  const pillars = pillarsOf(r);
  for (const key of pillars) {
    const p = r.manse[key];
    if (!p || !p.shinsals) continue;
    for (const raw of p.shinsals) {
      const name = stripBasis(raw);
      if (!NOBLE[name]) continue;
      found.push({ name, pillar: key, pillarKo: PILLAR_KO[key], ganzi: ganziKo(p), palace: PALACE[key], ...NOBLE[name] });
    }
  }
  found.sort((a, b) => NOBLE_ORDER.indexOf(a.name) - NOBLE_ORDER.indexOf(b.name));
  const hourUnknown = pillars.length === 3;

  let headline, lead;
  if (found.length === 0) {
    headline = '원국에는 귀인이 자리 잡고 있지 않아요';
    lead = '태어난 네 기둥 안에는 이름 붙은 귀인이 없습니다. 이건 흔한 일이고 나쁜 뜻이 아닙니다. 귀인은 대운·세운으로 해마다 들어오기도 해서, 어느 해에 누가 오는지는 흐름을 봐야 합니다.';
  } else if (found.length === 1) {
    headline = `${found[0].pillarKo}에 ${iga(found[0].name)} 있어요`;
    lead = `${found[0].palace.who} 쪽에서, ${found[0].palace.when}에 힘이 되는 인연입니다.`;
  } else {
    headline = `귀인이 ${found.length}자리에 있어요`;
    lead = `${found.map((f) => f.pillarKo).join('·')}에 각각 다른 성격의 도움이 놓여 있습니다. 어느 관계에서 누가 오는지 아래에서 하나씩 보세요.`;
  }

  return {
    kind: 'noble', title: '사주 속 귀인', headline, lead, found, hourUnknown, pillars: pillarStrip(r),
    note: hourUnknown ? '태어난 시각이 없어 시주(자녀·말년·아랫사람 자리)는 보지 못했습니다.' : null,
    upsell: { lead: '귀인이 어느 자리에 있는지는 알았어요. 그 인연을 실제로 어떻게 만나고 지키는지, 사람 관계 전체의 구조를 보려면요.', name: '대인관계·인복 심층 리딩', price: '3,900원', href: '/quick.html?topic=relationship' }
  };
}

/* ---------- B. 내 오행 밸런스 ---------- */
const OH_META = {
  '木': { ko: '목', word: '성장·시작', color: '#438779' },
  '火': { ko: '화', word: '표현·열정', color: '#C9674B' },
  '土': { ko: '토', word: '안정·신뢰', color: '#B8945A' },
  '金': { ko: '금', word: '결단·정리', color: '#7C8794' },
  '水': { ko: '수', word: '지혜·유연', color: '#4A6C8C' }
};
const OH_STRONG = {
  '木': { light: '새로 시작하고 키우는 힘이 셉니다. 아이디어를 내고 판을 벌이는 데 망설임이 적습니다.', shadow: '벌여놓은 걸 거두지 못하고 다음으로 넘어가기 쉽습니다. 마무리를 맡아줄 사람이 필요합니다.' },
  '火': { light: '표현하고 드러내는 힘이 셉니다. 사람을 끌어당기고 분위기를 바꾸는 쪽입니다.', shadow: '열이 한꺼번에 올랐다 꺼지기 쉽습니다. 감정이 앞서 말이 먼저 나가는 일을 조심하세요.' },
  '土': { light: '버티고 지키는 힘이 셉니다. 믿을 만하다는 말을 듣고, 사람이 기대는 자리가 됩니다.', shadow: '변화 앞에서 너무 오래 서 있습니다. 놓아야 할 것을 붙들고 있지 않은지 살피세요.' },
  '金': { light: '자르고 정리하는 힘이 셉니다. 원칙이 분명하고 결정이 빠릅니다.', shadow: '날이 서서 사람을 베기 쉽습니다. 옳은 말이 상처가 되는 순간을 조심하세요.' },
  '水': { light: '흐르고 스며드는 힘이 셉니다. 상황을 읽고 돌아가는 길을 찾는 데 능합니다.', shadow: '고이면 탁해집니다. 생각만 깊어지고 움직이지 않는 시기를 경계하세요.' }
};
const OH_LACK = {
  '木': '원국 글자에 목이 보이지 않습니다. 새 일을 시작하거나 키우는 방식은 다른 기운과 흐름까지 함께 살펴야 합니다.',
  '火': '원국 글자에 화가 보이지 않습니다. 표현하는 방식이 없다는 뜻은 아니며, 다른 기운과 흐름에서 드러날 수 있습니다.',
  '土': '원국 글자에 토가 보이지 않습니다. 안정감을 만드는 방식은 다른 기운과 흐름까지 함께 살펴야 합니다.',
  '金': '원국 글자에 금이 보이지 않습니다. 결단력이 없다는 뜻은 아니며, 정리하는 방식은 다른 기운에서도 읽힙니다.',
  '水': '원국 글자에 수가 보이지 않습니다. 유연성이 없다는 뜻은 아니며, 다른 기운과 흐름까지 함께 살펴야 합니다.'
};

function readBalance(r) {
  // 시각 미상 시 엔진의 정오 가정 시주는 무료 결과의 근거에서 제외한다.
  const pillars = pillarsOf(r);
  const counts = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const key of pillars) {
    const pillar = r.manse[key];
    if (pillar.stemOhaeng) counts[pillar.stemOhaeng]++;
    if (pillar.branchOhaeng) counts[pillar.branchOhaeng]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const bars = ['木', '火', '土', '金', '水'].map((o) => ({
    el: o, ko: OH_META[o].ko, word: OH_META[o].word, color: OH_META[o].color,
    count: counts[o], pct: Math.round(counts[o] / total * 100), grade: grade(counts[o])
  }));
  const strongest = bars.reduce((a, b) => (b.count > a.count ? b : a), bars[0]);
  const strongestAll = bars.filter((b) => b.count === strongest.count).map((b) => ({ ...b, ...OH_STRONG[b.el] }));
  const lacking = bars.filter((b) => b.count === 0).map((b) => ({ el: b.el, ko: b.ko, word: b.word, text: OH_LACK[b.el] }));
  const weakest = bars.filter((b) => b.count > 0).sort((a, b) => a.count - b.count)[0];

  const spread = strongest.count - (bars.reduce((a, b) => (b.count < a.count ? b : a), bars[0]).count);
  let headline;
  const strongestNames = strongestAll.map((b) => b.ko).join('·');
  if (lacking.length >= 2) headline = `${iga(strongestNames)} 두드러지고, ${eunneun(lacking.map((l) => l.ko).join('·'))} 보이지 않아요`;
  else if (lacking.length === 1) headline = `${iga(strongestNames)} 두드러지고, ${eunneun(lacking[0].ko)} 보이지 않아요`;
  else if (spread <= 2) headline = '다섯 기운이 고르게 퍼져 있어요';
  else headline = `${strongestNames} 쪽으로 기울어 있어요`;

  return {
    kind: 'balance', title: '내 오행 밸런스', headline,
    lead: `${total}글자 중 ${iga(strongestNames)} ${strongestAll.length > 1 ? '각각 ' : ''}${strongest.count}개로 가장 많고${lacking.length ? `, ${eunneun(lacking.map((l) => l.ko).join('·'))} 0개입니다` : ', 빠진 기운은 없습니다'}. 글자 수만으로 기운의 좋고 나쁨을 단정하지 않습니다.`,
    bars, total, hourUnknown: pillars.length === 3, strongest: strongestAll[0], strongestAll, lacking,
    weakest: weakest && weakest.el !== strongest.el ? { ...weakest, text: `${eunneun(weakest.ko)} 있긴 하지만 ${weakest.count}개로 얇습니다. 없는 건 아니라 의식하면 쓸 수 있는 자리입니다.` } : null,
    upsell: { lead: '기운의 많고 적음은 봤어요. 이 균형이 성격과 기질로 어떻게 나타나고, 전체를 한 줄로 뭐라고 하는지까지 보려면요.', name: '내 사주 첫 풀이', price: '3,900원', href: '/quick.html?topic=intro' }
  };
}

/* ---------- C. 타고난 매력 ---------- */
const ILGAN_CHARM = {
  '甲': '곧게 선 큰 나무처럼, 흔들리지 않는 태도 자체가 매력입니다. 기대고 싶어지는 사람.',
  '乙': '바람에 휘어도 꺾이지 않는 풀처럼, 부드러운데 끈질깁니다. 곁에 오래 두고 싶어지는 사람.',
  '丙': '한낮의 해처럼 있는 자리를 환하게 만듭니다. 시선이 먼저 가는 사람.',
  '丁': '촛불처럼 가까이서 따뜻합니다. 멀리서는 몰라도 곁에 오면 빠져드는 사람.',
  '戊': '산처럼 든든합니다. 말수가 적어도 있으면 안심이 되는 사람.',
  '己': '밭처럼 품이 넓습니다. 무엇이든 받아주는 편안함이 매력인 사람.',
  '庚': '원석처럼 단단하고 분명합니다. 자기 원칙이 있는 사람에게 끌리는 이들이 모입니다.',
  '辛': '다듬어진 보석처럼 섬세하고 예민합니다. 취향과 감각으로 기억되는 사람.',
  '壬': '큰 강처럼 깊고 넓습니다. 속을 다 보이지 않아 궁금해지는 사람.',
  '癸': '이슬비처럼 조용히 스며듭니다. 어느새 마음에 들어와 있는 사람.'
};
const CHARM = {
  '도화살': { title: '도화 — 눈길을 끄는 매력', core: '이성의 시선을 끄는 기운입니다. 특별히 애쓰지 않아도 관심이 모이고, 첫인상이 강하게 남습니다.', shadow: '관심이 많이 오는 만큼 구설도 따릅니다. 가벼운 호감과 진짜 인연을 구분하는 눈이 필요합니다.' },
  '장성살': { title: '장성 — 이끄는 사람의 매력', core: '앞에 서서 방향을 정할 때 빛나는 매력입니다. 결단력 있는 모습에 끌리는 사람이 옵니다.', shadow: '늘 이끌려 하면 상대가 지칩니다. 따라가 주는 순간도 매력이 됩니다.' },
  '반안살': { title: '반안 — 품격의 매력', core: '격이 있어 보이는 매력입니다. 함께 있으면 자신도 대접받는 느낌이 들어 곁에 두고 싶어집니다.', shadow: '거리감으로 읽힐 수 있습니다. 먼저 허물어 주는 한 마디가 필요합니다.' },
  '화개살': { title: '화개 — 깊이의 매력', core: '예술·종교·사색 쪽 깊이가 있는 매력입니다. 얕은 관계보다 오래 두고 알아갈수록 좋아지는 사람입니다.', shadow: '혼자의 시간을 너무 지키면 다가올 틈이 없어집니다.' },
  '역마살': { title: '역마 — 움직이는 매력', core: '활동적이고 어디든 가는 자유로움이 매력입니다. 새로운 곳에서 만나는 인연이 많습니다.', shadow: '머물지 않으면 관계가 깊어지기 전에 흘러갑니다.' }
};
const CHARM_ORDER = ['도화살', '장성살', '반안살', '화개살', '역마살'];

function readCharm(r) {
  const seen = new Set();
  const found = [];
  for (const key of pillarsOf(r)) {
    const p = r.manse[key];
    if (!p || !p.shinsals) continue;
    for (const raw of p.shinsals) {
      const name = stripBasis(raw);
      if (!CHARM[name] || seen.has(name)) continue;
      seen.add(name);
      found.push({ name, pillar: key, pillarKo: PILLAR_KO[key], ganzi: ganziKo(p), palace: PALACE[key], ...CHARM[name] });
    }
  }
  found.sort((a, b) => CHARM_ORDER.indexOf(a.name) - CHARM_ORDER.indexOf(b.name));
  const ilgan = r.ilgan;
  const base = ILGAN_CHARM[ilgan.char] || '';

  const headline = found.length
    ? `${ilgan.ko}(${ilgan.ohaeng}) 일간의 바탕에 ${iga(found.map((f) => f.name.replace('살', '')).join('·'))} 얹혀 있어요`
    : `${ilgan.ko}(${ilgan.ohaeng}) 일간 그대로의 매력이에요`;
  const lead = found.length
    ? '매력의 바탕은 일간이 정하고, 신살이 색을 더합니다. 아래 순서대로 읽으면 어떤 사람에게 어떻게 보이는지 그림이 그려집니다.'
    : '눈에 띄는 매력 신살은 없지만, 일간 자체가 주는 인상이 이 사주의 매력입니다. 꾸미지 않을 때 가장 잘 보이는 유형입니다.';

  return {
    kind: 'charm', title: '타고난 매력', headline, lead, pillars: pillarStrip(r),
    base: { ilgan: `${ilgan.char}(${ilgan.ko})`, ohaeng: ilgan.ohaeng, text: base },
    found,
    note: pillarsOf(r).length === 3 ? '태어난 시각이 없어 시주는 보지 못했습니다.' : null,
    upsell: { lead: '어떻게 보이는지는 알았어요. 그 매력이 실제 인연으로 이어지는 시기와, 같은 지점에서 자꾸 엇갈리는 이유까지 보려면요.', name: '애정·결혼운 심층 리딩', price: '3,900원', href: '/quick.html?topic=love' }
  };
}

const KINDS = { noble: readNoble, balance: readBalance, charm: readCharm };

function readFree(kind, birth) {
  const fn = KINDS[kind];
  if (!fn) throw new Error('알 수 없는 무료 리딩입니다: ' + kind);
  const r = computeSaju(birth);
  return fn(r);
}

module.exports = { readFree, KINDS: Object.keys(KINDS) };
