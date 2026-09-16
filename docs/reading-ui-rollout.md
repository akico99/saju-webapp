# 입력·풀이 UI 정리 (로컬 변경)

기준: `main`의 `c98baf2c8f6a38c1bcaa11348c5e58cd57f9f737`.

## 변경 범위

- `public/reading-ui.css`: 고객 화면 공통 입력란·카드·제목·버튼·운세 결과 스타일
- `public/life-graph.html`: 결론/수달 이미지/요약 → 그래프 → 행동 조언 → 해석 근거 → 상세풀이 순서로 재구성
- 무료: `today-preview.html`, `today-fortune.html`
- 풀이·결제 진입: `quick.html`, `compat.html`, `lifetime-report.html`, `life-topics.html`, `career-timing.html`, `birth-timing.html`, `date-select.html`, `reunion-check.html`
- 계정·프로필·목록: `login.html`, `signup.html`, `forgot-password.html`, `reset-password.html`, `profiles.html`, `charge.html`, `mypage.html`, `services.html`

## 의도적으로 유지한 부분

- 사주 계산 및 기존 점수 구간 해석표
- 무료/유료 권한, 가격, 결제 연결
- 기존 폼 필드명·API 요청·결과 렌더링 ID
- 메인 배너와 광고 랜딩, 관리자 페이지 디자인

## 검증

- `node --test test/ui-pages.test.js test/engine/*.test.js`: 45개 통과
- `git diff --check`: 통과
- `npm test`: 저장소의 `manual-*.js`가 자동 테스트로 수집되고, 얕게 복제한 폴더에 `lunar-javascript`/`puppeteer`가 설치되지 않아 실패. UI 변경의 실패로 보지 않음.
- 실제 모바일/PC 시각 검수와 결제 퍼널 회귀 테스트는 아직 수행하지 않음. 배포 전 확인 필요.

## 권장 수동 확인

1. 생년월일이 포함된 인생 그래프 URL에서 결과가 먼저 보이고 출생정보는 접히는지 확인
2. 10년/1년 탭과 그래프 드래그, 수달 해설·행동 조언·상품 CTA가 함께 변하는지 확인
3. 모바일 320/375/430px, PC 1024px에서 잘림·가로 스크롤이 없는지 확인
4. 오늘의 운세 비로그인 무료 결과, 회원 결과, 주제별 리포트의 카드 및 구매 링크 확인
5. 로그인·회원가입·포인트 충전 폼의 오류/성공 상태 확인

이 폴더는 원격 저장소에 자동 반영되지 않았다. 검수 후 변경을 리뷰하고 별도로 커밋·푸시해야 한다.
