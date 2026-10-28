/* 여덟 글자 표 배치 — 표 HTML은 서버(src/pdf/sajuChart.js)가 엔진 값으로만 만든다.
   무료 사주 분석: 상품 화면의 간단한 네 기둥 상자를 표로 바꾼다. 유료 결과: 그래프와 함께 온 표를 그래프 앞으로 옮긴다. */
(function () {
  'use strict';
  function frag(html) { var t = document.createElement('template'); t.innerHTML = html; return t.content; }
  window.SajuChart = {
    replace: function (target, html) { if (target && html) target.replaceWith(frag(html)); },
    lift: function (visualEl) {
      if (!visualEl) return;
      setTimeout(function () {
        var charts = [].slice.call(visualEl.querySelectorAll('.saju-chart'));
        if (!charts.length) return;
        var anchor = visualEl.closest('.lr-summary-chart') || visualEl.parentNode;
        charts.forEach(function (c) { anchor.parentNode.insertBefore(c, anchor); });
      }, 0);
    }
  };
})();

