#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createNanoSession } from '../../tools/nano/run.mjs';
import { selfCheckPrompt } from '../../apps/web/src/ai/selfcheck-input.ts';
import { ruleDraft } from '../../apps/web/src/ai/rules.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const spec=JSON.parse(await readFile(`${root}/apps/web/src/ai/selfcheck-prompt.json`,'utf8'));
await mkdir(`${root}/gate0/out`,{recursive:true});
let session;const rows=[];let samplingObserved=null;
try {
 session=await createNanoSession({timeoutMs:90000});
 const availability=await session.page.evaluate(async()=>{
   if(!globalThis.LanguageModel)return 'unsupported-browser';
   return Promise.race([LanguageModel.availability({expectedInputs:[{type:'text'}]}),new Promise(r=>setTimeout(()=>r('unavailable (timeout)'),8000))]);
 });
 if(availability!=='available')throw new Error(`Nano unavailable: ${availability}`);
 // The runner forwards system/schema unchanged; inject the same creation sampling
 // preferences as the app without modifying the shared Nano runner.
 await session.page.evaluate(sampling=>{
   const create=LanguageModel.create.bind(LanguageModel);
   LanguageModel.create=async options=>{
     const model=await create({...options,...sampling});
     globalThis.selfCheckSamplingObserved={};
     for(const key of ['topK','temperature','samplingMode']){
       try{globalThis.selfCheckSamplingObserved[key]=model[key]??null;}catch{globalThis.selfCheckSamplingObserved[key]=null;}
     }
     return model;
   };
 },spec.sampling);
 for(const id of (await readdir(`${root}/fixtures/pairs`)).sort()){
   const facts=JSON.parse(await readFile(`${root}/fixtures/pairs/${id}/broken.facts.json`,'utf8'));
   const truth=JSON.parse(await readFile(`${root}/fixtures/pairs/${id}/truth.broken.json`,'utf8'));
   const draft={...ruleDraft(facts),barrierType:truth.barrierType,targetRef:truth.targetRef};
   for(const kind of ['correct','corrupted']){
     // Alternate an impossible ref and a wrong type. Keep the rest unchanged so
     // the only corruption is the claim under evaluation, not prompt formatting.
     const index=Number(id.slice(0,2));
     const input=kind==='correct'?draft:index%2?{...draft,targetRef:'e999'}:{...draft,barrierType:truth.barrierType==='unnamed-link'?'unnamed-button':'unnamed-link'};
     try{
       const result=await session.run({system:spec.system,prompt:selfCheckPrompt(input,facts),schema:spec.schema});
       samplingObserved=await session.page.evaluate(()=>globalThis.selfCheckSamplingObserved);
       const check=result.json;
       const valid=typeof check?.consistent==='boolean'&&Array.isArray(check.problems)&&check.problems.length<=3&&check.problems.every(p=>typeof p==='string')&&(!check.consistent||check.problems.length===0);
       rows.push({id,kind,draft:input,result:check,schemaValid:valid,correct:valid&&check.consistent===(kind==='correct'),ms:result.ms});
     }catch(e){rows.push({id,kind,draft:input,schemaValid:false,correct:false,error:e.message});}
     console.error(`${id} ${kind}: ${rows.at(-1).correct?'OK':'MISS'}`);
   }
 }
 const summary={correctAccepted:rows.filter(r=>r.kind==='correct'&&r.correct).length,correctTotal:10,corruptedRejected:rows.filter(r=>r.kind==='corrupted'&&r.correct).length,corruptedTotal:10,schemaValid:rows.filter(r=>r.schemaValid).length,total:20};
 await writeFile(`${root}/gate0/out/selfcheck.json`,JSON.stringify({at:new Date().toISOString(),spec,samplingObserved,summary,rows},null,2)+'\n');
 console.table(summary);
 if(summary.correctAccepted<9||summary.corruptedRejected<8)process.exitCode=1;
}catch(e){await writeFile(`${root}/gate0/out/selfcheck.json`,JSON.stringify({error:e.message,rows},null,2)+'\n');console.error(e.message);process.exitCode=1;}
finally{await session?.close();}
