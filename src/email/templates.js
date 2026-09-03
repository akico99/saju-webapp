'use strict';
/* 이메일 HTML 템플릿 — 사이트/PDF 리포트와 같은 다크 네이비·금색 톤으로 맞춘다
   (report.css의 --bg/--star/--gold 값과 동일). 이메일 클라이언트는 <style>이나
   CSS 변수를 신뢰할 수 없어서, 전부 인라인 스타일로 직접 박아 넣는다. */
const BASE_URL = process.env.BASE_URL || 'http://localhost:4500';

const COLORS = {
  bg: '#0f1420',
  card: '#161d2e',
  star: '#ece2c4',
  muted: '#8d96b8',
  gold: '#c7a13a',
  line: '#2a3350'
};

function wrap(bodyHtml) {
  return `
<div style="background:${COLORS.bg};padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:14px;padding:32px 28px;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${BASE_URL}/logo.png" alt="길잡이 여울" width="40" height="40" style="border-radius:10px;display:inline-block;vertical-align:middle;">
      <span style="color:${COLORS.star};font-size:15px;font-weight:700;vertical-align:middle;margin-left:8px;">길잡이 여울 · 사주보는 수달</span>
    </div>
    ${bodyHtml}
    <div style="border-top:1px solid ${COLORS.line};margin-top:28px;padding-top:16px;text-align:center;">
      <p style="color:${COLORS.muted};font-size:11.5px;margin:0;">길잡이 여울 (대표 이용수) · sooky2001@gmail.com</p>
    </div>
  </div>
</div>`;
}

function passwordResetEmail({ resetUrl, ttlMinutes }) {
  return wrap(`
    <h1 style="color:${COLORS.star};font-size:19px;margin:0 0 12px;text-align:center;">비밀번호를 재설정해주세요</h1>
    <p style="color:${COLORS.muted};font-size:14px;line-height:1.7;margin:0 0 28px;text-align:center;">
      아래 버튼을 눌러 새 비밀번호를 설정하세요.<br>이 링크는 <b style="color:${COLORS.gold};">${ttlMinutes}분</b> 동안만 유효해요.
    </p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetUrl}" style="display:inline-block;background:${COLORS.gold};color:#1a1408;font-weight:700;font-size:14.5px;padding:13px 32px;border-radius:999px;text-decoration:none;">비밀번호 재설정하기</a>
    </div>
    <p style="color:${COLORS.muted};font-size:12px;line-height:1.6;text-align:center;margin:0;">
      본인이 요청하지 않았다면 이 메일은 무시하셔도 괜찮아요.<br>비밀번호는 그대로 안전하게 유지됩니다.
    </p>
  `);
}

module.exports = { passwordResetEmail };
