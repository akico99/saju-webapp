'use strict';
/* 날짜 선택(택일) 리포트 — 결정론적 계산(오행-용신 궁합, 주제별 십신, 일지 합충, 두 사람
   모드는 실제 궁합 계산)으로 이미 확정된 사실만 근거로, 잡지 칼럼 같은 톤의 개인화 리포트
   1편을 만든다. 절대 원칙: 엔진과 고정 매핑표(오행→색/맛/방위/사물/소재)에 없는 사실은
   지어내지 않는다 — "구체적으로 써달라"는 요청은 이 표 안에서 고르는 것으로 충족한다. */
const { generateText } = require('./client');

const SYSTEM_PROMPT = `당신은 명리학 지식을 바탕으로 라이프스타일 매거진에 칼럼을 쓰는 에디터입니다.

## 절대 원칙
1. 이번 턴에 전달된 정보(오행, 용신, 날짜·시간, 궁합 사실, 색/맛/방위/사물/소재 표)에 없는
   사실은 절대로 새로 지어내지 않습니다. 특히 실제 지리 정보(구체적 동네·상권), 공간 좌표
   (예: "현관 오른쪽"), 의학적 사실, 아이의 구체적 진로·직업은 전달된 자료에 없으면 쓰지
   않습니다.
2. 명리학 전문용어(충, 원진, 비견, 십신, 격국 등)를 절대 쓰지 않습니다. 이미 쉬운 말로
   풀어서 전달된 표현만 사용하세요. 이 문서를 읽는 사람은 사주를 전혀 모르는 일반인입니다.
3. 소수점이나 원시 점수를 그대로 인용하지 않습니다.
4. 수명·사망·불치병, 임신/낙태 성공·실패, 이혼·파산을 단정하지 않습니다. 부적·굿·비싼 개명을
   권하지 않습니다. 아이의 성격은 "이런 기질을 타고날 수 있어요" 정도의 참고 표현으로만
   쓰고, 특정 직업을 확정하듯 말하지 않습니다.
5. 순수 한국어 문장으로만 씁니다.
6. 따뜻하고 세련된 에세이 톤("~해요/~이에요")으로 씁니다. 두루뭉술한 조언 대신, 전달받은
   구체적 명사(색, 물건, 시간, 방향, 맛 등)를 실제로 문장에 넣어서 눈에 그려지게 씁니다.
7. 별표 두 개(**)로 각 문단마다 핵심 문장 1곳씩만 강조합니다. 남발하지 않습니다.
8. "임신·출산" 주제일 때는 이 리포트가 배란일·가임기 등 의학적 예측이 아니라는 점을 반드시
   짧게 짚어주고, 임신 성공·실패를 절대 단정하지 않습니다.

## 형식 (반드시 지킬 것)
- markdown 기호(#, ##, -, *, 1. 등)를 절대 쓰지 않습니다. 오직 강조용 별표 두 개(**단어**)만 씁니다.
- 리포트 맨 앞에 제목이나 인사말 줄("OOO 님을 위한 리포트", "안녕하세요" 등)을 만들지 않습니다.
  화면에 이미 이름과 리포트 종류가 표시되어 있으니, 바로 본문 첫 소제목부터 시작합니다.
- 전달된 소제목을 그대로, 줄 앞에 **굵게** 표시한 뒤 줄바꿈하고 바로 이어서 본문 문단을 씁니다.
  예시 형식 그대로 따르세요:
**언제가 좋을까**
본문 문단이 여기 이어집니다...

**방향과 동네 분위기**
본문 문단이 여기 이어집니다...
- 전체 1,500~2,000자 분량으로, 같은 말을 반복해서 분량을 채우지 말고 각 소제목마다
  전달받은 사실을 실제로 인용해 구체적으로 채웁니다.`;

function factLine(label, value) {
  return value ? `- ${label}: ${value}` : '';
}

function buildMovingPrompt(p) {
  const b = p.best;
  const facts = [
    factLine('이름', p.name || '(미입력)'),
    factLine('태어난 날의 기운/기질', `${p.personGanZhiKo}일생, ${p.temperament}`),
    factLine('필요한 기운(용신)', p.yongshinOhaengKo),
    factLine('목표 시기', `${p.targetYear}년 ${p.targetMonth}월`),
    b && factLine('가장 좋은 날짜·시간', `${b.year}.${b.month}.${b.day} ${b.hour}시 (${b.ganZhiKo}일·${b.hourGanZhiKo}시)`),
    p.extras.direction && factLine('추천 방향', `${p.extras.direction.direction} — ${p.extras.direction.note}`),
    p.extras.mood && factLine('어울리는 동네 분위기(은유, 실제 지역 예측 아님)', p.extras.mood),
    p.extras.homeObject && factLine('이사 당일 가장 먼저 들이면 좋은 물건', p.extras.homeObject),
    p.extras.currentAddress && factLine('현재 거주지(참고용, 문장에 자연스럽게 한 번만 언급)', p.extras.currentAddress)
  ].filter(Boolean).join('\n');

  return `${facts}

위 사실만 근거로 이사 리포트를 써주세요. 아래 소제목 순서로 구성합니다:
1) "언제가 좋을까" — 추천 날짜·시간과 그 이유
2) "방향과 동네 분위기" — 추천 방향과 동네 분위기(실제 지역명이나 좌표는 절대 언급하지 말고, 전달받은 은유적 분위기 표현만 사용)
3) "가장 먼저 들이면 좋은 물건" — 전달받은 물건과 그 물건을 왜 먼저 들이면 좋은지, 추천 시간대와 연결

목록에 없는 새로운 사실(구체적 동네명, 공간 좌표 등)은 만들어내지 마세요.`;
}

function buildOpeningPrompt(p) {
  const b = p.best;
  const facts = [
    factLine('이름', p.name || '(미입력)'),
    factLine('태어난 날의 기운/기질', `${p.personGanZhiKo}일생, ${p.temperament}`),
    factLine('필요한 기운(용신)', p.yongshinOhaengKo),
    factLine('목표 시기', `${p.targetYear}년 ${p.targetMonth}월`),
    factLine('준비 중인 업종', p.extras.industry || '(미입력)'),
    b && factLine('가장 좋은 개업 날짜·시간', `${b.year}.${b.month}.${b.day} ${b.hour}시 (${b.ganZhiKo}일·${b.hourGanZhiKo}시)`),
    p.extras.business && factLine('어울리는 사업 분야(키워드, 특정 사업 성패 단정 아님)', `${p.extras.business.field} — ${p.extras.business.note}`),
    p.extras.bizObject && factLine('공간에 두면 좋은 소품', p.extras.bizObject)
  ].filter(Boolean).join('\n');

  return `${facts}

위 사실만 근거로 개업 리포트를 써주세요. 아래 소제목 순서로 구성합니다:
1) "언제 문을 열까" — 추천 날짜·시간과 그 이유
2) "공간에 힘을 더하는 소품" — 전달받은 소품과 어디쯤(포스기 주변, 출입구 등 일반적인 위치 표현은 괜찮되 구체 좌표는 지어내지 말 것) 두면 좋은지
3) "흔들리지 않는 마음가짐" — 이 사람의 타고난 기질을 근거로, 사업 초반 불안을 다스리는 마인드셋 한두 가지

목록에 없는 새로운 사실은 만들어내지 마세요.`;
}

function buildWeddingPrompt(p) {
  const b = p.best;
  const c = p.compat;
  const compatLines = [];
  if (c.dayRelationType === 'yukhap' || c.dayRelationType === 'samhap') compatLines.push('두 사람의 배우자 자리(태어난 날의 기운)가 서로 잘 맞물려요.');
  if (c.dayRelationType === 'chung') compatLines.push('두 사람의 배우자 자리가 부딪히는 편이라 서로 다름을 이해하는 노력이 필요해요.');
  if (c.yukhapCount > 0) compatLines.push(`두 사람의 사주 곳곳이 자연스럽게 맞물리는 지점이 ${c.yukhapCount}군데 있어요.`);
  if (c.chungCount > 0) compatLines.push(`부딪히는 지점도 ${c.chungCount}군데 있어서, 의견을 맞추는 데 서로 노력이 필요해요.`);

  const facts = [
    factLine('신청자 이름', p.name || '(미입력)'),
    factLine('신청자 기질', `${p.personGanZhiKo}일생, ${p.temperament}, 필요한 기운은 ${p.yongshinOhaengKo}`),
    factLine('상대방 이름', p.spouseName || '(미입력)'),
    factLine('상대방 기질', `${p.spouseGanZhiKo}일생, ${p.spouseTemperament}, 필요한 기운은 ${p.spouseYongshinOhaengKo}`),
    factLine('목표 연도', `${p.targetYear}년`),
    b && factLine('두 사람 모두에게 좋은 날짜·시간', `${b.year}.${b.month}.${b.day} ${b.hour}시 (${b.ganZhiKo}일·${b.hourGanZhiKo}시)`),
    compatLines.length && factLine('두 사람의 실제 궁합 사실', compatLines.join(' ')),
    factLine('신청자에게 어울리는 웨딩 소재/색', `${p.extras.textureA}, ${p.extras.colorA}`),
    factLine('상대방에게 어울리는 웨딩 소재/색', `${p.extras.textureB}, ${p.extras.colorB}`)
  ].filter(Boolean).join('\n');

  return `${facts}

위 사실만 근거로 결혼 리포트를 써주세요. 아래 소제목 순서로 구성합니다:
1) "혼인신고, 이날이 좋아요" — 추천 날짜·시간과 두 사람 모두에게 좋은 이유
2) "두 사람의 실제 궁합" — 전달받은 궁합 사실을 자연스러운 문장으로 풀어서
3) "다툴 때 이렇게" — 두 사람의 기질 차이를 근거로, 다퉜을 때 상황을 악화시키지 않는 구체적인 대화 방식 한두 가지(예: 누가 먼저 말을 걸지, 어떤 톤으로)
4) "웨딩과 신혼집의 무드" — 전달받은 소재·색을 실제로 언급하며 어떤 분위기가 두 사람에게 잘 맞는지

목록에 없는 새로운 사실은 만들어내지 마세요.`;
}

function buildBirthPrompt(p) {
  const b = p.best;
  const facts = [
    factLine('부모님 이름', p.parentNames && p.parentNames.length ? p.parentNames.join(', ') : '(미입력)'),
    b && factLine('가장 오행이 골고루 갖춰지는 날짜·시간', `${b.year}.${b.month}.${b.day} ${b.hour}시 (${b.ganZhiKo}일·${b.hourGanZhiKo}시)`),
    b && factLine('그 순간 아이 사주에 비어있는 기운', p.lackingKo && p.lackingKo.length ? p.lackingKo.join('·') : '없음(다섯 기운이 고루 갖춰짐)'),
    p.temperament && factLine('그 순간 태어나면 강하게 나타나는 기질(태어난 날 기준)', p.temperament),
    p.taste && factLine('산모에게 도움이 될 만한 맛(부족한 기운을 보충하는 음식 맛)', p.taste)
  ].filter(Boolean).join('\n');

  return `${facts}

위 사실만 근거로 임신·출산 리포트를 써주세요. 아래 소제목 순서로 구성합니다:
1) "먼저 알아두세요" — 이 리포트는 배란일이나 가임기를 계산한 의학적 예측이 아니라, 명리학적으로 오행이 골고루 갖춰지는 좋은 시기를 참고하는 것뿐이라는 점을 짧게 밝힙니다.
2) "이 시기가 좋은 이유" — 추천 날짜·시간과 그 이유
3) "이 아이는 어떤 기질을 타고날까" — 전달받은 기질을 근거로, 특정 직업을 확정하지 말고 성향·강점 위주로 다정하게
4) "산모를 위한 작은 챙김" — 전달받은 맛을 활용해 이 시기 산모에게 도움이 될 만한 음식이나 마음가짐

목록에 없는 새로운 사실이나 의학적 조언은 만들어내지 마세요.`;
}

/**
 * @param {Object} p
 * @param {'moving'|'opening'|'wedding'|'birth'} p.topic
 * @returns {Promise<string>}
 */
async function generateDateSelectReport(p) {
  const builder = { moving: buildMovingPrompt, opening: buildOpeningPrompt, wedding: buildWeddingPrompt, birth: buildBirthPrompt }[p.topic];
  if (!builder) throw new Error('알 수 없는 리포트 주제입니다: ' + p.topic);
  const prompt = builder(p);
  const { text } = await generateText(SYSTEM_PROMPT, prompt);
  return text.trim();
}

module.exports = { generateDateSelectReport };
