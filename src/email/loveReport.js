'use strict';
const fs = require('fs');
const delivery = require('../db/reportDelivery');
const orders = require('../db/orders');
const { sendEmail } = require('./resend');

async function deliverLoveReport(jobId, send = sendEmail) {
  const order = orders.findByJobId(jobId);
  if (!order || order.product_key !== 'love_timing' || order.status !== 'done' || !order.result_path) return false;
  if (!delivery.claim(jobId)) return false;
  try {
    const row = delivery.get(jobId);
    const result = await send({
      to: row.email, subject: '[사주보는 수달] 인연의 시기 PDF가 도착했어요',
      html: '<h1>당신의 연애 이야기가 완성됐어요.</h1><p>구매하신 인연의 시기 전체 풀이를 PDF로 첨부합니다. 웹 결과와 같은 내용이며, 사주보는 수달 마이페이지에서도 다시 볼 수 있어요.</p><p>사주 해석은 선택을 돕는 참고 자료이며 미래를 확정하지 않습니다.</p>',
      attachments: [{ filename: '인연의시기.pdf', content: fs.readFileSync(order.result_path).toString('base64') }],
      idempotencyKey: 'love-report-' + jobId
    });
    delivery.finish(jobId, true, result && result.id);
    return true;
  } catch (_) {
    delivery.finish(jobId, false);
    // 메일 제공자의 오류에 주소가 포함될 수 있으므로 원문을 로그나 고객 응답에 싣지 않는다.
    return false;
  }
}
module.exports = { deliverLoveReport };
