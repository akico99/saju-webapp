const fs = require('fs'); const path = require('path');
const { computeSaju } = require('../../src/engine');
const { generateLoveReading, toPlainText } = require('../../src/llm/loveTimingReading');
const { costUsd } = require('../../src/llm/client');
(async()=>{
 if(!process.env.ANTHROPIC_API_KEY) throw new Error('Local API configuration unavailable');
 const inputs=[['single','지우','여',1995,5,15,14,'person'],['some','서연','여',1993,8,20,9,'action'],['breakup','도윤','남',1992,9,23,21,'pattern']];
 const only=process.argv[2];
 for(const [situation,name,gender,year,month,day,hour,readingFocus] of inputs){
  if(only&&situation!==only) continue;
  const birth={year,month,day,hour,minute:10,gender}; const engine=computeSaju(birth); const person={name,gender};
  const start=Date.now();
  try {
   const reading=await generateLoveReading(engine,person,situation,new Date('2026-10-28T03:00:00Z'),{readingFocus});
   const report=toPlainText(reading);
   fs.writeFileSync(path.join(__dirname,'love-generated-'+situation+'.json'),JSON.stringify({notice:'가상 인물로 실제 AI 생성한 검증 예시입니다. 결제·이메일 발송 없음.',birth,person,reading,report},null,2));
   console.log(JSON.stringify({situation,chars:report.length,seconds:Math.round((Date.now()-start)/1000),costUsd:costUsd(reading.usage)}));
  } catch(e){console.log(JSON.stringify({situation,error:e.message}));}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
