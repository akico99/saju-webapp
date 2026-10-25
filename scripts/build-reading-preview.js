'use strict';
// Offline, explicitly synthetic persona. Never export customer orders with this helper.
const fs = require('node:fs');
const path = require('node:path');
const { buildLovePreview } = require('../src/engine/loveTiming');
const order = require('../src/db/orders').findByJobId(process.argv[2]);
const users = require('../src/db/users');
if (!order || order.status !== 'done') throw new Error('Completed local example required');
const sampleUser = users.findByEmail('love-preview@local.test');
if (!sampleUser || sampleUser.id !== order.user_id) throw new Error('Only the synthetic local preview account is allowed');
const birth = { year:1995, month:5, day:15, hour:14, minute:30, gender:'여', isLunar:false, isLeap:false };
const person = { name:'수달', situation:'some' };
const fixture = { notice:'가상 인물의 정보로 실제 생성한 화면 예시입니다. 고객님의 분석 결과가 아닙니다.', person, free:buildLovePreview(birth,'some'), paid:order.result_text, visual:order.result_visual, generatedAt:new Date().toISOString() };
fs.writeFileSync(path.join(__dirname,'../public/love-assets/reading-example.json'), JSON.stringify(fixture,null,2));
console.log('Example saved: ', fixture.paid.length, 'characters');
process.exit(0);
