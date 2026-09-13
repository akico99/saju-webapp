# 카카오톡 상담 랜딩페이지(consult.html) 작업 정리

다른 로컬 환경에서 이어서 작업할 때 참고하는 문서입니다. GitHub 저장소를 clone한 뒤
이 문서부터 읽으면 이 페이지가 왜 이런 구조인지, 뭐가 되어 있고 뭐가 안 되어 있는지
빠르게 파악할 수 있습니다.

## 서비스 개요

- 서비스명: 사주보는 수달 (실제 만세력 엔진으로 사주를 계산해 PDF 리포트를 만들어주는 서비스)
- 사업자: 길잡이 여울 · 대표 이용수 · 사업자등록번호 279-25-01684
- 배포: https://sajuotter.com (Render.com, `main` 브랜치 push 시 자동 배포)
- 저장소: `akico99/saju-webapp` (GitHub)
- 스택: Node.js/Express, EJS 템플릿, better-sqlite3, PDF는 Puppeteer + pdf-lib로 직접 렌더링

## 이 랜딩페이지가 왜 필요했나

- PG(카드결제) 심사가 아직 안 끝나서, 지금은 카드결제를 웹에서 바로 받을 수 없음
- 그래서 소셜미디어(Threads 등) 바이오 링크로 들어오는 콜드 트래픽을 위해 "정보만 남기고
  카카오톡 채널에서 상담 → 계좌이체로 결제 → 리포트 전달"하는 방식의 별도 랜딩페이지를 만듦
- 기존 메인 홈페이지(`public/index.html`)는 여러 상품을 파는 스토어형이라, 평생사주 100p
  단일 상품을 강하게 후킹하는 용도로는 안 맞아서 새로 분리함
- 디자인은 사용자가 준 두 개의 참고자료를 거쳐 지금 형태로 정착됨:
  1차로 `ieum-saju.sajulab.kr`(실제 경쟁 서비스) 벤치마킹 → "숫자 조작 없이, 리뷰 강조 없이"라는
  조건으로 `public/premium.html` 제작 → 이후 사용자가 준 Gemini 초안(정갈한 세리프+산세리프,
  크림톤, 에디토리얼한 톤)을 참고해 지금의 `public/consult.html`로 재작성

## 파일 위치

| 파일 | 용도 |
|---|---|
| `public/consult.html` | **지금 실제로 쓰는 랜딩페이지** (완성, 배포됨) |
| `public/premium.html` | 이전 버전 — 로그인+포인트충전 필요한 셀프서비스형. 지금은 안 씀. PG 연동되면 "바로 카드결제" 버전으로 재사용할 목적으로 지우지 않고 남겨둠 |
| `public/admin-leads.html` | 관리자용 — consult.html 폼으로 들어온 상담 신청 목록 확인/상태 변경 |
| `src/db/leads.js` | leads 테이블 CRUD |
| `src/server/routes/leads.js` | `POST /api/leads`(공개), `GET/POST /api/admin/leads`(관리자) |
| `public/samples/hong-gildong-lifetime.pdf` | 가상 인물 "홍길동" 이름으로 실제 파이프라인 그대로 생성한 97페이지 샘플 PDF |
| `public/samples/slides/*.png` | 히어로 슬라이드 이미지. `cover-hook.png`/`table-hook.png`/`chapter1-hook.png`가 화면에 실제로 쓰이는 크롭본. `cover.png`/`table.png`/`chapter1.png`는 크롭 전 원본(크롭 스크립트의 입력으로 계속 필요하니 지우면 안 됨) |
| `scripts/generateSamplePdf.js` | 샘플 PDF를 실제 LLM 호출로 다시 만드는 스크립트 (비용 발생, 자동 실행 안 됨) |
| `scripts/generateSampleSlides.js` | 슬라이드 원본 이미지(cover/table/chapter1 .png)를 다시 만드는 스크립트 |
| `scripts/cropSampleSlides.js` | 위 원본에서 화면에 보여줄 영역만 잘라 `-hook.png`로 저장 |

## consult.html 섹션 구성 (위→아래)

1. **히어로** — 브랜드 로고, 태그라인, 실제 샘플 리포트 슬라이드 3장(자동 슬라이드 + 점 네비게이션),
   카카오톡 채널 CTA 버튼, "정보만 먼저 남기기" 링크
2. **공감 카드 4개** — 진로/관계/멈춤과 나아감/타이밍
3. **철학 섹션** — "사주는 정해진 결말이 아니라 일기예보" 비유
4. **"계산"이라고 말하는 이유** — 만세력 계산 → 진태양시 보정 → 대운수 계산 → 격국·용신 판정,
   4단계로 실제 계산 과정을 구체적으로 설명 (← 사용자가 명시적으로 강조를 요청한 포인트)
5. **리포트 소개** — 실제 18개 챕터 전체 목록(2열 그리드) + 기능 하이라이트 카드 4개(대운 그래프,
   오행·십신 차트, 챕터별 계산 키워드 칩, 개운법 체크리스트) + 가격(14,900원) + 샘플 PDF 다운로드
   버튼 (← 이것도 사용자가 명시적으로 강조를 요청한 포인트)
6. **신청 절차 4단계** — 정보입력 → 카카오톡 채널에서 결제안내 → 실제 만세력 엔진으로 계산 →
   PDF 리포트 전달
7. **FAQ 4개** — 시간 모를 때, 나쁜 사주, 결과물 받는 시점, 부적/굿 강요 여부
8. **정보입력 폼**(`#apply`) — 이름(선택)/성별/생년월일/양음력/태어난 시간(모름 체크)/고민(선택)/
   연락처(선택) → 제출 시 `POST /api/leads`로 저장 후 카카오톡 채널을 새 탭으로 자동 오픈
9. **최종 CTA** — 카카오톡 채널 버튼 재노출
10. **푸터** — 사업자 정보(상호/대표/사업자번호/주소/문의 이메일)

카카오톡 채널 링크(히어로/폼 제출 후/최종 CTA 세 군데 모두 동일):
`http://pf.kakao.com/_KxaRxaX/chat`

## 백엔드 — leads

`leads` 테이블(`src/db/index.js`에서 생성): `name, gender, birth_year/month/day/hour/minute,
hour_unknown, is_lunar, concern, contact, status(new/contacted/done), created_at`

- `POST /api/leads` — 인증 불필요(콜드 트래픽 대상이라 로그인 요구 안 함)
- `GET /api/admin/leads`, `POST /api/admin/leads/:id/status` — `requireAdmin` 필요,
  `admin-leads.html`에서 사용. 기존 `admin.html`/`admin-orders.html` 상단 네비게이션에
  "상담 접수 →" 링크로 연결되어 있음

## 이번 세션에서 고친 버그 — 슬라이드 크롭

처음엔 히어로 슬라이드를 `.sample-slide { height: 300px; overflow: hidden }` +
`object-fit: cover; object-position: top`로 구현했는데, 이 방식은 **컨테이너 너비가
넓어질수록(모바일→데스크톱) 실제로 보이는 원본 영역이 오히려 줄어드는** 역설적인 문제가
있었습니다(너비 기준으로 이미지 스케일을 맞추고 남는 높이만 잘라내는 구조라, 너비가 넓을수록
"보여지는 높이"에 해당하는 원본 픽셀 수가 줄어듦). 데스크톱 화면에서는 표지 3줄 요약이
아예 안 보일 정도로 심하게 잘렸습니다.

**해결**: 화면에서 CSS로 자르는 대신, PNG 파일 자체를 미리 원하는 영역까지만 잘라
별도 파일(`*-hook.png`)로 저장하고, `consult.html`에서는 그 이미지를 원본 비율 그대로
(`width:100%; height:auto`) 보여주기만 합니다. 이러면 뷰포트 너비와 무관하게 항상 같은
내용이 보입니다.

**주의**: 나중에 슬라이드 이미지를 다시 만들 일이 있으면(예: 다른 가상 인물로 교체,
디자인 변경 등) 반드시 `generateSampleSlides.js`로 원본을 만든 뒤 `cropSampleSlides.js`까지
다시 돌려서 `-hook.png`를 갱신해야 합니다. 원본만 바꾸고 크롭을 안 돌리면 화면엔 반영되지
않습니다(consult.html은 `-hook.png`만 참조함).

## 알려진 제약 / 결정 사항

- **PG 미승인 상태**: 이 페이지는 카드결제가 아니라 "카카오톡 채널 안내 → 계좌이체" 흐름을
  전제로 설계됨. PG 연동되면 `premium.html`(로그인 후 바로 카드결제/포인트차감) 쪽을 다시
  꺼내 쓰는 방향을 고려 중.
- **premium.html은 의도적으로 보존 중** — 삭제 요청 없었음.
- **샘플 PDF/슬라이드는 진짜 결과물**: 더미 텍스트가 아니라 가상 인물 "홍길동"
  (1990-05-15 14:30 양력 남성, 서울 기준)의 생년월일시로 실제 만세력 엔진 + 실제 LLM
  18챕터 생성을 그대로 돌려서 만든 것. 이 사람이 실제로 존재하는 인물은 아님을 유의.
- **숫자 조작 금지 / 리뷰 강조 금지** 원칙 — 참고했던 경쟁 서비스(이음사주)는 가짜 정가/할인율,
  실시간 접수 알림, 가짜 마감 임박 카운터, 후기 강조 등을 쓰는데, 이 페이지는 그런 장치를
  전혀 쓰지 않기로 사용자가 명시적으로 정함. 앞으로 이 페이지를 수정할 때도 이 원칙 유지 필요.

## 로컬 실행 방법

1. `npm install`
2. 프로젝트 루트에 `.env` 파일 필요(레포에는 없음 — `.gitignore`에 포함되어 있어 git에 안 올라감,
   다른 로컬에서는 새로 만들어야 함). 필요한 키:
   ```
   ANTHROPIC_API_KEY=
   PORT=4500
   SESSION_SECRET=
   ADMIN_PASSWORD=
   DEPOSIT_ACCOUNT_INFO=
   BASE_URL=
   NAVER_CLIENT_ID=
   NAVER_CLIENT_SECRET=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   KAKAO_CLIENT_ID=
   KAKAO_CLIENT_SECRET=
   RESEND_API_KEY=
   RESEND_FROM=
   RESEND_FROM_NAME=
   ```
   consult.html 자체는 `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD` 정도만 있어도
   충분히 확인 가능(소셜로그인/이메일발송 키는 이 페이지와 무관).
3. `node server.js` → `http://localhost:4500/consult.html`
4. 샘플 PDF/슬라이드를 다시 만들 때만(평소엔 필요 없음):
   ```
   node scripts/generateSamplePdf.js       # 실제 API 비용 발생, 몇 분 소요
   node scripts/generateSampleSlides.js    # cover.png / table.png / chapter1.png 생성
   node scripts/cropSampleSlides.js        # 위 원본에서 -hook.png 크롭본 생성
   ```

## 참고 — 배포

`git push origin main`하면 Render가 자동으로 재배포합니다. 별도 빌드 설정 필요 없음
(Node 서버가 `public/`을 정적 파일로 그대로 서빙).
