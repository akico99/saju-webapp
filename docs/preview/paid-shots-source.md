# 유료 리포트 실물 이미지 출처 (2026-11-14)

랜딩 '풀이 미리보기' 스트립과 무료 결과에 쓰는 public/love-assets/preview/paid-1~3.webp 의 원본과 만든 방법.

- 내용: docs/preview/love-generated-plain-some.json (가상 인물 '서연', 쉬운 말 새 샘플, 커밋 7124410)의 실제 AI 생성 전체 풀이를 유료 읽기 화면(love-reading-view, 커밋 7d52177 상태)으로 렌더한 것. 이름 외 개인정보 없음. (2026-11-14 교체. 이전 이미지는 public/love-assets/reading-example.json '수달' 예전 문장이었고, 'legacy' 인자로 다시 찍을 수 있다.)
- 띄운 방법: docs/preview/serve-example.js [포트] [plain|legacy] (기본 plain). 로컬 전용, 임시 DB, 가상 결제 완료 주문 preview-example 에 샘플의 toPlainText 본문과 loveWebHtml 그래프를 붙임. 운영 데이터·결제·메일 연결 없음.
- 캡처: docs/preview/capture-paid-shots.js 가 390×844 deviceScaleFactor 2 로 찍고(원본 PNG 780×1688은 docs/preview/paid-shots-source/paid-N.png), 위쪽에 띠 '전체 풀이 예시 화면 · 가상 인물'을 합성한다. 장면 위치는 paid-shots-source/scenes.json.
- webp: docs/preview/make-paid-webp.js 가 휴대폰 테두리를 씌워 폭 720px, 품질 80으로 저장.

| 파일 | 장면 | 원본 |
| --- | --- | --- |
| paid-1.webp | 01 인연 신호가 강한 세 달: 1위 달(2027년 4월)과 장면·해볼 일 | paid-shots-source/paid-1.png |
| paid-2.webp | 한 줄 답과 앞으로 12개월 연애 흐름 그래프 | paid-shots-source/paid-2.png |
| paid-3.webp | 02 서로 끌리는 이유: 나에게 끌리는 사람(장면) | paid-shots-source/paid-3.png |

## 한계

- 샘플 파일이 바뀌면 같은 두 스크립트로 다시 찍는다: node docs/preview/capture-paid-shots.js plain && node docs/preview/make-paid-webp.js
- paid-2 그래프 아래 고정 안내문 '흐름은 명리 해석을 위한 비교값이며…'에 '명리'라는 말이 남아 있다(읽기 화면 코드의 고정 문구).
- 세 달 카드 영역(paid-2 아래)은 아직 '눌러서 보기' 카드 모양이다.

