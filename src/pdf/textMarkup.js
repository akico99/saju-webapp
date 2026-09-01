'use strict';
/* LLM이 쓴 평문에 최소한의 마크업만 입혀 강조를 준다.
   - **강조할 문구** → <mark> (형광펜 강조, systemPrompt가 챕터당 2~5곳만 쓰도록 지시)
   - (괄호 안 설명) → <span class="gloss"> (전문용어를 그 자리에서 풀어쓴 부분 — 이미
     systemPrompt 규칙 9가 괄호로 풀어쓰게 하고 있으므로 별도 마커 없이 괄호 자체를 활용)
   LLM 출력은 신뢰하는 소스이지만, 원문에 <, >, & 가 섞여 있어도 레이아웃이 깨지지 않도록
   먼저 이스케이프한 뒤 마크업을 얹는다(순서가 바뀌면 우리가 넣은 태그까지 이스케이프됨). */

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkup(text) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<mark>$1</mark>');
  out = out.replace(/(\([^()]{2,}\))/g, '<span class="gloss">$1</span>');
  return out;
}

module.exports = { renderMarkup };
