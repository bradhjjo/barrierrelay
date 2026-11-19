import { app } from '../src/firebase';
import { createAiPipeline } from '../src/ai/pipeline';
import { redact } from '../src/privacy/redact';
import facts from '../../../fixtures/pairs/02-icon-pay-button/broken.facts.json';
import type { CaptureFacts } from '@barrierrelay/shared/src/schema';
const button=document.querySelector<HTMLButtonElement>('#run')!, status=document.querySelector<HTMLElement>('#status')!, output=document.querySelector<HTMLElement>('#result')!;
const pipeline=createAiPipeline({app,getConfig:()=>({cloudModel:'gemini-3.5-flash-lite',groundingEnabled:true,maxCloudCallsPerSession:1,ruleCardsVersion:'1'})});
const bundle={facts:facts as unknown as CaptureFacts,regionPng:null,source:'fixture' as const};
const payload=redact(bundle,pipeline.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
button.disabled=false;status.textContent=`Ready. Approved payload: ${payload.bytes} UTF-8 bytes.`;
button.addEventListener('click',async()=>{
 button.disabled=true;status.textContent='Requesting the cloud fix plan…';const started=performance.now(),originalFetch=window.fetch;let responseShape:unknown=null;
 // Capture response field names only. Never inspect request headers or App Check responses.
 window.fetch=async(...args)=>{const response=await originalFetch(...args);const url=String(args[0] instanceof Request?args[0].url:args[0]);if(url.includes(':generateContent')&&response.ok){const body=await response.clone().json();responseShape={keys:Object.keys(body),candidateKeys:Object.keys(body.candidates?.[0]??{}),groundingKeys:Object.keys(body.candidates?.[0]?.groundingMetadata??{})};}return response;};
 try{const result=await pipeline.fixPlanInCloud(payload);const summary={ok:true,ms:Math.round(performance.now()-started),sources:result.fixPlan.sources.length,responseShape,fixPlanKeys:Object.keys(result.fixPlan),routing:result.log,fixPlan:result.fixPlan};output.textContent=JSON.stringify(summary,null,2);status.textContent=`Cloud fix plan received. ${summary.sources} grounding sources in ${summary.ms} ms.`;}
 catch(error){output.textContent=JSON.stringify({ok:false,ms:Math.round(performance.now()-started),error:error instanceof Error?error.message:'Cloud request failed.',responseShape},null,2);status.textContent='Cloud smoke failed. See the response details.';}
 finally{window.fetch=originalFetch;}
});
