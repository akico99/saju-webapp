'use strict';
/* 연애 무료 분석 이메일 — 결과 메일 1종(거래 정보, '(광고)' 없음)과 판매 메일 3종(D+1, D+3, 1위 달 시작).
   판매 메일은 제목 앞에 '(광고)'를 붙이고 본문 끝에 보낸 곳·연락처·수신 동의 사실·수신 거부 링크를 단다.
   1위 달의 정확한 연·월은 어느 메일에도 싣지 않는다(결과·D+1은 구간만, 1위 달 알림은 '이번 달'). */
const { wrap, COLORS } = require('./templates');
const loveBrand = require('../../public/love-brand');

const OPERATOR = '길잡이 여울(사주보는 수달) · 대표 이용수 · 사업자등록번호 279-25-01684';
const CONTACT = 'sooky2001@gmail.com';

const baseUrl = () => String(process.env.BASE_URL || 'http://localhost:4500').replace(/\/+$/, '');
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function leadUrl(token, content) {
  const q = content ? '&utm_source=email&utm_campaign=love_followup&utm_content=' + content : '';
  return baseUrl() + '/love.html?lead=' + encodeURIComponent(token) + q;
}
const unsubscribeUrl = (token) => baseUrl() + '/unsubscribe?t=' + encodeURIComponent(token);

const who = (name) => (name ? name + '님' : '회원님');

const h1 = (t) => `<h1 style="color:${COLORS.star};font-size:19px;margin:0 0 14px;text-align:center;">${esc(t)}</h1>`;
const p = (t, extra) => `<p style="color:${COLORS.muted};font-size:14px;line-height:1.75;margin:0 0 14px;${extra || ''}">${t}</p>`;
const button = (href, label) => `<div style="text-align:center;margin:22px 0 8px;"><a href="${esc(href)}" style="display:inline-block;background:${COLORS.gold};color:#1a1408;font-weight:700;font-size:14.5px;padding:13px 28px;border-radius:999px;text-decoration:none;">${esc(label)}</a></div>`;

function kstDateLabel(isoText) {
  const d = new Date(Date.parse(isoText) + 9 * 3600000);
  return d.getUTCFullYear() + '년 ' + (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일';
}

function adFooter(row) {
  return `<div style="border-top:1px solid ${COLORS.line};margin-top:22px;padding-top:14px;">
    <p style="color:${COLORS.muted};font-size:11.5px;line-height:1.7;margin:0 0 6px;">이 메일은 ${esc(kstDateLabel(row.agree_marketing_at))}에 광고성 정보 수신에 동의하셔서 보내 드렸어요.</p>
    <p style="color:${COLORS.muted};font-size:11.5px;line-height:1.7;margin:0 0 6px;">보낸 곳: ${esc(OPERATOR)}<br>연락처: ${esc(CONTACT)}</p>
    <p style="color:${COLORS.muted};font-size:11.5px;line-height:1.7;margin:0;"><a href="${esc(unsubscribeUrl(row.token))}" style="color:${COLORS.gold};">광고 메일 수신 거부</a> (누르면 바로 그만 받아요)</p>
  </div>`;
}

function resultMail({ row, reading }) {
  const name = row.name;
  const third = reading.third;
  const url = leadUrl(row.token);
  const html = wrap(
    h1(name ? name + '님의 무료 연애 사주 분석' : '무료 연애 사주 분석 결과') +
    p('인연 신호가 가장 강한 달은 <b style="color:' + COLORS.gold + ';">' + esc(reading.firstHint.label) + '</b>에 있어요.') +
    p('세 번째로 강한 달은 <b style="color:' + COLORS.star + ';">' + esc(third.label) + '</b>이에요.<br>' + esc(third.text)) +
    (reading.plain && reading.plain.charm ? p('타고난 매력: ' + esc(reading.plain.charm.headline)) : '') +
    button(url, '메일에서 결과 다시 보기') +
    p('1·2위 달과 그달에 할 일은 <a href="' + esc(url) + '" style="color:' + COLORS.gold + ';">결과 화면</a>에서 이어서 볼 수 있어요.', 'text-align:center;font-size:12.5px;') +
    `<p style="color:${COLORS.muted};font-size:11.5px;line-height:1.7;margin:18px 0 0;text-align:center;">이 메일은 무료 분석 결과를 보내 드리려고 한 번 보냈어요. 이후 메일이 필요 없으면 <a href="${esc(unsubscribeUrl(row.token))}" style="color:${COLORS.gold};">여기</a>를 눌러 주세요.</p>`
  );
  return { subject: name ? name + '님의 무료 연애 사주 분석' : '무료 연애 사주 분석 결과', html };
}

function followupD1({ row, reading }) {
  const label = reading.firstHint.label;
  const subject = '(광고) ' + who(row.name) + ', 가장 강한 달은 ' + label + '에 있어요';
  const html = wrap(
    h1(who(row.name) + ', 가장 강한 달은 ' + label + '에 있어요') +
    p('무료 분석에서는 인연 신호가 가장 강한 달이 어느 구간에 있는지까지만 알려 드렸어요. 몇 월인지, 그달에 무엇을 하면 좋은지는 전체 풀이에서 알려 드려요.') +
    button(leadUrl(row.token, 'd1'), '내 결과 다시 보기') + adFooter(row)
  );
  return { subject, html };
}

function followupD3({ row, reading }) {
  const titles = (reading.locked || []).slice(0, 3);
  const html = wrap(
    h1('1·2위 달과 그달에 해볼 일') +
    p(esc(who(row.name)) + '의 인연 신호가 가장 강한 두 달과, 그달에 해볼 일을 전체 풀이에 담았어요.') +
    (titles.length ? `<ul style="color:${COLORS.muted};font-size:13.5px;line-height:1.8;margin:0 0 14px;padding-left:20px;">${titles.map((t) => '<li>' + esc(t) + '</li>').join('')}</ul>` : '') +
    p('전체 풀이는 ' + esc(loveBrand.product.priceKrw.toLocaleString('ko-KR')) + '원이에요.') +
    button(leadUrl(row.token, 'd3'), '내 결과에서 이어 보기') + adFooter(row)
  );
  return { subject: '(광고) 1·2위 달과 그달에 해볼 일', html };
}

function followupTop1({ row }) {
  const subject = '(광고) 지금이 ' + who(row.name) + '의 인연 신호가 가장 강한 달이에요';
  const html = wrap(
    h1('지금이 ' + who(row.name) + '의 인연 신호가 가장 강한 달이에요') +
    p('무료 분석에서 알려 드리기로 한 그 달이 이번 달에 시작됐어요. 이번 달에 만남과 대화를 늘려 두면 좋아요. 그달에 무엇을 하면 좋은지는 전체 풀이에서 알려 드려요.') +
    button(leadUrl(row.token, 'top1'), '이번 달에 할 일 보기') + adFooter(row)
  );
  return { subject, html };
}

const BUILDERS = { result: resultMail, d1: followupD1, d3: followupD3, top1: followupTop1 };
function buildLeadMail(kind, data) {
  if (!BUILDERS[kind]) throw new Error('알 수 없는 메일 종류');
  return BUILDERS[kind](data);
}

module.exports = { buildLeadMail, leadUrl, unsubscribeUrl, OPERATOR, CONTACT };
