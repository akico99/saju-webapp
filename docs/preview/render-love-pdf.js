const fs=require('fs'),path=require('path');
const {computeSaju}=require('../../src/engine');
const {renderLoveHtml}=require('../../src/pdf/renderLoveHtml');
const {renderPdf}=require('../../src/pdf/renderPdf');
const kind=process.argv[2]||"single";
(async()=>{
 const x=require('./love-generated-'+kind+'.json');
 const engine=computeSaju(x.birth);
 const out=path.join(__dirname,'love-generated-'+kind+'.pdf');
 const t=Date.now();
 await renderPdf(renderLoveHtml(engine,x.person,x.reading),out,{name:x.person.name,label:'인연의 시기'});
 const {PDFParse}=require('pdf-parse');
 const parser=new PDFParse({data:fs.readFileSync(out)});
 const r=await parser.getText();
 const body=r.text.replace(/\s+/g,'');
 const missing=x.reading.monthNotes.filter(m=>!body.includes(require('../../public/love-reading-model').monthParts(m.note).map(p=>p.text).join('').replace(/\*\*/g,'').replace(/\s+/g,'').slice(0,60))).length;
 console.log(JSON.stringify({pages:r.total, kb:Math.round(fs.statSync(out).size/1024), seconds:Math.round((Date.now()-t)/1000), missingMonths:missing}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
