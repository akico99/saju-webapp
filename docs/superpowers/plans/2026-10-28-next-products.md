# 다음 상품 세 가지: 2027 신년운세 · 다시, 우리(재회) · 두 사람의 궁합

2026-10-28. 연애 상품 「인연의 시기」(love.html, 14,900원)의 구조를 그대로 써서 세 상품을 만든다.
사용자 승인: "모두 진행". 판매 시작은 상품별 환경변수 스위치로 따로 연다(운영 기본값은 꺼짐).

## 공통 구조 (연애 상품과 같게)

참고 구현(읽고 따라 할 것, 고치지 말 것):
- 화면: public/love.html, public/love-app.js, public/love-assets/love-redesign.css, public/love-assets/reading.css
- 읽기 화면: public/love-reading-model.js(buildFree/buildPaid/splitBlocks/monthParts), public/love-reading-view.js(LoveReadingView.render)
- 서버: src/server/routes/love.js(무료 미리보기·유료 시작·PDF·메일), src/llm/loveTimingReading.js(묶음별 생성, 분량 보정 ASK_RATIO, 잘린 응답 재시도, 강조 보정 ensureHighlight, 검증)
- PDF: src/pdf/renderLoveHtml.js(요약 쪽 + 이어 흐르는 본문 + 2단 12개월, JPEG 그림), renderPdf 재사용
- 메일: src/db/reportDelivery.js(parseDelivery/create), src/email/loveReport.js(deliverReport — PRODUCTS에 상품 키가 이미 있다)
- 미리보기 스크립트: docs/preview/generate-love-examples.js, render-love-pdf.js, serve-generated.js

흐름:
1. 한 화면에 질문 하나씩(진행 막대, 이전 단계 수정 가능). 무료 첫 장까지 로그인 없음, AI 호출 없음(엔진 숫자만).
2. 무료 결과: 실제 계산값으로 만든 첫 장 + 잠금 카드 2~3개(잠긴 개인 결과를 DOM에 싣지 않는다) + 하단 고정 구매 버튼.
3. 구매 시트(<dialog>): 상품·가격·구성, PDF 받을 이메일 + 전달 동의(form=폼ID로 같은 폼에 묶는다), 약관 링크 → PayFlow(로그인/포인트/카드).
4. 유료 생성: 9,000~14,000자, 묶음 나눠 생성(첫 묶음 뒤 나머지 동시), 2~3문장 문단, 표지(근거·장면·해볼 일 등) 단독 줄, 장·달마다 핵심 구절 **굵게** 1~3곳, 단정·공포·상대 속마음 단정 금지. 숫자·날짜는 엔진 확정값만.
5. 완성: PDF 생성(목표 2MB 이하) → orders.markDone(resultPath) → deliverReport(jobId). 메일 실패는 주문을 실패로 만들지 않는다.
6. 결과 화면: 결론 상자, 그래프, 강한 세 달 카드 플립, 목차, 장 그림 배너 패럴랙스, 편집형 표지·쪽지 — 연애 결과 화면과 같은 디자인.
7. 마이페이지 보관함: 보기 + PDF.

그림: 새로 생성하지 않는다. public/love-assets/reading/*.webp(웹), src/pdf/assets/love/*.jpg(PDF)를 재사용한다.

## 공용 파일 — 하위 작업자는 고치지 않는다(/root가 통합)
src/server/app.js(정적·API 게이트, 라우터 등록), src/db/points.js(가격), src/server/products.js, src/server/routes/pay.js,
src/server/routes/download.js, src/server/routes/status.js, server.js, public/mypage.html, public/privacy.html,
public/love-assets/home.html, public/track.js, src/email/loveReport.js, src/db/reportDelivery.js,
public/love-reading-model.js, public/love-reading-view.js, public/love-assets/reading.css, public/love-app.js, public/love.html.
읽기 화면이나 공용 CSS에 바꿀 점이 있으면 정확한 변경을 /root에 메시지로 보낸다. 상품 전용 CSS·JS는 새 파일로 만든다.

가격: 세 상품 모두 14,900원(/root가 points.js에 넣는다).

## 상품별
### A. 2027 신년운세 (상품 키 new_year_2027, 기존 /new-year.html·/api/newyear, 스위치 NEWYEAR_ENABLED)
- 입력: 성별 → 생년월일(양·음력) → 태어난 시각(모름 가능) → 이름(선택) → 확인.
- 무료: 2027년 한 줄(총운 수준), 분기 흐름 네 칸, 오행·일간 한 장. 잠금: 가장 좋은 세 달·조심할 달, 네 주제.
- 유료 장: 2027 한 줄 답 / 2027 총운 / 가장 좋은 세 달과 조심할 달 / 재물운 / 일·직업운 / 애정운 / 건강·생활 리듬(의학 금지) / 분기별 할 것·피할 것 / 12개월 상세(흐름·해볼 일·점검).
- 숫자: src/llm/newYearReading.js의 buildNewYearData(엔진 monthlyFlow/yearlyFlow) 그대로.

### B. 다시, 우리 — 재회 (상품 키 reunion, 새 /reunion.html·/api/reunion, 스위치 REUNION_ENABLED, src/config/reunion.js)
- 입력: 나(성별·생년월일·시각) → 그 사람(성별·생년월일·시각 모름 가능, 이름 선택) → 헤어진 지(1개월 이내/1~6개월/6개월~1년/1년 이상) → 누가 먼저(내가/그 사람이/서로) → 지금 연락(가끔 연락/끊김/차단됨) → 확인.
- 무료: 두 사람의 네 기둥, 끌림·부딪힘 요약(engine/compatibility.analyzeCompatibility), 잠금 카드.
- 유료 장: 한 줄 답 / 우리가 끌렸던 이유 / 엇갈린 지점 / 그 사람의 성향(사주 성향만, 속마음 단정 금지) / 다시 이어질 흐름(12개월 중 신호가 강한 세 달 — 엔진 값) / 다가간다면, 멈춰야 할 신호 / 나를 위한 회복 / 12개월 상세.
- 안전: 재회를 약속·보장하지 않는다. '차단됨'이거나 상대가 거리를 원했으면 연락을 권하지 않고 경계 존중과 회복 중심으로 쓴다. 집착·감시·반복 연락을 부추기지 않는다. 결정은 본인 몫임을 분명히 한다.

### C. 두 사람의 궁합 (상품 키 compat_v2, 새 /couple.html·/api/couple, 스위치 COMPAT_V2_ENABLED, src/config/compatV2.js)
- 기존 /compat.html(4,900원 PDF)은 그대로 두고 새 상품을 만든다. 출시하면 /root가 기존 화면을 새 화면으로 연결한다.
- 입력: 관계(썸/연애 중/부부·예비부부/짝사랑) → 나 → 그 사람 → 확인.
- 무료: 두 사람의 네 기둥, 끌림·부딪힘 요약, 오행 보완 관계 한 장. 잠금 카드.
- 유료 장: 한 줄 답 / 서로 끌리는 이유 / 잘 맞는 결 / 부딪히는 지점과 푸는 법 / 연락·대화 방식 / 앞으로 12개월 두 사람의 흐름(engine + llm/compatTiming 확정값) / 관계를 지키는 행동 / 12개월 상세.

## 완료 기준(상품마다)
- node --test 로 상품 테스트 통과(실제 AI 호출 없음). 기존 테스트 깨지지 않음.
- 가상 인물 한 명으로 실제 AI 생성 1건 + PDF(docs/preview/<상품>-generated-*.json/.pdf, PDF는 커밋 제외) — 글자 수·시간·원가·PDF 크기 보고.
- /root에게 통합 요청 목록 보고: app.js 게이트 경로, 라우터 파일, 가격 키, products.js resolveProduct 분기, pay.js productOf, download 파일명, mypage 보기 링크.

