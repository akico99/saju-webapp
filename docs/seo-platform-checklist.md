# 대표가 확인할 검색 플랫폼 체크리스트

대상: **https://sajuotter.com** · 작성일: 2026-10-07 · 상세 운영 기준: [seo-monitoring-plan.md](seo-monitoring-plan.md)

현재 계정 등록·실제 색인·노출·클릭은 미확인입니다. 이미 완료한 항목은 상태만 확인하면 됩니다. 토큰/확인 파일은 공개 인증용 자료만 전달하고 비밀번호·개인 키는 전달하지 않습니다.

## 0. 등록 현황 (2026-10-07 기록)

| 도구 | 상태 | 비고 |
|---|---|---|
| 구글 서치콘솔 | URL 접두어 속성(`https://sajuotter.com/`)과 도메인 속성(`sajuotter.com`) 모두 소유확인 완료 | 도메인 속성은 Cloudflare DNS의 TXT 레코드로 인증했다. 그 레코드를 지우면 인증이 풀리므로 삭제하지 않는다 |
| 구글 사이트맵 | `https://sajuotter.com/sitemap.xml` 제출 (9월 29일 최초, 10월 7일 재제출) | 최초 제출 후 10월 6일에 성공으로 읽혔고 12개 주소를 발견했다 |
| 네이버 서치어드바이저 | `https://sajuotter.com` 등록·소유확인 완료 | 홈페이지 `naver-site-verification` 메타 태그로 인증했다. `scripts/buildSeo.js`가 관리하므로 지우지 않는다 |
| 네이버 사이트맵 | `sitemap.xml` 제출 완료 (10월 7일) | 수집·색인 결과는 며칠 뒤 확인한다 |
| 빙 웹마스터 도구 | `https://sajuotter.com/` 등록·소유확인 완료 | 홈페이지 `msvalidate.01` 메타 태그로 인증했다 |
| 빙 사이트맵 | `https://sajuotter.com/sitemap.xml` 제출 (처리 중) | |

구글 28일 성과 기준선(10월 7일 조회): 클릭 0, 노출 1. 색인 6개, "발견됨 - 현재 색인이 생성되지 않음" 6개.
아래 항목 중 이미 끝난 것은 상태만 확인하면 된다.

## 1. 먼저: 구글·네이버·빙 등록과 기준선

- [ ] **Google Search Console**: [접속](https://search.google.com/search-console/about) → 기존 `sajuotter.com` 속성 확인 → 없으면 속성 추가·소유확인. 도메인 속성은 DNS 인증, URL 접두어 속성은 도구가 제공하는 인증 방법 선택. 파일/meta 방식이면 제공된 원본을 에이전트에게 전달해 반영 후 확인.
- [ ] 구글 사이트맵에 `https://sajuotter.com/sitemap.xml` 제출/기존 처리 상태 확인. 홈·무료 도감·궁합 URL 검사에서 색인 여부·마지막 수집일·Google 선택 canonical·실패 사유 저장. 신규/변경 핵심 URL만 필요한 경우 재수집 요청.
- [ ] **네이버 서치어드바이저**: [접속](https://searchadvisor.naver.com/) → 웹마스터 도구 → `https://sajuotter.com` 등록/소유확인 상태 확인. 도구에서 받은 HTML 파일 또는 head용 meta 원본을 에이전트에게 전달. 기존 IndexNow 형식 `.txt`는 네이버 인증 완료 증거가 아님. [인증 안내](https://searchadvisor.naver.com/guide/faq-start-register)
- [ ] 네이버 요청 → 사이트맵 제출에 위 sitemap URL 확인. 홈·도감·궁합 URL 검사에서 수집/색인 상태·사유 저장. RSS는 현재 필수 작업 없음; 글 발행용 RSS가 마련된 뒤 제출. [제출 안내](https://searchadvisor.naver.com/guide/request-feed)
- [ ] **Bing Webmaster Tools**: [접속](https://www.bing.com/webmasters/) → 기존 사이트 확인 → 없으면 직접 인증 또는 GSC 가져오기 선택(Google 접근 동의 필요). sitemap 처리와 핵심 URL 검사 확인. [등록 안내](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b)
- [ ] 세 도구에서 **완료된 최근 28일**의 노출·클릭·CTR, 주요 검색어/페이지, 색인 수·오류 사유를 날짜/기간과 함께 CSV 또는 화면으로 저장. 데이터가 없으면 '미확인/아직 데이터 없음' 표시. 0건과 구분.

## 2. 다음: 다음 검색·공유 미리보기

- [ ] [다음 등록조회](https://register.search.daum.net/searchForm.daum?act=search)에서 대표 홈 확인 → 미등록이면 신규등록. 제목 `사주보는 수달`, 설명 초안 `만세력으로 풀이하는 한국어 AI 사주와 PDF 리포트` 사용; 실제 신청 화면의 업종 자료·사업 정보 확인 후 제출. 이미 등록됐다면 변경 필요 여부만 확인. [등록 기준](https://register.search.daum.net/info.daum?act=guidet1)
- [ ] 기존 카카오톡 채널을 사이트 검색에 연결하려면 채널 URL·소유확인 완료 후 요청. 신규 채널 개설은 운영할 채널이 필요할 때만 진행.
- [ ] OG 문구/이미지 변경 때 [카카오 도구 안내](https://developers.kakao.com/docs/ko/tool/common)에 따라 URL 메타정보 조회 → 캐시 초기화 → 새 공유 미리보기 확인. 기존 모든 메시지의 자동 갱신은 미확인.
- [ ] 소셜 게시를 시작할 계정의 소유·관리 권한을 확인하고 확정된 소재/게시 초안 게시. 플랫폼별 UTM 링크 사용. 계정 접속·최종 외부 게시가 필요한 항목만 사용자 담당.

## 3. 반복: 자료 전달과 경보 대응

- [ ] **주간**: 검색 도구에서 새 색인 제외·사이트맵 오류·수집 장애 확인. 새 문제의 URL·사유·날짜만 전달.
- [ ] **월간**: 같은 조건의 완료된 28일 대 이전 28일 성과와 페이지/검색어 자료 전달. 변경 배포 후 14일은 중간 확인, 효과 판단은 4주 이상.
- [ ] **분기**: 세 도구의 소유확인 유지·알림 수신 상태 확인.

**사용자 작업 제외:** IndexNow 키/제출 기술 구현, SEO 메타·본문·JSON-LD·sitemap 수정, 자동 점검은 에이전트 담당. Google Business Profile과 네이버 플레이스·카카오맵 등록은 현재 온라인 전용 서비스에는 추진하지 않음. 별도 플랫폼 유료 가입이나 광고 구매도 이 목록에 포함하지 않음.
