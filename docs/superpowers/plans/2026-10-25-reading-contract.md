# 결과 화면 구현 계약 및 진행 기록

사용자 승인: 2026-10-25 "글꼴도 밤티나게 하지 말고 작업 진행해".
기존 비공개 워크트리 codex/love-funnel에서 실행. 이전 미커밋 변경 보존.

## 고정 인터페이스
public/love-reading-model.js: UMD/CommonJS, window.LoveReadingModel.
- buildFree(reading, person) -> {kind:'free', title, lead, name, situation, chapters, original, facts}
- buildPaid(report, options={}) -> {kind:'paid', title, lead, chapters, original, months}
- chapters: [{id, title, scene, blocks:[{type:'heading'|'speech'|'prose'|'action', text}], ...optional}]
- scene: greeting/explain/empathy/thinking/caution/cheer/meeting/distance/conversation/new-start
- facts for free: {pillars, note, balance, seasons, seasonLead, locked}. Preserve existing server arrays and labels. No made-up calculations.
- months: [{month, text}] parsed existing report. Never drop original; original contains exact input report.
- Each chapter blocks split on paragraphs or semantic sentence boundaries without truncation. No HTML interpretation. Free chapters derive exclusively existing preview fields.
- Paid 7 logical chapters: top, attraction (drawn/draws with their labels retained), where, pattern, caution, action, months. Unknown/legacy sections retained as additional chapters.

public/love-reading-view.js: window.LoveReadingView
- render(container, model, {reportId, visual}={}) -> cleanup function
- uses DOM text nodes, never injects generated model text as HTML.
- visual is existing server-generated chart HTML, parent will retain legacy chart outside new renderer; ignore visual here.
- no network calls; only static /love-assets/reading/{scene}.webp images.
- images have graceful error fallback (hide art, preserve text).
- CSS scoped .lr-reader. UI font: Noto Sans KR/system sans; headings limited Gowun Batang serif. 16–18px prose, ~1.85 line height; word-break:keep-all + overflow-wrap:anywhere, dynamic height.
- long text below art. Overlay only a short fixed chapter label; do not place user-specific prose over faces.
- Free facts charts/season selection and optional pillars details in renderer; paid month selector and original details.
- Checklist only explicit action blocks; persist IDs/booleans and chapter ID under versioned per-report key. Never persist prose or birth data.
- No automatic scroll on render: offer resume control. Free no cross-user reading persistence.
- Fixed/sticky chapter navigation must not overlap main purchase buttons; prefer inline sticky top navigation.
- reduced-motion supported, keyboard accessible, no timed text gating.

Parent integration ownership: love.html, love-app.js, app static gate, image assets, preview fixture/demo page, end-to-end tests.
Model worker ownership: love-reading-model.js and test/love-reading-model.test.js only.
View worker ownership: love-reading-view.js and public/love-assets/reading.css only.
Documentation worker: docs/superpowers/plans/2026-10-25-reading-assets.md only.

## Ledger
- Preflight: existing model data is text based and generation credits previously insufficient. Ruling: preserve original and fallback; expose explicitly labeled synthetic preview independent of paid generation; separately attempt actual generator validation.
- Preflight: free payload has no paid text. Ruling: use only supplied preview data for all free blocks, no new LLM generation.
- Preflight: feature gate only covers specific love file names and /love-assets. Ruling: parent adds new renderer/model script names to gate and tests.
- Started: data adapter GPT-6 Luna; visual renderer Claude Sonnet 5.5; documentation Claude Haiku 5.5.

## 통합 기록 — 2026-10-25
- 무료 6장과 유료 7장을 love.html 결과 흐름에 연결. 기존 표시를 fallback으로 남기고 어댑터/렌더러 오류가 나면 복원한다.
- 개인별 본문은 DOM text로 출력한다. 기존 서버 차트는 paidTimeline으로 분리해 새 결과가 표시되어도 숨지 않는다.
- 공통 그림 10종 WebP 연결. 고객마다 이미지 API를 호출하지 않는다. 글은 이미지 아래에, 짧은 고정 라벨만 이미지 하단에 둔다.
- 실생성 검증: 독립 임시 DB의 가상 계정으로 Claude API 호출 성공. 약 90초, 3,956자. 고객 정보가 아닌 예시를 reading-example.json으로 추출해 demo에 제공한다.
- OpenAI 별도 검토 실행은 사용량 한도로 중단되어 Claude Sonnet 검토로 대체했다. 원문 손실/강조 문법 노출/읽던 위치 초기 덮어쓰기/월별 차트 숨김 문제를 수정했다.
- 첫 전체 테스트 실행: 210 passed, 0 failed. 추가 브라우저 회귀 테스트와 최종 실행 결과는 아래에 기록한다.
- 비운영 미리보기: /love-assets/reading-demo.html (무료), #paid (실제 생성 유료 예시). 기존 가격·결제·고객 풀이 모델·운영 배포는 변경하지 않는다.
