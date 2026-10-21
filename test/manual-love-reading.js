'use strict';
/* 수동 확인용 — 실제 API로 연애 시기 리포트 1건을 만든다(비용 발생, 자동 테스트 대상 아님).

   사용(PowerShell):
     $env:LOVE_TIMING_ENABLED='true'; $env:SAJU_DB_PATH="$env:TEMP\love-preview.db"; node test/manual-love-reading.js some

   로컬 확인용 계정 love-preview@local.test(비밀번호 LOVE_PREVIEW_PASSWORD, 기본 otter-preview-1234)에
   상품 가격만큼 포인트를 넣고, 카드 결제 승인 뒤와 같은 start()를 부른다. 끝나면 본문·원가·jobId를
   출력한다. 같은 DB로 띄운 로컬 서버에서 그 계정으로 로그인해 /love.html?jobId=... 로 결과 화면을 본다. */
const bcrypt = require('bcryptjs');
const users = require('../src/db/users');
const orders = require('../src/db/orders');
const { adjustPointBalance } = require('../src/db/users');
const points = require('../src/db/points');
const love = require('../src/server/routes/love');

const situation = process.argv[2] || 'some';
const EMAIL = 'love-preview@local.test';

(async () => {
  let user = users.findByEmail(EMAIL);
  if (!user) {
    const passwordHash = await bcrypt.hash(process.env.LOVE_PREVIEW_PASSWORD || 'otter-preview-1234', 10);
    user = users.createUser({ email: EMAIL, passwordHash, name: '수달' });
  }
  adjustPointBalance(user.id, points.PRICES.love_timing);
  const form = { situation, name: '수달', gender: '여', year: '1995', month: '5', day: '15', calendar: '양력', hour: '14', minute: '30' };
  const { jobId } = await love.start(user.id, form);
  console.log('jobId', jobId);
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const o = orders.findByJobId(jobId);
    if (o.status === 'done') {
      console.log('완료', Math.round((Date.now() - started) / 1000) + '초', '원가 $' + (o.llm_cost_usd || 0).toFixed(4), '본문', o.result_text.length + '자');
      console.log(o.result_text);
      break;
    }
    if (o.status === 'error') { console.log('실패', o.error); break; }
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

