#!/usr/bin/env node
// Start `npm run dev -- --port 5179` first. No inference or model download occurs.
import {createNanoSession} from '../../tools/nano/run.mjs';
const session=await createNanoSession({timeoutMs:15000});
try {
  await session.page.evaluateOnNewDocument(()=>{
    Object.defineProperty(window,'LanguageModel',{configurable:true,value:{availability:async()=>'unavailable'}});
    window.fetch=async url=>{window.fallbackURL=String(url);throw new Error('Intentional cloud fetch interception');};
  });
  await session.page.goto(process.argv[2]||'http://127.0.0.1:5179');
  await session.page.waitForFunction(()=>!!window.runProbe);
  const result=await session.page.evaluate(async()=>{
    const results=await window.runProbe();
    try{await window.probeFallback();}catch(e){results.push({kind:'fallback',error:e.message,code:e.code,url:window.fallbackURL});}
    return {exports:window.hybridExports,results};
  });
  console.log(JSON.stringify(result,null,2));
  if(result.results.slice(0,3).some(row=>row.ok||row.code!=='api-not-enabled')||!result.results[3]?.url?.includes('firebasevertexai.googleapis.com'))process.exitCode=1;
}finally{await session.close();}
