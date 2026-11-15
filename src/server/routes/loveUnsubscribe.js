'use strict';
/* 광고 메일 수신 거부 — 메일 링크(/unsubscribe?t=토큰)를 열면 바로 처리하고 확인 화면을 보여 준다.
   연애 기능 스위치와 상관없이 항상 열려 있다(수신 거부는 막지 않는다). POST도 받는다(메일 앱의 원클릭 수신 거부).
   화면에는 이메일·토큰을 싣지 않는다. */
const express = require('express');
const loveLeads = require('../../db/loveLeads');

const CONTACT = 'sooky2001@gmail.com';

function pageHtml(title, body) {
  return '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>' + title + ' — 사주보는 수달</title>' +
    '<style>body{margin:0;background:#0f1420;color:#ece2c4;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}' +
    'main{max-width:420px;margin:24px;background:#161d2e;border:1px solid #2a3350;border-radius:14px;padding:32px 28px;text-align:center}' +
    'h1{font-size:19px;margin:0 0 12px}p{color:#8d96b8;font-size:14px;line-height:1.75;margin:0 0 12px}a{color:#c7a13a}</style></head>' +
    '<body><main><h1>' + title + '</h1>' + body + '<p><a href="/">사주보는 수달 처음으로</a></p></main></body></html>';
}

function handleUnsubscribe(req, res) {
  const now = req.app.locals.loveNow ? req.app.locals.loveNow() : new Date();
  const token = typeof req.query.t === 'string' ? req.query.t : (req.body && typeof req.body.t === 'string' ? req.body.t : '');
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
  let ok = false;
  try { ok = loveLeads.unsubscribe(token, now); } catch (e) { return res.status(500).type('html').send(pageHtml('잠시 후 다시 시도해 주세요', '<p>처리 중 문제가 생겼어요. 잠시 뒤에 같은 링크를 다시 눌러 주세요.</p>')); }
  if (!ok) {
    return res.status(404).type('html').send(pageHtml('링크를 찾을 수 없어요',
      '<p>이미 삭제됐거나 만료된 링크예요. 정보가 삭제됐다면 더 이상 메일이 가지 않아요.</p><p>그래도 메일이 계속 오면 ' + CONTACT + '로 알려 주세요.</p>'));
  }
  return res.type('html').send(pageHtml('수신 거부가 끝났어요',
    '<p>이 이메일로는 더 이상 광고 메일을 보내지 않아요.</p><p>입력하신 정보는 30일 안에 삭제돼요.</p>'));
}

const router = express.Router();
router.get('/unsubscribe', handleUnsubscribe);
router.post('/unsubscribe', express.urlencoded({ extended: false }), handleUnsubscribe);

module.exports = router;
module.exports.handleUnsubscribe = handleUnsubscribe;
