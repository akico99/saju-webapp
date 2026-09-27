# 사주 도감 데이터 구조 (field guide contract)

무료 서비스 "사주 도감"의 결과 객체 설명이다. 화면(L1), API(L2), 공유 이미지(L3), 테스트(L6)는 이 구조만 보고 만든다.

- 생성: `readFieldGuide(birth, { name, now })` (src/engine/fieldGuide.js). birth는 computeSaju() 입력과 같다.
- LLM을 쓰지 않는다. 문구는 src/engine/fieldGuideRules.js(규칙표)와 src/engine/fieldGuideIlju.js(일주 60개)에서만 나온다.
- 같은 입력과 같은 now면 항상 같은 결과가 나온다. now를 넘기지 않으면 현재 시각을 쓴다.
- 샘플 기대값: test/fixtures/field-guide-1996.json

## 계산 기준

| 항목 | 기준 |
|---|---|
| 나이 | 한국 나이 (태어난 해 = 1살). 엔진 대운의 startAge와 같다 |
| 시각 모름 | 엔진이 정오로 가정한 시주를 오행·십성 개수, 신살, 합충에서 뺀다. pillars의 hour는 `unknown: true`. 용신(favorites)만 엔진 결과를 그대로 쓴다 |
| 올해 | 양력 연도. 입춘 전이어도 그해 간지를 보여준다 |
| 도감 번호 | 60갑자 순번 (갑자=1 … 무오=55 … 계해=60) |
| 이름 | 선택. 받침이 있으면 "이"를 붙인다 (지은 → 지은이, 호칭 지은아 / 수아 → 수아, 수아야). 비우면 "나", 호칭 null. 10자에서 자른다 |
| 케미 | 태어난 날의 지지 기준. 찰떡 = 삼합 두 지지 + 육합 지지, 밀당 = 충 지지, 거울 = 같은 지지. 상대의 띠(태어난 해 지지)와 맞춰 보는 용도 |

## 최상위 필드

| 필드 | 타입 | 화면 위치 | 내용 |
|---|---|---|---|
| version | number | – | 1 |
| name | { raw, display, vocative } | 제목, 메모 | display는 제목용("지은이 사주 도감"), vocative는 손글씨 호칭 |
| hourKnown | boolean | – | 시각 입력 여부 |
| note | string \| null | 표지 아래 작은 글씨 | 시각을 모를 때 안내 문구 |
| cover | 아래 표 | 표지 | 도감 번호, 별칭, 한 줄 소개, 태그 |
| pillars | Pillar[4] | 一 분류 기록 | 연·월·일·시 순서 |
| constitution | 아래 표 | 二 체질 | 오행 배터리 |
| habit | 아래 표 | 三 습성 | 십성 그룹 도넛 |
| traits | { items: Trait[≤4], basis } | 四 특이 행동 | 도장 + 별명 |
| growth | { items: Growth[≤5], basis } | 五 성장 기록 | 지금 대운이 가운데 오도록 5개 |
| yearly | { items: Year[2], basis } | 六 올해의 관찰 기록 | 올해, 내년 |
| chemistry | { items: Chem[3], basis } | 七 어울리는 종 · 부딪히는 종 | 찰떡, 밀당, 거울 순서 |
| approach | { items: {q,a}[3], basis } | 八 다가가는 법 | 일주 문구 |
| favorites | 아래 표 \| null | 九 좋아하는 것과 서식지 | 용신 오행 기준 |
| memo | { lines: string[3], hand } | 관찰자 수달의 메모 | hand는 손글씨 한 줄 |
| tags | string[] | 메모 아래 | 해시태그 |

각 섹션의 basis는 카드 아래 "근거 · …" 표시용 문자열이다. 일반인이 읽을 수 있게 쉬운 말을 앞에 쓰고 명리 용어는 괄호에 넣는다. 예: '그해에 들어오는 기운(세운)'.

### cover
| 필드 | 예 |
|---|---|
| no, total | 55, 60 |
| ilju, iljuKo | '戊午', '무오일주' |
| alias | '한여름 들판 위의 큰 산' |
| oneLine | '뜨거운 마음을 산처럼 묵묵히 품은 사람' |
| facts | [{label:'서식', value:'한여름 들판'}, {label:'체질', value:'불 3 · 흙 3 · 물 2'}, {label:'지금', value:'경인 대운 (26~35세)'}] (지금은 대운 전이면 없음) |

### Pillar
`{ key, label, meaning, unknown, isMe, stem, branch, stemKo, branchKo, stemOhaeng, branchOhaeng }`
unknown이 true면 key, label, meaning만 있다. isMe는 태어난 날 기둥에만 true (남색 강조 카드).

### constitution
- total: 글자 수 (8, 시각 모르면 6)
- items: 木火土金水 순서. `{ ohaeng, name('나무'), hanja, color, count, cells(0~4), label('충전 필요'|'조금'|'적당'|'꽉 참'|'과충전 주의') }`
- summary: 배터리 아래 한 문장

### habit
- headline, body: 가장 많은 십성 그룹의 설명
- missing: 비어 있는 그룹 한 문장 또는 null
- legend: 인성, 비겁, 재성, 식상, 관성 순서. `{ group, label, color, count }` (도넛 조각과 범례)
- groups: 그룹별 개수

### Trait
`{ key, seal, title, desc }`. seal은 도장 안 한자 2글자(충은 두 지지, 예 '子午'). 해당 없으면 key 'none' 하나.

### Growth
`{ startAge, endAge, startYear, ganZhi, ganZhiKo, stemOhaeng, branchOhaeng, stemShipsinKo, branchShipsinKo, isNow, newOhaeng, firstNew, line, highlight }`
원 안의 두 글자는 stemOhaeng, branchOhaeng 색으로 칠한다. isNow 카드에 "지금 여기". highlight가 있으면 굵게 먼저 보여준다.

### Year
`{ year, ganZhi, ganZhiKo, stemOhaeng, branchOhaeng, stemShipsinKo, branchShipsinKo, shinsals, title, label, group, body }`
label('귀인의 해' | '변화의 해' | null)이 있는 카드를 남색으로 강조한다.

### Chem
`{ kind('good'|'push'|'mirror'), label('찰떡'|'밀당'|'거울'), branches:[{hanja, ko, ohaeng}], animals('호랑이·개·양띠'), line }`

### favorites
`{ ohaeng, name, rows:[{label, value, hand?}], note, basis }`. rows는 좋아하는 색, 편한 자리, 힘이 나는 때, 기운 나는 일, 마음속 주문 순서. hand가 true인 행은 손글씨체.

