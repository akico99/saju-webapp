# 기준 사주 묶음

프롬프트나 생성기를 바꾼 뒤, 같은 가상 인물 20명(상품마다 5명)으로 실제 결과를 다시 만들어 해석이 빠지거나 틀리지 않았는지 비교한다. 모두 지어낸 인물이며 실제 고객 정보는 넣지 않는다.

- `cases.json`: 입력. 상품은 love(연애 시기)·newyear(신년운세)·reunion(다시, 우리)·couple(두 사람의 궁합)이다. `hour: null`은 태어난 시각 모름, `isLunar: true`는 음력이다. `why`에는 이 사주를 기준으로 고른 이유(시각 모름, 배우자 자리 충, 화 과다 등)를 사람이 적는다.
- `checklist.json`: 사주를 아는 사람이 채우는 "꼭 들어가야 할 해석" 목록이다. 항목마다 `section`(장 key, 비우면 본문 전체), `expect`(기대하는 해석 한 문장), `keywords`(본문에 이 중 하나 이상 있으면 통과), `mustNot`(있으면 안 되는 표현)을 적는다. 비어 있는 항목은 보고서에 "미작성"으로만 잡힌다.

## 실행

실제 AI를 부르므로 자동 테스트에서는 실행하지 않는다(`test/reading-review.test.js`는 파일 형식과 채점 함수만 확인한다).

~~~text
node scripts/golden-run.js                       # 20건 전부(동시 2건)
node scripts/golden-run.js --product love         # 한 상품만
node scripts/golden-run.js --only love-01,couple-02
~~~

보고서는 `output/golden/golden-<시각>.md`(요약 표·누락 항목·자동 경고)와 `.json`(본문·근거·경고 전체)으로 남는다. 표에서는 다음을 본다.

- 체크 통과/누락/금지/미작성
- 자동 오류: factCheck가 재생성 뒤에도 남긴 틀린 사실 진술(오행 개수·일간·강한 달 순위)
- 자동 경고: 명식에 없는 십신·신살 이름, 12개월 범위 밖 날짜
- 근거 없는 장: 숨김 근거 줄(`<!-- 근거: ... -->`)을 빠뜨린 장

