'use strict';
/* 이름 미입력(빈 문자열/공백) 시 표지·본문·프롬프트 어디서나 같은 규칙으로 대체하기 위한
   공용 유틸. 이전에는 파일마다 제각각 `person.name || 'X'` 식으로 처리하다 보니
   "평생사주 님의 평생사주"(폴백 단어를 이름 자리에 그대로 넣음), "A/B"(개발용 임시값
   노출), 빈 문자열(문장 앞에 어색한 공백) 같은 서로 다른 문제가 났었다. 이제 이름이
   필요한 모든 곳(EJS 템플릿, LLM 프롬프트 빌더)이 이 함수 하나만 거친다. */

/**
 * @param {string} [name] 사용자가 입력한 이름(빈 문자열/공백/undefined 가능)
 * @param {string} [fallback='고객'] 이름이 없을 때 대신 쓸 말 — 두 사람이 나오는
 *   상품(궁합)에서는 '본인'/'상대방'처럼 구분되는 값을 넘긴다.
 * @returns {string} 항상 비어있지 않은 문자열
 */
function safeName(name, fallback = '고객') {
  const trimmed = (name || '').trim();
  return trimmed || fallback;
}

module.exports = { safeName };
