'use strict';
process.env.SAJU_DB_PATH = ':memory:';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('../src/db');
const users = require('../src/db/users');
const orders = require('../src/db/orders');
const delivery = require('../src/db/reportDelivery');
const { deliverLoveReport } = require('../src/email/loveReport');
const user = users.createUser({email:'delivery@example.test', passwordHash:'x', name:'테스트'});
const folder = fs.mkdtempSync(path.join(os.tmpdir(),'love-delivery-'));
const pdf = path.join(folder,'test.pdf'); fs.writeFileSync(pdf,'%PDF-1.4 test');
test.after(() => { fs.rmSync(folder,{recursive:true,force:true}); db.close(); });
function order(id, done = true) {
  orders.createOrder({userId:user.id,productKey:'love_timing',jobId:id});
  delivery.create(id,'recipient@example.test');
  if(done) orders.markDone(id,{resultPath:pdf,resultText:'전체 본문'});
}
test('이메일 형식과 명시적 전달 동의를 서버에서 검사한다',()=>{
  for(const email of ['', 'a@b', 'a\r\nb@example.test', '<x>@example.test']) assert.throws(()=>delivery.parseDelivery({deliveryEmail:email,deliveryConsent:true}));
  assert.throws(()=>delivery.parseDelivery({deliveryEmail:'a@example.test',deliveryConsent:'false'}));
  assert.equal(delivery.parseDelivery({deliveryEmail:' a@example.test ',deliveryConsent:true}),'a@example.test');
});
test('완료된 주문만 전체 PDF를 보내고 중복 호출은 발송하지 않는다',async()=>{
  order('paid');order('pending',false);let calls=0;
  const send=async(message)=>{ calls++;assert.equal(message.to,'recipient@example.test');assert.equal(Buffer.from(message.attachments[0].content,'base64').toString(),'%PDF-1.4 test');assert.equal(message.idempotencyKey,'report-paid');return {id:'provider-test'}; };
  assert.equal(await deliverLoveReport('pending',send),false);
  assert.equal(await deliverLoveReport('paid',send),true);
  assert.equal(await deliverLoveReport('paid',send),false);
  assert.equal(calls,1);assert.equal(delivery.get('paid').status,'sent');
  orders.markError('pending','test cleanup');
  assert.equal('email' in delivery.publicState('paid'),false);
});
test('메일 실패는 주문/PDF를 보존하고 재시도는 시간 제한과 횟수 제한을 따른다',async()=>{
  order('failed');
  assert.equal(await deliverLoveReport('failed',async()=>{throw new Error('network');}),false);
  assert.equal(orders.findByJobId('failed').status,'done');
  assert.equal(orders.findByJobId('failed').result_path,pdf);
  assert.equal(delivery.get('failed').status,'failed');
  assert.equal(delivery.claim('failed'),false);
  const now=Date.now();assert.equal(delivery.claim('failed',now+61000),true);delivery.finish('failed',false);
  assert.equal(delivery.claim('failed',now+122000),true);delivery.finish('failed',false);
  assert.equal(delivery.claim('failed',now+200000),false);
});
test('재시작 시 남은 완료 주문을 복구하고 30일 지난 수신 주소 사본을 삭제한다',async()=>{
  order('recovered');
  const { deliverPendingLoveReports } = require('../src/jobs/deliverLoveReports');
  let sent=0;await deliverPendingLoveReports(async()=>{sent++;return {id:'recovered'};});
  assert.equal(sent,1);assert.equal(delivery.get('recovered').status,'sent');
  db.prepare("UPDATE report_delivery SET consent_at=datetime('now','-31 days') WHERE job_id='recovered'").run();
  const cards = require('../src/db/cardPayments');
  const card = cards.create({userId:user.id,amountKrw:14900,orderName:'test',testMode:true,productKey:'love_timing',form:{deliveryEmail:'old@example.test',deliveryConsent:true,name:'test'}});
  db.prepare("UPDATE card_payments SET created_at=datetime('now','-31 days') WHERE id=?").run(card.id);
  delivery.cleanup();
  assert.equal(delivery.get('recovered'),undefined);
  assert.deepEqual(JSON.parse(cards.findById(card.id).form_json),{name:'test'});
});
