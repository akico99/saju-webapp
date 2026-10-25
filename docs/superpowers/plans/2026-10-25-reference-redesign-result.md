# 레퍼런스 재설계 결과

- 비공개 브랜치 codex/love-funnel에 메인 미리보기 /love-assets/home.html 및 연애 상품 상세 /love.html 구현.
- 신규 원화 중심 표지, 카테고리 메뉴, 고민 카드, 기존 상품 연결, 무료 풀이, 하단 탐색 메뉴 추가.
- 상품 상세에 고민 공감, 여울 소개, 일곱 장 구성, 풀이 형식 견본, 무료/유료 범위, 고정 시작 버튼 추가. 입력과 무료 결과 색상 통일.
- 기존 다른 상품 상세는 이번 변경 대상이 아니며 기존 화면으로 연결됨.
- 현재 사용한 원화는 내장 image_gen으로 새로 생성한 미리보기용 자산. 다른 세션에서 사용자가 만든 캐릭터 원본과 동일하다고 주장하지 않음.
- 원화 경로: public/love-assets/yeoul-cover.png
- 검증: node --test --test-concurrency=1 "test/**/*.test.js" 200개 통과, 실패 0.
- 320/390/1280px 메인 및 상품 화면 가로 넘침 없음. 메인 고민 선택 → 입력 상태 반영, 고정 버튼, 실제 무료 생성 → 재입력 → 로그인 이동 확인.
- LOVE_TIMING_ENABLED=false일 때 신규 홈/원화/CSS도 404 확인.
- 유료 생성은 이번에 호출하지 않음. 운영 배포 및 가격 변경 없음.
- 로컬 서버 4610 및 임시 터널 실행. 외부 접속에서 새 메인 렌더링 확인.

## 원화 프롬프트 (내장 image_gen 사용)

Create a polished Korean romance fantasy webtoon promotional key visual, vertical 2:3 composition, NO text NO letters NO logo. Original adult female character 'Yeoul', a warm clever relationship guide for brand Saju Otter. Beautiful adult Korean woman in her late twenties, glossy deep chestnut long hair loosely half-up, two tiny subtle round otter-ear shaped gold hair ornaments (human face, no animal ears), luminous hazel eyes, friendly knowing smile, elegant ivory hanbok-inspired blouse with muted jade teal silk collar and gold delicate details, coral red ribbon held gently between natural hands. Waist-up portrait at center-right occupying 70% of frame, head fully within top 12%-48% of frame. Rich deep petrol-teal moonlit garden, large softly glowing cream moon behind her head, flowing water and a few camellia blossoms, delicate luminous fireflies, high-end otome game and Korean webtoon illustration quality, refined detailed line art with lush painted lighting, premium elegant romantic mood. Lower 30% transitions to very dark teal with subtle water ripples and quiet space suitable for an HTML title overlay. No border, no UI, not a mockup. The portrait is the hero artwork itself. Render crisp beautiful editorial-grade digital painting.
