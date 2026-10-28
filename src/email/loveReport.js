'use strict';
/* 구매한 리포트 PDF를 결제 전에 받은 수신 이메일로 보낸다. 상품마다 제목·본문·파일명만 다르다.
   새 상품은 PRODUCTS에 한 줄을 더하고, 라우트에서 delivery.create(jobId, email) 후 PDF 완성 시 deliverReport(jobId)를 부른다. */
const fs = require('fs');
const delivery = require('../db/reportDelivery');
const orders = require('../db/orders');
const { sendEmail } = require('./resend');

const PRODUCTS = {
  love_timing: { title: '인연의 시기', file: '인연의시기.pdf', lead: '당신의 연애 이야기가 완성됐어요.' },
  new_year_2027: { title: '2027 신년운세', file: '2027신년운세.pdf', lead: '당신의 2027년 이야기가 완성됐어요.' },
  reunion: { title: '다시, 우리', file: '재회운.pdf', lead: '두 사람의 이야기가 완성됐어요.' },
  compat: { title: '두 사람의 궁합', file: '궁합.pdf', lead: '두 사람의 이야기가 완성됐어요.' }
};
const deliverable = (productKey) => Object.prototype.hasOwnProperty.call(PRODUCTS, productKey);

async function deliverReport(jobId, send = sendEmail) {
  const order = orders.findByJobId(jobId);
  if (!order || !deliverable(order.product_key) || order.status !== 'done' || !order.result_path) return false;
  if (!delivery.get(jobId) || !delivery.claim(jobId)) return false;
  const p = PRODUCTS[order.product_key];
  try {
    const row = delivery.get(jobId);
    const result = await send({
      to: row.email, subject: '[사주보는 수달] ' + p.title + ' PDF가 도착했어요',
      html: '<h1>' + p.lead + '</h1><p>구매하신 ' + p.title + ' 전체 풀이를 PDF로 첨부합니다. 웹 결과와 같은 내용이며, 사주보는 수달 마이페이지에서도 다시 볼 수 있어요.</p><p>사주 해석은 선택을 돕는 참고 자료이며 미래를 확정하지 않습니다.</p>',
      attachments: [{ filename: p.file, content: fs.readFileSync(order.result_path).toString('base64') }],
      idempotencyKey: 'report-' + jobId
    });
    delivery.finish(jobId, true, result && result.id);
    return true;
  } catch (_) {
    delivery.finish(jobId, false);
    // 메일 제공자의 오류에 주소가 포함될 수 있으므로 원문을 로그나 고객 응답에 싣지 않는다.
    return false;
  }
}
// 기존 호출부 호환
const deliverLoveReport = deliverReport;
module.exports = { deliverReport, deliverLoveReport, deliverable, PRODUCTS };

