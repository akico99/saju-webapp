'use strict';
/* 사주 도감 해석 규칙표 — 엔진 값을 짧은 문구로 바꾼다. fieldGuide.js만 이 파일을 쓴다.
   원칙(기존 무료 리딩과 같음): 단정·공포 조장 금지, 결과를 보장하는 말 금지,
   의료·투자 조언 금지, 원국에 없는 걸 지어내지 않는다. */
const { hasBatchim } = require('./freeReadings');
const { SHIPSIN_GROUP, BRANCH_KO, STEM_OHAENG, BRANCH_MAIN_STEM } = require('./constants');

const eunneun = (w) => w + (hasBatchim(w) ? '은' : '는');

/* ---------- 오행 ---------- */
const OH_META = {
  '木': { name: '나무', hanja: '木', color: '#5E8A64' },
  '火': { name: '불', hanja: '火', color: '#C4553B' },
  '土': { name: '흙', hanja: '土', color: '#C39240' },
  '金': { name: '쇠', hanja: '金', color: '#A39D93' },
  '水': { name: '물', hanja: '水', color: '#2F4E78' }
};

/** 배터리 칸 수(최대 4)와 아래 표시 문구 */
function batteryLabel(n) {
  if (n === 0) return { cells: 0, label: '충전 필요' };
  if (n === 1) return { cells: 1, label: '조금' };
  if (n === 2) return { cells: 2, label: '적당' };
  if (n === 3) return { cells: 3, label: '꽉 참' };
  return { cells: 4, label: '과충전 주의' };
}

function ohaengSummary(oh, yong) {
  const els = Object.keys(oh);
  const max = Math.max(...els.map((o) => oh[o]));
  const strong = els.filter((o) => oh[o] === max).map((o) => OH_META[o].name).join('·');
  const lack = els.filter((o) => oh[o] === 0).map((o) => OH_META[o].name).join('·');
  let s;
  if (max <= 2 && !lack) s = '다섯 기운이 고르게 들어 있어요.';
  else if (lack) s = strong + ' 기운은 넉넉하고, ' + eunneun(lack) + ' 비어 있어요.';
  else s = strong + ' 기운이 두드러져요.';
  if (yong && OH_META[yong]) {
    const n = OH_META[yong].name;
    // 용신이 이미 많은 오행이면 "채운다"가 앞 문장과 부딪힌다 — 그때는 살려 쓰는 쪽으로 말한다.
    s += (oh[yong] || 0) >= 2
      ? ' 넉넉한 ' + n + ' 기운을 잘 살려 쓰면 편해져요.'
      : ' ' + n + ' 기운을 채워 주면 균형이 맞아요.';
  }
  return s;
}

/* ---------- 습성 (십성 그룹) ---------- */
const GROUP_META = {
  인성: { label: '배우고 생각하기', color: '#2F4E78' },
  비겁: { label: '내 힘 · 내 편', color: '#D5A542' },
  재성: { label: '현실 감각 · 돈', color: '#8C9AAE' },
  식상: { label: '말로 표현하기', color: '#C4553B' },
  관성: { label: '규칙 · 책임', color: '#5E8A64' }
};
const GROUP_ORDER = ['인성', '비겁', '재성', '식상', '관성'];
const HABIT_MAIN = {
  인성: { headline: '생각이 먼저 움직이는 습성', body: '배우고 곱씹으며 자기 안에서 먼저 답을 찾아요. 결론이 나기 전에는 말을 아끼는 편이에요.' },
  비겁: { headline: '내 방식대로 가는 습성', body: '스스로 정하고 스스로 해내는 게 편해요. 내 사람을 챙기는 마음도 커요.' },
  재성: { headline: '현실을 먼저 계산하는 습성', body: '지금 무엇이 실제로 도움이 되는지부터 봐요. 손에 잡히는 결과가 있어야 마음이 놓여요.' },
  식상: { headline: '꺼내야 풀리는 습성', body: '생각을 말이나 결과물로 꺼낼 때 기운이 돌아요. 표현할 곳이 막히면 답답함이 빨리 쌓여요.' },
  관성: { headline: '기준을 세우고 지키는 습성', body: '해야 할 일과 지킬 선을 먼저 확인해요. 맡은 책임을 가볍게 넘기지 않아요.' },
  고름: { headline: '고르게 쓰는 습성', body: '한쪽으로 크게 기울지 않아서, 상황에 맞춰 역할을 바꾸는 데 익숙해요.' }
};
const HABIT_MISSING = [
  ['식상', '말로 꺼내는 칸이 비어 있어서, 속으로는 정리가 끝났는데 “생각 좀 말해줘”라는 말을 듣기 쉬워요.'],
  ['관성', '정해진 틀이 적은 편이라, 스스로 기준을 세울 때 더 힘이 나요.'],
  ['재성', '눈앞의 계산보다 의미를 먼저 보는 편이라, 돈과 시간은 따로 적어 두면 좋아요.'],
  ['인성', '배운 걸 쌓아 두기보다 바로 해 보면서 익히는 쪽이에요.'],
  ['비겁', '혼자 밀어붙이기보다 함께할 사람이 있을 때 더 힘이 나요.']
];

function habit(groups) {
  const max = Math.max(...GROUP_ORDER.map((g) => groups[g]));
  const top = max <= 1 ? '고름' : GROUP_ORDER.find((g) => groups[g] === max);
  const miss = HABIT_MISSING.find(([g]) => groups[g] === 0);
  return {
    headline: HABIT_MAIN[top].headline,
    body: HABIT_MAIN[top].body,
    missing: miss ? miss[1] : null,
    legend: GROUP_ORDER.map((g) => ({ group: g, ...GROUP_META[g], count: groups[g] }))
  };
}

/* ---------- 특이 행동 (신살·형충) ---------- */
// 재살·천살·겁살·지살·월살·망신살·육해살·공망·비인살은 겁을 주기 쉬워 도감에 올리지 않는다.
const TRAITS = {
  천을귀인: { seal: '天乙', title: '도움이 닿는 자리', desc: '전통적으로 도움과 인연을 뜻하는 표지예요. 혼자 버티기보다 먼저 손을 내밀어 보세요.' },
  양인: { seal: '羊刃', title: '참다 터지는 화산', desc: '한번 마음먹으면 끝까지 밀고 가요. 꾹 참던 말이 한꺼번에 나올 수 있어요.' },
  괴강: { seal: '魁罡', title: '물러서지 않는 강단', desc: '옳다고 믿는 쪽으로 곧게 가요. 부드럽게 말하는 연습이 힘을 더해 줘요.' },
  도화살: { seal: '桃花', title: '눈길이 머무는 사람', desc: '애쓰지 않아도 첫인상이 오래 남는 편이에요.' },
  장성살: { seal: '將星', title: '자동 반장', desc: '가만있어도 앞에 서는 역할이 자주 돌아와요.' },
  역마살: { seal: '驛馬', title: '움직여야 사는 사람', desc: '한곳에 오래 머물면 답답해요. 이동과 변화 속에서 기운이 살아나요.' },
  화개살: { seal: '華蓋', title: '혼자만의 깊이', desc: '혼자 있는 시간에 생각과 취향이 깊어져요.' },
  문창귀인: { seal: '文昌', title: '글로 정리하는 힘', desc: '말보다 글로 정리할 때 생각이 또렷해져요.' },
  백호: { seal: '白虎', title: '세게 몰아붙이는 추진력', desc: '시작하면 끝을 볼 때까지 힘을 쏟아요. 서두를 때일수록 한 박자 쉬어 가요.' },
  반안살: { seal: '攀鞍', title: '품위 있는 안정감', desc: '자리를 갖추고 격을 지키려는 마음이 커요.' },
  암록: { seal: '暗祿', title: '숨은 비축', desc: '드러나지 않게 쌓아 둔 것이 필요할 때 힘이 되는 표지예요.' },
  협록: { seal: '夾祿', title: '곁의 든든함', desc: '양옆에서 받쳐 주는 기운을 뜻하는 표지예요.' },
  충: { title: '두 갈래 마음', desc: '서로 부딪히는 두 글자가 있어서, 머무를지 바꿀지를 자주 고민해요.' },
  자형: { seal: '自刑', title: '나에게 엄격한 사람', desc: '남보다 나 자신을 몰아세우기 쉬워요. 스스로에게 하는 말을 조금 부드럽게 해 주세요.' },
  형: { seal: '刑', title: '까다로운 기준', desc: '기준이 높아 부딪힘이 생기기 쉬워요. 규칙을 미리 맞춰 두면 편해요.' }
};
const TRAIT_ORDER = ['천을귀인', '양인', '괴강', '도화살', '장성살', '역마살', '화개살', '문창귀인', '백호', '반안살', '암록', '협록', '충', '자형', '형'];
const TRAIT_NONE = { seal: '平', title: '무난한 결', desc: '눈에 띄는 특별한 표지가 적은 사주예요. 한쪽으로 치우치지 않고 고르게 움직이는 편이에요.' };

function pickTraits(cands) {
  const out = [];
  for (const key of TRAIT_ORDER) {
    const c = cands.find((x) => (key === '충' ? x.type === 'chung' : x.key === key));
    if (!c) continue;
    const t = TRAITS[key];
    if (key === '충') {
      out.push({
        key: c.key, seal: c.branches.join(''), title: t.title,
        desc: t.desc + (c.weakened ? ' 다른 합에 묶여 있어서 세게 부딪히지는 않아요.' : '')
      });
    } else out.push({ key, seal: t.seal, title: t.title, desc: t.desc });
    if (out.length === 4) break;
  }
  return out.length ? out : [{ key: 'none', ...TRAIT_NONE }];
}

/* ---------- 성장 기록 (대운) ---------- */
const GROWTH_MAIN = {
  비겁: '내 힘으로 해 보려는 마음이 커지는 때',
  식상: '말과 재주를 밖으로 꺼내는 때',
  재성: '현실과 돈의 감각을 익히는 때',
  관성: '규칙과 책임을 배우는 때',
  인성: '배우고 채우며 생각이 깊어지는 때'
};
// 천간·지지 십성 조합이 뚜렷한 뜻을 가질 때 (순서 무관). 세부 십성 조합을 그룹 조합보다 먼저 본다.
// 상관+정관은 전통적으로 부딪힘(상관견관), 식신+편관은 식신이 칠살을 다스리는 구성(식신제살)이다.
const GROWTH_DETAIL = {
  '상관+정관': '하고 싶은 말과 지켜야 할 규칙이 부딪히는 때',
  '식신+편관': '재주와 실력으로 무거운 책임을 다스리는 때'
};
const GROWTH_PAIR = {
  '관성+식상': '하고 싶은 말과 맡은 책임 사이에서 균형을 잡는 때',
  '비겁+재성': '벌고 나누는 일 사이에서 균형을 찾는 때',
  '인성+재성': '공부와 현실 사이에서 저울질하는 때',
  '관성+인성': '맡은 자리에서 배우며 인정받는 때',
  '식상+재성': '재주가 결과와 돈으로 이어지는 때'
};
const pairKey = (a, b) => [a, b].sort().join('+');

function growthLine(item) {
  const sg = SHIPSIN_GROUP[item.stemShipsinKo];
  const bg = SHIPSIN_GROUP[item.branchShipsinKo];
  const line = GROWTH_DETAIL[pairKey(item.stemShipsinKo, item.branchShipsinKo)]
    || (sg && bg && sg !== bg && GROWTH_PAIR[pairKey(sg, bg)]) || GROWTH_MAIN[sg] || GROWTH_MAIN[bg] || '';
  const names = item.newOhaeng.map((o) => OH_META[o].name).join(' · ');
  const highlight = names ? '내게 없던 ' + names + ' 기운이 ' + (item.firstNew ? '처음 들어온 10년' : '다시 들어오는 10년') : null;
  return { line, highlight };
}

/* ---------- 올해의 관찰 기록 (세운) ---------- */
const YEAR_MAIN = {
  비겁: '내 뜻대로 밀고 가고 싶어지는 해예요. 혼자 다 하려 하기보다 같이 할 사람을 정해 두면 편해요.',
  식상: '하고 싶은 말과 재주가 밖으로 나오는 해예요. 작게라도 결과물을 만들어 보세요.',
  재성: '현실적인 계산이 바빠지는 해예요. 돈과 시간을 적어 두면 흐름이 보여요.',
  관성: '맡는 책임이 늘어나는 해예요. 약속과 기한을 먼저 정해 두면 덜 지쳐요.',
  인성: '배우고 채우는 일이 잘 붙는 해예요. 공부나 자격처럼 머리를 채우는 일에 좋아요.'
};
const CHUNG_OF = { 子: '午', 午: '子', 丑: '未', 未: '丑', 寅: '申', 申: '寅', 卯: '酉', 酉: '卯', 辰: '戌', 戌: '辰', 巳: '亥', 亥: '巳' };

function yearCard(item, ctx) {
  const parts = [];
  const over = [item.stemOhaeng, item.branchOhaeng].find((o) => o && ctx.ohaeng[o] >= 3);
  if (over) parts.push('이미 많은 ' + OH_META[over].name + ' 기운이 한 번 더 들어와요.');
  // 두 해 연속 같은 그룹이면 둘째 해는 지지 쪽 그룹으로 말해 같은 문장이 반복되지 않게 한다.
  let group = SHIPSIN_GROUP[item.stemShipsinKo];
  const branchGroup = SHIPSIN_GROUP[item.branchShipsinKo];
  if (group === ctx.prevGroup && branchGroup && branchGroup !== group) group = branchGroup;
  parts.push(YEAR_MAIN[group] || '');
  let label = null;
  if (item.shinsals.includes('천을귀인')) {
    label = '귀인의 해';
    parts.push('전통적으로 도움을 뜻하는 글자가 들어와서, 혼자 앓던 일을 사람에게 꺼내 볼 만해요.');
  }
  if (CHUNG_OF[ctx.dayBranch] === item.ganZhi[1]) {
    label = label || '변화의 해';
    parts.push('태어난 날의 글자와 부딪혀 생활에 변화가 생기기 쉬워요. 큰 결정은 서두르지 마세요.');
  }
  return { title: item.year + ' ' + item.ganZhiKo + '년', label, group, body: parts.filter(Boolean).join(' ') };
}

/* ---------- 어울리는 종 · 부딪히는 종 (상대의 띠) ---------- */
const ANIMAL = { 子: '쥐', 丑: '소', 寅: '호랑이', 卯: '토끼', 辰: '용', 巳: '뱀', 午: '말', 未: '양', 申: '원숭이', 酉: '닭', 戌: '개', 亥: '돼지' };
const SAMHAP = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];
const YUKHAP = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };

function chemistry(dayBranch) {
  const good = [...SAMHAP.find((g) => g.includes(dayBranch)).filter((b) => b !== dayBranch), YUKHAP[dayBranch]];
  const animals = (bs) => bs.map((b) => ANIMAL[b]).join('·') + '띠';
  const oh = (b) => (STEM_OHAENG[BRANCH_MAIN_STEM[b]] || {}).ohaeng;
  const mk = (kind, label, bs, line) => ({ kind, label, branches: bs.map((b) => ({ hanja: b, ko: BRANCH_KO[b], ohaeng: oh(b) })), animals: animals(bs), line });
  return [
    mk('good', '찰떡', good, '같이 있으면 손발이 잘 맞는 편이에요.'),
    mk('push', '밀당', [CHUNG_OF[dayBranch]], '끌리는데 자주 부딪혀요. 속도를 맞추면 서로 부족한 걸 채워 줘요.'),
    mk('mirror', '거울', [dayBranch], '너무 닮아서 서로의 고집이 잘 보여요.')
  ];
}

/* ---------- 좋아하는 것과 서식지 (용신 오행) ---------- */
const FAVORITES = {
  '木': { color: '초록 · 연두', place: '동쪽 자리, 식물 곁', season: '봄', act: '새로 시작하는 작은 일 하나, 숲길 산책', spell: '“일단 한 번 해 볼게.”' },
  '火': { color: '빨강 · 주황', place: '남쪽 창가, 밝은 자리', season: '여름', act: '사람 만나기, 햇볕 쬐기', spell: '“내 생각은 이래.”' },
  '土': { color: '노랑 · 베이지', place: '집 한가운데, 늘 앉는 자리', season: '환절기', act: '규칙적인 식사와 잠, 정리된 일정', spell: '“하던 대로 천천히 갈게.”' },
  '金': { color: '흰색 · 은색', place: '서쪽 자리', season: '가을', act: '하루 하나 끝내기, 서랍 정리', spell: '“이건 여기까지 할게.”' },
  '水': { color: '검정 · 남색', place: '북쪽 창가, 물가', season: '겨울', act: '물가 산책, 충분한 잠, 기록하기', spell: '“잠깐 생각해 보고 말할게.”' }
};
function favorites(yong) {
  const f = FAVORITES[yong];
  return {
    name: OH_META[yong].name,
    rows: [
      { label: '좋아하는 색', value: f.color },
      { label: '편한 자리', value: f.place },
      { label: '힘이 나는 때', value: f.season },
      { label: '기운 나는 일', value: f.act },
      { label: '마음속 주문', value: f.spell, hand: true }
    ],
    note: '재미로 참고해요.'
  };
}

module.exports = {
  OH_META, GROUP_META, TRAITS, TRAIT_ORDER, FAVORITES,
  batteryLabel, ohaengSummary, habit, pickTraits, growthLine, yearCard, chemistry, favorites
};

