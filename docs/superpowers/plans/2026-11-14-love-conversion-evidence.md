# 연애 결과의 구매 이유와 추적 신뢰성 개선 실행 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가격을 유지하며 재현 가능한 이벤트 대기 문제를 고치고, 실제 생성 샘플과 전체 풀이의 구매 이유를 검토 가능한 화면으로 만든다.

**Architecture:** 기존 track.js의 GA/Meta 전송을 Kakao 로딩과 분리한다. 기존 광고 유입 저장과 분석 사업자만 이용하며 별도 방문자 DB·새 식별자·외부 사업자는 추가하지 않는다. 연애 페이지의 버전과 소재 표기를 기존 이벤트에 붙이고 입력 시작을 구분한다. 결과 상단 카드에서 무료/전체 풀이 차이와 실제 생성 원문을 설명한다.

**Tech Stack:** 기존 CommonJS Node/Express, vanilla JS/CSS, node:test, 기존 Puppeteer 통합 테스트와 ego-browser 육안 확인.

**Spec:** 광고소재 `소재/003-ORIGINAL-일1만원/문제진단-대안-2026-11-14.md` 4~7절, 사용자 ‘진행해’ 승인. 제안 중 측정·구매 이유 개선 범위이며 신규 광고 게시/예산/가격/배포는 포함하지 않는다.

## Global Constraints

- 14,900원 유지. 기존 무료 정보와 결제 필수 동의는 줄이거나 숨기지 않는다.
- 이름·생년월일·이메일·풀이 원문을 추적 이벤트에 넣지 않는다. 서버 attributionEnabled 게이트를 유지한다.
- 광고/계정/배포 변경 없음. main에 push하지 않는다.
- 스크롤 이벤트는 완독·고유 사람 수가 아니다. 이전 누락 방문을 복원했다고 주장하지 않는다.
- 샘플은 가상 인물의 실제 생성 원문 발췌이며 실제 구매 후기/예측 보장으로 표시하지 않는다.

## Review Focus

- Kakao 스크립트가 영원히 대기하거나 실패해도 GA/Meta 이벤트는 전송되며 Kakao 성공 시 대기 이벤트가 중복되지 않는다.
- 설정 실패·시행 전에는 유입/버전 저장을 활성화하지 않는다.
- 다른 상품이나 잘못된 URL 값이 연애 버전/소재로 잘못 표기되지 않는다.
- 작은 화면에서 샘플·가격·버튼이 잘리지 않고 샘플을 열지 않아도 구매 범위를 알 수 있다.
- 결제 후 재방문(jobId)은 신규 상품 방문이나 입력 시작으로 부풀리지 않는다.

## Task 1: 추적 전송 격리와 이벤트 맥락

**Files:** public/track.js, public/love.html, public/love-app.js, test/tracking-funnel-events.test.js, test/tracking-attribution.test.js.
**Interfaces:** 기존 SoTrack API 유지. 추가 `inputStart(productKey)`는 상품별 세션 첫 입력만 기록. 이벤트 공통 선택 속성 `creative_id`, `page_version`; 페이지 meta `so-product-key`, `so-page-version`. 후속 결제 화면은 sessionStorage의 해당 상품 버전만 읽는다.

- [ ] RED: Kakao callback 미발생 상태에서 실제 track.js의 view/Lead/Unlock가 GA/Meta에 전달되는지 테스트한다. 이어 callback 성공 시 Kakao 이벤트가 한 번 전송되는지 확인한다.
- [ ] GREEN: Kakao 전용 대기열을 분리하고 최대 100개로 제한. 오류 시 비우고, 성공 시 한 번 실행한다. GA/Meta flush와 autoViewItem은 설정 성공 직후 실행한다. 서버 설정 실패를 임의 활성화로 처리하지 않는다.
- [ ] RED/GREEN: 세션별 입력 시작, 소재/버전 전달, 상품 분리, 잘못된 문자열 제거, 시행 전 저장 금지를 테스트하고 최소 구현한다.
- [ ] `node --test test/tracking-funnel-events.test.js test/tracking-attribution.test.js` → 전부 통과.
- [ ] 코드·테스트 커밋.

## Task 2: 실제 원문과 전체 풀이의 가치

**Files:** public/love-app.js, public/love.html, public/love-assets/love-redesign.css, test/love-browser.test.js, docs/preview/love-offer-source.md.
**Interfaces:** hookCard(third)의 기존 세 달 카드와 openCheckout 경로 유지. 원문은 기존 public/love-assets/reading-example.json의 paid에서 발췌하며 현재 PAID_SAMPLE 조각을 보존한다. 샘플은 ‘흐름 해석’과 ‘해볼 일’을 나누어 읽게 하고 생략을 표시한다.

- [ ] 기존 예시의 원문·가상 인물 표시·생략 범위를 기록한다. 샘플 JSON의 과거 price 값은 현재 UI에 사용하지 않는다.
- [ ] 상단 카드에 ‘전체 풀이에서 이어지는 내용’ 3항목(12개월 흐름/관계 패턴과 만남의 자리/상황별 행동), 무료 범위 한 줄을 추가한다. 샘플은 접근 가능한 details로 길이를 조절한다.
- [ ] 고정·상단 버튼을 ‘12개월 연애 풀이 전체 보기 · 14,900원’으로 맞춘다. 결제 시트의 제공 방식·가격·동의를 유지한다.
- [ ] 기존 모바일 통합 테스트의 구매 창 진입·무료 정보 보존·넘침 검증을 유지하고 샘플 details 열기/닫기 후 구매 동작을 확인한다. 단순 카피 문자열 자체를 새 단위 테스트로 만들지 않는다.
- [ ] `node --test test/love-free-hook.test.js test/love-browser.test.js` → 전부 통과.
- [ ] 360/390/430px ego-browser 미리보기 확인·스크린샷 저장. 광고비 발생/운영 고객 결제 없음.

## Task 3: 검증·검토·인계

- [ ] 전체 `npm test` 실행, 결과와 한계 기록. 테스트가 만든 기존 preview 산출물은 이 작업의 변화만 되돌린다.
- [ ] 전체 diff를 새 리뷰어가 읽고 중요 문제는 수정 후 관련 테스트 및 전체 검증을 마친다.
- [ ] 광고소재 저장소에 실물형/행동형 두 방향 카피·샘플 출처·도착지 조건을 기록한다. 검토 전 광고 이미지를 대량 생성하지 않는다.
- [ ] 코드와 근거를 커밋하고 현황을 갱신한다. 배포·광고 재집행은 별도 최종 실행 단계로 남긴다.

## 실행 기록

- Ruling: native create_worktree 호출이 응답 없이 지연되어 중단한 뒤 git worktree 목록에 생성이 없는 것을 확인하고 기존 .worktrees 규칙에 따라 CLI로 격리 작업 공간을 생성했다. 뒤늦게 native 작업이 생성되더라도 그 공간은 건드리지 않는다.
- Ruling: 새 방문자 저장 서버 대신 기존 GA/Meta 이벤트 맥락을 보강한다. 기존 방침·저장 범위를 유지하며 작게 수정하기 위함이다. 따라서 과거 9회 차이의 개별 원인을 소급 복원하거나 독립적인 서버 방문 원장을 제공하지는 못한다.
