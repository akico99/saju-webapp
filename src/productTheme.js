'use strict';
/* 상품별 색 — 연애 상품(진홍)의 화면·PDF CSS를 그대로 쓰되, 붉은 계열 색만 상품 색으로 옮긴다.
   어두운 빨강(바탕·테두리)은 base 색상으로, 밝은 분홍·빨강(강조·버튼)은 accent 색상으로 옮기고,
   금색·흰색·회색처럼 붉지 않은 색은 그대로 둔다. 웹 CSS는 scripts/build-product-themes.js가 미리 만들고,
   PDF는 renderXxxHtml이 생성할 때 같은 함수를 쓴다. */
const THEMES = {
  newyear: { base: { h: 222, s: 0.85 }, accent: { h: 26, s: 1.0 } },   // 새벽 남색 · 해돋이 주황
  reunion: { base: { h: 214, s: 0.5 }, accent: { h: 350, s: 0.45 } },  // 청회색 달빛 · 옅은 분홍
  couple: { base: { h: 178, s: 0.72 }, accent: { h: 40, s: 0.75 } }    // 녹청 · 상아 금빛
};

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  h /= 360;
  if (!s) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(v * 255));
}
function shift(r, g, b, t) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.12 || !(h >= 320 || h <= 22)) return null;
  const to = l < 0.35 ? t.base : t.accent;
  return hslToRgb(to.h, Math.min(1, s * to.s), l);
}
const hex2 = (n) => n.toString(16).padStart(2, '0');

/** CSS 문자열의 붉은 계열 색(#rgb, #rrggbb, #rrggbbaa, rgb(), rgba())을 상품 색으로 바꾼다. */
function themeCss(css, name) {
  const t = THEMES[name];
  if (!t) throw new Error('알 수 없는 상품 색: ' + name);
  return String(css)
    .replace(/#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g, (m, x) => {
      const full = x.length === 3 ? x.split('').map((c) => c + c).join('') : x;
      const out = shift(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), t);
      return out ? '#' + out.map(hex2).join('') + full.slice(6) : m;
    })
    .replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(,\s*[\d.]+\s*)?\)/g, (m, r, g, b, a) => {
      const out = shift(Number(r), Number(g), Number(b), t);
      return out ? (a ? 'rgba(' : 'rgb(') + out.join(',') + (a || '') + ')' : m;
    });
}

module.exports = { THEMES, themeCss };

