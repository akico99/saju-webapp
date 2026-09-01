'use strict';
/* Chart.js 설정 빌더 — 오행 막대/십신 도넛/대운 타임라인.
   천문성좌(다크) 테마에 맞춘 채도 낮춘 팔레트 — 별자리 마커 같은 톤으로 통일.
   여기서는 config 객체만 만들고, 실제 렌더는 renderHtml.js가 삽입하는 인라인 스크립트가 담당한다. */

// 오행 → 별자리 마커 색 (전통 오방색을 어둡고 채도 낮은 톤으로 재해석)
const OHAENG_COLOR = { '木': '#6f9376', '火': '#b5573f', '土': '#c7a13a', '金': '#aab0ba', '水': '#4d6f92' };
const OHAENG_ORDER = ['木', '火', '土', '金', '水'];

const TEXT_COLOR = '#c9cde0';
const MUTED_COLOR = '#8d96b8';
const GRID_COLOR = 'rgba(141,150,184,0.18)';
const FONT_FAMILY = "'Malgun Gothic','맑은 고딕',sans-serif";

const BASE_FONT = { family: FONT_FAMILY, size: 12 };

function ohaengBarConfig(counts) {
  return {
    type: 'bar',
    data: {
      labels: OHAENG_ORDER.map(k => `${k} (${counts.ohaengGrade[k]})`),
      datasets: [{
        label: '오행 개수',
        data: OHAENG_ORDER.map(k => counts.ohaeng[k]),
        backgroundColor: OHAENG_ORDER.map(k => OHAENG_COLOR[k]),
        borderRadius: 3
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: '오행 분포', color: TEXT_COLOR, font: { ...BASE_FONT, size: 14 } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, color: MUTED_COLOR, font: BASE_FONT }, grid: { color: GRID_COLOR } },
        x: { ticks: { color: TEXT_COLOR, font: BASE_FONT }, grid: { display: false } }
      }
    }
  };
}

/* 오행 균형을 오각형(레이더)으로 — 막대그래프보다 "찌그러진 정도 = 불균형"이
   한눈에 들어온다. 최댓값은 실제 데이터의 최댓값+1로 잡아 항상 여유를 둔다. */
function ohaengRadarConfig(counts) {
  const values = OHAENG_ORDER.map(k => counts.ohaeng[k]);
  const maxVal = Math.max(...values, 1) + 1;
  return {
    type: 'radar',
    data: {
      labels: OHAENG_ORDER.map(k => `${k} (${counts.ohaengGrade[k]})`),
      datasets: [{
        label: '오행 개수',
        data: values,
        backgroundColor: 'rgba(199,161,58,0.18)',
        borderColor: '#c7a13a',
        borderWidth: 2,
        pointBackgroundColor: OHAENG_ORDER.map(k => OHAENG_COLOR[k]),
        pointBorderColor: OHAENG_ORDER.map(k => OHAENG_COLOR[k]),
        pointStyle: 'star',
        pointRadius: 7,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: '오행 밸런스', color: TEXT_COLOR, font: { ...BASE_FONT, size: 14 } }
      },
      scales: {
        r: {
          beginAtZero: true,
          max: maxVal,
          ticks: { stepSize: 1, display: false, backdropColor: 'transparent' },
          grid: { color: GRID_COLOR },
          angleLines: { color: GRID_COLOR },
          pointLabels: { color: TEXT_COLOR, font: BASE_FONT }
        }
      }
    }
  };
}

const SHIPSIN_GROUP_COLOR = { '비겁': '#8d96b8', '식상': '#6f9376', '재성': '#c7a13a', '관성': '#b5573f', '인성': '#9b7fb5' };
const SHIPSIN_ORDER = ['비겁', '식상', '재성', '관성', '인성'];

function shipsinDonutConfig(counts) {
  return {
    type: 'doughnut',
    data: {
      labels: SHIPSIN_ORDER.map(k => `${k} (${counts.shipsinGroupGrade[k]})`),
      datasets: [{
        data: SHIPSIN_ORDER.map(k => counts.shipsinGroup[k]),
        backgroundColor: SHIPSIN_ORDER.map(k => SHIPSIN_GROUP_COLOR[k]),
        borderColor: '#0f1420',
        borderWidth: 2
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: TEXT_COLOR, font: BASE_FONT } },
        title: { display: true, text: '십신 그룹 분포', color: TEXT_COLOR, font: { ...BASE_FONT, size: 14 } }
      }
    }
  };
}

const { PRODUCES, CONTROLS, STEM_OHAENG, BRANCH_MAIN_STEM } = require('../engine/constants');

/* 대운 간지(천간+지지) 오행이 용신과 맺는 관계를 0~100 점수로 환산.
   용신과 같은 오행이거나 용신을 생조하면 높은 점수, 용신을 극하면 낮은 점수,
   그 외 관계는 중간값 근처. 천간(그 10년의 표면 기운)과 지지(뿌리 기운)를
   절반씩 반영한다. 점수는 어디까지나 "용신 관점의 유불리"를 시각화하는
   보조 지표이지 확정적 길흉 판단이 아니므로 5~95 사이로 클램프해 과신을 막는다. */
function relationScore(ohaeng, yongshinMain) {
  if (!ohaeng || !yongshinMain) return 50;
  if (ohaeng === yongshinMain) return 90;
  if (PRODUCES[ohaeng] === yongshinMain) return 78;
  if (CONTROLS[ohaeng] === yongshinMain) return 15;
  if (CONTROLS[yongshinMain] === ohaeng) return 60; // 용신이 이 오행을 극제 — 용신이 힘을 쓰는 관계
  if (PRODUCES[yongshinMain] === ohaeng) return 40; // 용신의 기운이 빠져나가는 관계(설기)
  return 50;
}

function computeDaewoonScores(daewoon, yongshinMain) {
  return daewoon.filter(d => d.ganZhi).map(d => {
    const stemOhaeng = STEM_OHAENG[d.stem]?.ohaeng;
    const branchMainStem = BRANCH_MAIN_STEM[d.branch];
    const branchOhaeng = branchMainStem ? STEM_OHAENG[branchMainStem]?.ohaeng : null;
    const stemScore = relationScore(stemOhaeng, yongshinMain);
    const branchScore = relationScore(branchOhaeng, yongshinMain);
    const raw = Math.round(stemScore * 0.5 + branchScore * 0.5);
    return {
      age: d.startAge,
      year: d.startYear,
      ganZhi: d.ganZhi,
      score: Math.max(5, Math.min(95, raw))
    };
  });
}

function daewoonScoreLineConfig(daewoon, yongshinMain) {
  const rows = computeDaewoonScores(daewoon, yongshinMain);
  return {
    type: 'line',
    data: {
      labels: rows.map(r => `${r.age}세`),
      datasets: [{
        label: '용신 기준 흐름 점수',
        data: rows.map(r => r.score),
        borderColor: '#c7a13a',
        backgroundColor: 'rgba(199,161,58,0.14)',
        pointBackgroundColor: rows.map(r => (r.score >= 70 ? '#c7a13a' : r.score <= 30 ? '#b5573f' : MUTED_COLOR)),
        pointStyle: 'star',
        pointRadius: 7,
        pointHoverRadius: 7,
        borderWidth: 2,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: '대운 흐름 점수 (용신 기준 · 높을수록 우호적인 시기)',
          color: TEXT_COLOR, font: { ...BASE_FONT, size: 14 }
        }
      },
      scales: {
        y: { min: 0, max: 100, ticks: { stepSize: 25, color: MUTED_COLOR, font: BASE_FONT }, grid: { color: GRID_COLOR } },
        x: {
          ticks: { color: TEXT_COLOR, font: BASE_FONT },
          grid: { display: false }
        }
      }
    }
  };
}

/* 요약 카드용 — 제목/범례 없이 곡선만 크고 선명하게, 카드 배경(다크)에 맞춘 축약판. */
function daewoonMiniLineConfig(daewoon, yongshinMain) {
  const rows = computeDaewoonScores(daewoon, yongshinMain);
  return {
    type: 'line',
    data: {
      labels: rows.map(r => `${r.age}세`),
      datasets: [{
        data: rows.map(r => r.score),
        borderColor: '#c7a13a',
        backgroundColor: 'rgba(199,161,58,0.22)',
        pointBackgroundColor: rows.map(r => (r.score >= 70 ? '#c7a13a' : r.score <= 30 ? '#b5573f' : '#8d96b8')),
        pointStyle: 'star',
        pointRadius: 9,
        pointHoverRadius: 9,
        borderWidth: 5,
        fill: true,
        tension: 0.35
      }]
    },
    options: {
      responsive: false,
      animation: false,
      plugins: { legend: { display: false }, title: { display: false } },
      scales: {
        y: { min: 0, max: 100, display: false },
        x: { ticks: { color: '#8d96b8', font: { family: FONT_FAMILY, size: 22 } }, grid: { display: false } }
      }
    }
  };
}

function daewoonTimelineConfig(daewoon, yongshinMain) {
  // 대운 오행이 용신을 생조하면 금빛(길), 극하면 적갈빛(주의), 그 외 회청빛
  function judge(stemOhaeng) {
    if (!yongshinMain) return MUTED_COLOR;
    if (stemOhaeng === yongshinMain || PRODUCES[stemOhaeng] === yongshinMain) return '#c7a13a';
    if (CONTROLS[stemOhaeng] === yongshinMain) return '#b5573f';
    return MUTED_COLOR;
  }
  const rows = daewoon.filter(d => d.ganZhi).map(d => ({
    label: `${d.startAge}세~ (${d.startYear}) ${d.ganZhi}`,
    value: 1,
    color: judge(STEM_OHAENG[d.stem]?.ohaeng)
  }));
  return {
    type: 'bar',
    data: {
      labels: rows.map(r => r.label),
      datasets: [{ label: '대운', data: rows.map(r => r.value), backgroundColor: rows.map(r => r.color), borderRadius: 2 }]
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: '대운 흐름 (금빛=용신 상생 · 적갈빛=용신 극)', color: TEXT_COLOR, font: { ...BASE_FONT, size: 14 } }
      },
      scales: {
        x: { display: false },
        y: { ticks: { color: TEXT_COLOR, font: BASE_FONT }, grid: { display: false } }
      }
    }
  };
}

module.exports = {
  ohaengBarConfig, ohaengRadarConfig, shipsinDonutConfig,
  daewoonTimelineConfig, daewoonScoreLineConfig, daewoonMiniLineConfig, computeDaewoonScores,
  relationScore, OHAENG_COLOR, SHIPSIN_GROUP_COLOR
};
