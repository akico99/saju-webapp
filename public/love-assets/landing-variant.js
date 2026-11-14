'use strict';
/* 랜딩 메시지 맞추기: 광고에서 온 URL 파라미터(concern, hook)에 따라 히어로 질문과 예시 인용만 바꾼다.
   모든 글은 textContent로 넣는다. 값이 없거나 허용 목록 밖이면 기본(S1용)을 그대로 둔다.
   예시 인용 조각은 public/love-assets/reading-example.json 의 paid 원문에서 글자 그대로 가져온 것이다(… 는 생략 표시).
   test/love-landing-variant.test.js 가 조각마다 원문에 있는지 확인한다. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LoveLandingVariant = api;
  if (typeof document !== 'undefined') {
    const run = () => api.apply(document, root.location && root.location.search);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SOURCE = '한 줄 답'; // 기본 인용: '## 한 줄 답' 문단
  const ANSWER_QUOTE = ['12개월 중 인연 신호가 가장 강한 달은 2026년 11월이에요.', '이 달엔 먼저 다가가서 만남을 구체적으로 제안해 보세요.'];
  const PATTERN_QUOTE = ['정작 수달님은 그럴 의도가 없었는데도 거리가 생기는 일이 반복될 수 있어요.']; // '## 반복되기 쉬운 연애 패턴' 문단 끝 문장
  const QUESTION = {
    default: '내 연애가 가장 강해지는 세 달, 언제일까요?',
    some: '이 썸, 언제 분명해질까요?',
    single: '내 다음 인연은, 언제쯤 올까요?',
    dating: '지금 이 연애, 앞으로 어떻게 흘러갈까요?',
    breakup: '이별 뒤, 다음 인연은 언제쯤 올까요?',
    pattern: '좋은 말만 하는 사주 말고, 내가 반복하는 연애 패턴부터',
  };
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  function pick(search) {
    let params;
    try { params = new URLSearchParams(search || ''); } catch (e) { params = new URLSearchParams(''); }
    const hook = params.get('hook'), concern = params.get('concern');
    if (hook === 'pattern') return { key: 'pattern', question: QUESTION.pattern, quote: PATTERN_QUOTE, lead: true };
    if (concern && concern !== 'default' && own(QUESTION, concern) && concern !== 'pattern') return { key: concern, question: QUESTION[concern], quote: ANSWER_QUOTE };
    return { key: 'default', question: QUESTION.default, quote: ANSWER_QUOTE };
  }
  const quoteText = (pieces, lead) => '“' + (lead ? '… ' : '') + pieces.join(' … ') + '”';
  function apply(doc, search) {
    const v = pick(search);
    const q = doc.getElementById('heroQuestion');
    const quote = doc.getElementById('heroQuote');
    if (q) q.textContent = v.question;
    if (quote) quote.textContent = quoteText(v.quote, v.lead);
    if (doc.body && doc.body.dataset) doc.body.dataset.landingVariant = v.key;
    return v;
  }
  return { pick, apply, quoteText, QUESTION, ANSWER_QUOTE, PATTERN_QUOTE, SOURCE };
});

