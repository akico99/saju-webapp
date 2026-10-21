# 연애 시기 리포트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 무료 첫 장 → 19,900원 잠금 해제 → 모바일 결과로 이어지는 연애 시기 리포트를 환경변수 게이트 뒤에 만든다.

**Architecture:** 엔진 계산(무료)과 LLM 본문(유료)을 분리한다. 무료는 src/engine/loveTiming.js가 기존 freeReadings·monthlyFlow를 조합하고, 유료는 src/llm/loveTimingReading.js가 한 번 호출한다. 결제·주문·환불은 기존 pay.js·points·orders 흐름에 상품만 추가한다.

**Tech Stack:** Node.js, Express, better-sqlite3, node:test, 바닐라 JS 페이지

**Spec:** docs/superpowers/specs/2026-10-22-love-timing-design.md

## Global Constraints

- 상품 키 love_timing, 가격 19900, 결제 상품 종류 'love', 페이지 /love.html
- 게이트 환경변수 LOVE_TIMING_ENABLED (1|true|yes|on), 기본 꺼짐
- 무료 응답에 달별 점수·달 이름 없음
- 테스트 명령: node --test --test-concurrency=1 "test/**/*.test.js"
- 문구는 한국어, 점수 숫자 인용 금지, BASE_RULES 준수

## Review Focus

- 시각 모름: 시주 없이 무료·유료 모두 동작
- 12개월이 해를 넘김(11월 시작): 계절 라벨 "2026년 11월~2027년 1월"
- LLM이 소제목을 빼먹음: 남은 장만 보여주고 전체 실패하지 않음
- 로그인 후 복귀: 입력값 복원 뒤 무료 첫 장 자동 재표시
- 게이트 우회 주소(/love%2Eh tml 같은 인코딩): 404

---

### Task 1: 게이트와 상품 등록

**Files:** Create src/config/loveTiming.js, test/love-timing-gate.test.js. Modify src/db/points.js, src/server/products.js, src/server/routes/pay.js(productOf), src/server/routes/tracking.js, src/server/app.js

**Produces:** loveTimingConfig = { enabled, productKey:'love_timing', priceKrw:19900 }; resolveProduct('love', form) → { productKey:'love_timing', price:19900, label:'연애 시기 리포트 — 이름', page:'/love.html', start }

- [ ] 실패 테스트: 꺼짐이면 /love.html·/love-app.js·/love.css·/api/love/preview·인코딩 변형 404, SELLABLE·카탈로그 제외, resolveProduct null. 켜짐이면 SELLABLE 포함·카탈로그 이름 '연애 시기 리포트'·resolveProduct 가격 19900
- [ ] 구현, 테스트 통과, 커밋

### Task 2: 무료 첫 장 엔진

**Files:** Create src/engine/loveTiming.js, test/love-timing.test.js

**Produces:** SITUATIONS, buildLoveTiming(engine, gender, now) → { months, top3, seasons, strongCount }, buildLovePreview(birth, situationKey, now)

- [ ] 실패 테스트: seasons 4칸 각 3개월, 해 넘김 라벨, top3 점수 내림차순·동점 이른 달, preview JSON에 'month' 키 없음, 시각 모름 기둥 3개, 잘못된 상황 오류
- [ ] 구현, 통과, 커밋

### Task 3: 유료 본문 생성

**Files:** Create src/llm/loveTimingReading.js, test/love-timing-reading.test.js

**Produces:** buildLovePrompt(engine, person, situationKey, timing), parseLoveText(text, situationKey), toPlainText(reading), generateLoveReading(engine, person, situationKey)

- [ ] 실패 테스트: 프롬프트에 상위 세 달 "YYYY년 M월"과 상황 장 제목 포함, 파싱이 소제목 누락·월별 줄 형식 오류를 견딤, toPlainText 섹션 순서
- [ ] 구현, 통과, 커밋

### Task 4: 결과 그래프와 API

**Files:** Create src/pdf/loveVisual.js, src/server/routes/love.js, test/love-timing-route.test.js. Modify src/server/app.js

**Produces:** loveWebHtml(timing) → 막대 12개(상위 세 달 강조) HTML, POST /api/love/preview, POST /api/love(requireAuth), start(userId, body)

- [ ] 실패 테스트: visual 막대 12개·강조 3개, preview 200 필드·400, /api/love 401, 로그인·잔액 0 → 402
- [ ] 구현, 통과, 커밋

### Task 5: 화면

**Files:** Create public/love.html, public/love-app.js, public/love.css. Modify public/mypage.html(완료된 love_timing 주문에 "보기" 링크), test/ui-pages.test.js

- [ ] 실패 테스트: love.html이 loveForm·freeResult·unlockBtn·paidResult id, pay-flow.js·point-notice.js를 갖고 스크립트 문법 오류 없음, 마이페이지 보기 링크
- [ ] 구현, 통과, 커밋
- [ ] 로컬 서버(LOVE_TIMING_ENABLED=true)에서 390px 육안 확인

### Task 6: 실제 생성 확인

**Files:** Create test/manual-love-reading.js

- [ ] 실제 API로 1회 생성, 말투·분량·금지 규칙 확인, 필요하면 프롬프트 수정 후 커밋

