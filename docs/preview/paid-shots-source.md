# 유료 리포트 실물 이미지 출처 (2026-11-14)

랜딩 '풀이 미리보기' 스트립과 무료 결과에 쓰는 public/love-assets/preview/paid-1~3.webp 의 원본과 만든 방법.

- 내용: public/love-assets/reading-example.json 의 가상 인물 '수달'(situation: some)에 대해 실제 AI가 생성한 전체 풀이(paid, visual)를 유료 읽기 화면(love-reading-view)으로 렌더한 것. JSON notice: "가상 인물의 정보로 실제 생성한 화면 예시입니다. 고객님의 분석 결과가 아닙니다." 이름 외 개인정보 없음.
- 띄운 방법: docs/preview/serve-example.js (로컬 전용, 임시 DB, 가상 결제 완료 주문 preview-example 에 위 예시를 붙임. 운영 데이터·결제·메일 연결 없음). 기존 serve-generated.js 와 같은 방식이다.
- 캡처: docs/preview/capture-paid-shots.js 가 390×844 deviceScaleFactor 2 로 찍고(원본 PNG 780×1688은 docs/preview/paid-shots-source/paid-N.png), 위쪽에 띠 '전체 풀이 예시 화면 · 가상 인물'을 합성한다. 장면 위치는 paid-shots-source/scenes.json.
- webp: docs/preview/make-paid-webp.js 가 휴대폰 테두리를 씌워 폭 720px, 품질 80으로 저장.

| 파일 | 장면 | 원본 |
| --- | --- | --- |
| paid-1.webp | 01 인연 신호가 강한 세 달: 1위 달(2026년 11월)과 해볼 일 두 가지 | paid-shots-source/paid-1.png |
| paid-2.webp | 한 줄 답과 앞으로 12개월 연애 흐름 그래프 | paid-shots-source/paid-2.png |
| paid-3.webp | 02 서로 끌리는 이유: 나에게 끌리는 사람 | paid-shots-source/paid-3.png |

## 한계

- 읽기 화면의 문장은 아직 용어가 섞인 현재 버전이다(스펙의 쉬운 말 개편은 다른 작업자 범위). 개편 뒤 같은 스크립트로 다시 찍을 수 있다: `node docs/preview/capture-paid-shots.js && node docs/preview/make-paid-webp.js`.
- 세 달 카드 영역(paid-2 아래)은 아직 '눌러서 보기' 카드 모양이다.

