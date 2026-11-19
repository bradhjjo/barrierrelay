import { beforeEach, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
import type { CaptureFacts, FixPlan } from '@barrierrelay/shared/src/schema';
import { createAiPipeline, OnDeviceUnavailableError, ON_DEVICE_TIMEOUT_MS, CLOUD_RETRY_DELAY_MS, READINESS_TIMEOUT_MS, DISPLAY_READINESS_RETRY_MS } from './pipeline';
import { BARRIER_DRAFT_SCHEMA, DRAFT_SYSTEM_PROMPT, draftPrompt, fixPlanPrompt } from './prompts';
import promptSpec from './draft-prompt.json';
import { redact } from '../privacy/redact';
import { wcagReferences, BARRIER_CRITERIA } from './wcag';
const sdk = vi.hoisted(() => ({ generate:vi.fn(), prepare:vi.fn(), model:vi.fn() }));
vi.mock('firebase/ai', async importOriginal => ({ ...await importOriginal<typeof import('firebase/ai')>(), getAI:vi.fn(() => ({})), GoogleAIBackend:vi.fn(), getGenerativeModel:sdk.model }));
const captures = import.meta.glob('../../../../fixtures/pairs/*/broken.facts.json', { eager:true, import:'default' }) as Record<string,CaptureFacts>;
const truths = import.meta.glob('../../../../fixtures/pairs/*/truth.broken.json', { eager:true, import:'default' }) as Record<string,{barrierType:string}>;
const facts = Object.entries(captures).find(([path]) => path.includes('02-icon'))![1];
const bundle = { facts, regionPng:null, source:'fixture' as const };
const config = { cloudModel:'gemini-3.5-flash-lite', groundingEnabled:true, maxCloudCallsPerSession:1, ruleCardsVersion:'1' };
const make = () => createAiPipeline({ app:{} as FirebaseApp, getConfig:() => config });
const response = (value:unknown, inferenceSource='on_device', extra={}) => ({ response:{ text:() => JSON.stringify(value), inferenceSource,...extra } });
beforeEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')}); sdk.model.mockImplementation(() => ({ generateContent:sdk.generate, initializeDeviceModel:sdk.prepare })); });
it('drafts fixture 02 with compact facts, ONLY_ON_DEVICE constraint and verified routing', async () => {
  const p=make(), draft=p.draftFromRules(bundle).draft; sdk.generate.mockResolvedValue(response(draft));
  expect(await p.draftOnDevice(bundle)).toMatchObject({draft,log:[{ranOn:'on-device',bytesSentToCloud:0}]});
  expect(sdk.generate).toHaveBeenCalledWith([{type:'text',text:JSON.stringify(facts)}]);
  expect(sdk.model.mock.calls.at(-1)?.[1]).toMatchObject({mode:'only_on_device',onDeviceParams:{promptOptions:{responseConstraint:BARRIER_DRAFT_SCHEMA}}});
});
it('includes image inline without cloud routing', async () => {
  const p=make(); sdk.generate.mockResolvedValue(response(p.draftFromRules(bundle).draft));
  await p.draftOnDevice({...bundle,regionPng:{arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer} as Blob});
  expect(sdk.generate.mock.calls[0][0][1]).toEqual({type:'inlineData',inlineData:{mimeType:'image/png',data:'AQID'}});
});
it('maps api-not-enabled to the shared OnDeviceUnavailableError class', async () => {
  sdk.generate.mockRejectedValue({code:'api-not-enabled'}); await expect(make().draftOnDevice(bundle)).rejects.toBeInstanceOf(OnDeviceUnavailableError);
});
it('propagates inferenceSource and rejects unknown routing', async () => {
  const p=make(),draft=p.draftFromRules(bundle).draft; sdk.generate.mockResolvedValue(response(draft,'in_cloud'));
  expect((await p.draftOnDevice(bundle)).log[0].ranOn).toBe('in-cloud');
  sdk.generate.mockResolvedValue(response(draft,'unexpected')); await expect(p.draftOnDevice(bundle)).rejects.toThrow('inferenceSource');
});
it('rejects unknown targetRef and catches PII without calling AI', async () => {
  const p=make(),draft={...p.draftFromRules(bundle).draft,targetRef:'missing',summary:'Email person@example.com or call 312-555-0123.'};
  sdk.generate.mockResolvedValue(response(draft)); await expect(p.draftOnDevice(bundle)).rejects.toThrow('personal data'); sdk.generate.mockClear();
  const check=await p.selfCheck(draft,facts); expect(check.ok).toBe(false); expect(check.issues.join(' ')).toMatch(/targetRef/); expect(check.issues.join(' ')).toMatch(/personal data/); expect(sdk.generate).not.toHaveBeenCalled();
});
it('catches barrierType contradictions and lengths', async () => {
  const p=make(),check=await p.selfCheck({...p.draftFromRules(bundle).draft,barrierType:'unnamed-link',actual:'x'.repeat(161)},facts);
  expect(check.ok).toBe(false); expect(check.issues.join(' ')).toMatch(/inconsistent/); expect(check.issues.join(' ')).toMatch(/160/);
});
it('uses an available on-device structured follow-from-facts check', async () => {
  vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')}); const p=make(); sdk.generate.mockResolvedValue(response({consistent:false,problems:['Insufficient evidence.']}));
  const check=await p.selfCheck(p.draftFromRules(bundle).draft,facts); expect(check.ok).toBe(false); expect(check.issues).toContain('Insufficient evidence.'); expect(check.log[1]).toMatchObject({ranOn:'on-device',step:'self-check'});
});
it('reports unsupported-browser and uses SDK prepare progress', async () => {
  vi.stubGlobal('LanguageModel',undefined); const p=make(); expect(await p.onDeviceState()).toBe('unsupported-browser'); vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')});
  sdk.prepare.mockImplementation(async(callback:(n:number)=>void)=>callback(.7)); const progress=vi.fn(); expect(await p.prepareOnDevice(progress)).toBe('available'); expect(progress).toHaveBeenCalledWith(.7);
});
it('classifies at least 8 of all 10 broken fixtures deterministically', () => {
  const p=make(); let score=0; const failures:string[]=[]; expect(Object.keys(captures)).toHaveLength(10);
  for(const [path,facts] of Object.entries(captures)){ const truth=truths[path.replace('broken.facts.json','truth.broken.json')]; const result=p.draftFromRules({...bundle,facts}); if(result.draft.barrierType===truth.barrierType)score++;else failures.push(path); expect(result.draft.confidence).toBe('low');expect(result.log[0].ranOn).toBe('local-code'); }
  console.info(`draftFromRules: ${score}/10; failures: ${failures.join(', ')||'none'}`);expect(score).toBeGreaterThanOrEqual(8);
});
it('uses the same shared JSON prompt/schema as the eval runner', () => { expect(DRAFT_SYSTEM_PROMPT).toBe(promptSpec.system);expect(BARRIER_DRAFT_SCHEMA).toEqual(promptSpec.schema);expect(draftPrompt(facts)).toBe(JSON.stringify(facts)); });
const plan:FixPlan={wcag:[{sc:'4.1.2',title:'Name, Role, Value',level:'A'}],rootCause:'No button name.',fix:{description:'Add name.',codeBefore:'<button></button>',codeAfter:'<button aria-label="Pay"></button>'},verification:['Check the announced name.'],sources:[{title:'Invented',url:'https://invented.invalid'}]};
it('maps successful URL context retrievals only, counts bytes, enforces session budget', async () => {
 const p=make(),payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 sdk.generate.mockResolvedValue(response(plan,'in_cloud',{candidates:[{urlContextMetadata:{urlMetadata:[
   {retrievedUrl:'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'},
   {retrievedUrl:'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'},
   {retrievedUrl:'https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_ERROR'},
   {retrievedUrl:'https://invented.invalid',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'},
   {retrievedUrl:'javascript:alert(1)',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'},
 ]}}]}));
 const result=await p.fixPlanInCloud(payload);expect(result.fixPlan.sources).toEqual([{title:'Name, Role, Value',url:'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html'}]);expect(result.log[0]).toMatchObject({ranOn:'in-cloud',bytesSentToCloud:payload.bytes});
 expect(sdk.model.mock.calls.at(-1)?.[1]).toMatchObject({mode:'only_in_cloud',inCloudParams:{model:config.cloudModel,tools:[{urlContext:{}}]}});
 expect(sdk.generate.mock.calls[0][0]).toContain('https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html');
 await expect(p.fixPlanInCloud(payload)).rejects.toThrow('limit');expect(sdk.generate).toHaveBeenCalledTimes(1);
});
it('ignores invented sources and rejects malformed plans', async () => {
 const p=make(),payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});sdk.generate.mockResolvedValue(response(plan,'in_cloud'));
 expect((await p.fixPlanInCloud(payload)).fixPlan.sources).toEqual([]);sdk.generate.mockResolvedValue(response({fix:{}},'in_cloud'));await expect(make().fixPlanInCloud(payload)).rejects.toThrow('Invalid FixPlan');
});

it('maps every barrier type to one to three official WCAG references and excludes URLs when disabled', () => {
 for (const type of Object.keys(BARRIER_CRITERIA) as (keyof typeof BARRIER_CRITERIA)[]) {
   const refs=wcagReferences(type); expect(refs.length).toBeGreaterThanOrEqual(1); expect(refs.length).toBeLessThanOrEqual(3);
   for (const ref of refs) expect(ref.url).toMatch(/^https:\/\/www\.w3\.org\/WAI\/WCAG22\/Understanding\/[a-z-]+\.html$/);
 }
 const p=make(),payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 expect(fixPlanPrompt(payload)).toContain('label-in-name.html'); expect(fixPlanPrompt(payload,false)).not.toContain('Understanding/');
});
it('disables retrieval and sources when groundingEnabled is false', async () => {
 const p=createAiPipeline({app:{} as FirebaseApp,getConfig:()=>({...config,groundingEnabled:false})});
 const payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 sdk.generate.mockResolvedValue(response(plan,'in_cloud',{candidates:[{urlContextMetadata:{urlMetadata:[{retrievedUrl:'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',urlRetrievalStatus:'URL_RETRIEVAL_STATUS_SUCCESS'}]}}]}));
 expect((await p.fixPlanInCloud(payload)).fixPlan.sources).toEqual([]);
 expect(sdk.model.mock.calls.at(-1)?.[1]).toMatchObject({inCloudParams:{tools:[],generationConfig:{responseMimeType:'application/json'}}});
});

it('accepts a consistent barrier report and requests constrained predictable self-check output', async () => {
 vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')});
 const p=make();sdk.generate.mockResolvedValue(response({consistent:true,problems:[]}));
 const result=await p.selfCheck(p.draftFromRules(bundle).draft,facts);expect(result.ok).toBe(true);
 expect(sdk.model.mock.calls.at(-1)?.[1]).toMatchObject({onDeviceParams:{createOptions:{topK:1,temperature:0,samplingMode:'most-predictable'},promptOptions:{responseConstraint:{properties:{problems:{maxItems:3}}}}}});
});
it('rejects malformed or internally contradictory self-check responses', async () => {
 vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')});
 const p=make();sdk.generate.mockResolvedValue(response({consistent:true,problems:['Contradiction.']}));
 expect((await p.selfCheck(p.draftFromRules(bundle).draft,facts)).ok).toBe(false);
});

it('immediately rejects a downloadable model without starting generation or download', async () => {
 vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('downloadable')});
 await expect(make().draftOnDevice(bundle)).rejects.toBeInstanceOf(OnDeviceUnavailableError);
 expect(sdk.generate).not.toHaveBeenCalled();expect(sdk.prepare).not.toHaveBeenCalled();
});
it('times out hung device generation with an unavailable error', async () => {
 vi.useFakeTimers();
 try {
  sdk.generate.mockReturnValue(new Promise(()=>{}));
  const assertion=expect(make().draftOnDevice(bundle)).rejects.toThrow('timed out after 45 seconds');
  await vi.advanceTimersByTimeAsync(ON_DEVICE_TIMEOUT_MS);await assertion;
 } finally {vi.useRealTimers();}
});
it('never starts on-device self-check when the model is downloadable', async () => {
 vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('downloadable')});const p=make();
 const result=await p.selfCheck(p.draftFromRules(bundle).draft,facts);expect(result.ok).toBe(true);expect(result.log[0].note).toContain('readiness is downloadable');
 expect(sdk.generate).not.toHaveBeenCalled();expect(sdk.prepare).not.toHaveBeenCalled();
});

it('returns deterministic checks with a skip note when on-device self-check times out', async () => {
 vi.useFakeTimers();
 try {
  const p=make();sdk.generate.mockReturnValue(new Promise(()=>{}));
  const pending=p.selfCheck(p.draftFromRules(bundle).draft,facts);
  await vi.advanceTimersByTimeAsync(ON_DEVICE_TIMEOUT_MS);const result=await pending;expect(result.ok).toBe(true);expect(result.issues).toEqual([]);expect(result.log[0].note).toContain('timed out');
 } finally {vi.useRealTimers();}
});

it('reconciles a mismatched rule type after Nano without rewriting its language', async () => {
 const p=make(),raw={...p.draftFromRules(bundle).draft,barrierType:'unnamed-link'};sdk.generate.mockResolvedValue(response(raw));
 const result=await p.draftOnDevice(bundle);expect(result.draft).toEqual({...raw,barrierType:'unnamed-button'});
 expect(result.log[1]).toMatchObject({step:'self-check',ranOn:'local-code',bytesSentToCloud:0,note:expect.stringContaining('Draft corrected by rules:')});
});
it('recovers missing or unknown refs only when exactly one rule target is unambiguous', async () => {
 const p=make(),raw={...p.draftFromRules(bundle).draft,targetRef:'e999',barrierType:'unnamed-link'};sdk.generate.mockResolvedValue(response(raw));
 expect((await p.draftOnDevice(bundle)).draft).toEqual({...raw,targetRef:'e3',barrierType:'unnamed-button'});
 const {targetRef,...missing}=raw;sdk.generate.mockResolvedValue(response(missing));expect((await p.draftOnDevice(bundle)).draft.targetRef).toBe('e3');
});
it('never overrides conflicting rule types or chooses between multiple rule targets', async () => {
 const p=make(),raw={...p.draftFromRules(bundle).draft,barrierType:'other'};
 const ambiguous={...facts,ruleHits:[...facts.ruleHits,{ruleId:'br-focus-not-visible',ref:'e3',detail:'No focus.'}]};
 sdk.generate.mockResolvedValue(response(raw));const result=await p.draftOnDevice({...bundle,facts:ambiguous});expect(result.draft.barrierType).toBe('other');expect(result.log).toHaveLength(1);
 const multiple={...facts,ruleHits:[...facts.ruleHits,{ruleId:'link-name',ref:'e2',detail:'No link name.'}]};
 sdk.generate.mockResolvedValue(response({...raw,targetRef:'missing'}));await expect(p.draftOnDevice({...bundle,facts:multiple})).rejects.toThrow('Unknown targetRef');
});
it('retries one transient server error, counts both cloud attempts and records bytes/latency', async () => {
 vi.useFakeTimers();
 try {
 const p=createAiPipeline({app:{} as FirebaseApp,getConfig:()=>({...config,maxCloudCallsPerSession:2})});
 const payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 sdk.generate.mockRejectedValueOnce(new Error('AI: [503 ] Model overloaded.')).mockResolvedValueOnce(response(plan,'in_cloud'));
 const pending=p.fixPlanInCloud(payload);await vi.advanceTimersByTimeAsync(CLOUD_RETRY_DELAY_MS-1);expect(sdk.generate).toHaveBeenCalledTimes(1);
 await vi.advanceTimersByTimeAsync(1);const result=await pending;expect(sdk.generate).toHaveBeenCalledTimes(2);expect(result.log[0]).toMatchObject({bytesSentToCloud:payload.bytes*2,note:expect.stringContaining('Retried once')});
 await expect(p.fixPlanInCloud(payload)).rejects.toThrow('limit');
 }finally{vi.useRealTimers();}
});
it('does not retry quota/client errors, or exceed the budget when a retry would be needed', async () => {
 for(const status of [400,429,503]){
  sdk.generate.mockReset();const p=make(),payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
  sdk.generate.mockRejectedValue(new Error(`AI: [${status} ] overloaded`));await expect(p.fixPlanInCloud(payload)).rejects.toThrow(status===503?'limit':String(status));expect(sdk.generate).toHaveBeenCalledTimes(1);
 }
});
it('never retries more than once for repeated server failures', async () => {
 vi.useFakeTimers();try{
 const p=createAiPipeline({app:{} as FirebaseApp,getConfig:()=>({...config,maxCloudCallsPerSession:5})});const payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 sdk.generate.mockRejectedValue(new Error('AI: [500 ] high demand'));const assertion=expect(p.fixPlanInCloud(payload)).rejects.toThrow('500');await vi.advanceTimersByTimeAsync(CLOUD_RETRY_DELAY_MS);await assertion;expect(sdk.generate).toHaveBeenCalledTimes(2);
 }finally{vi.useRealTimers();}
});

it('proceeds with bounded generation when draft readiness times out as unknown', async () => {
 vi.useFakeTimers();try{
  vi.stubGlobal('LanguageModel',{availability:vi.fn().mockReturnValue(new Promise(()=>{}))});
  const p=make(),draft=p.draftFromRules(bundle).draft;sdk.generate.mockResolvedValue(response(draft));
  const pending=p.draftOnDevice(bundle);await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);
  expect((await pending).draft).toEqual(draft);expect(sdk.generate).toHaveBeenCalledTimes(1);expect(sdk.prepare).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
it('runs self-check when readiness is unknown but keeps generation timeout active', async () => {
 vi.useFakeTimers();try{
  vi.stubGlobal('LanguageModel',{availability:vi.fn().mockReturnValue(new Promise(()=>{}))});
  const p=make();sdk.generate.mockResolvedValue(response({consistent:true,problems:[]}));
  const pending=p.selfCheck(p.draftFromRules(bundle).draft,facts);await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);expect((await pending).ok).toBe(true);
  sdk.generate.mockReturnValue(new Promise(()=>{}));const assertion=expect(p.draftOnDevice(bundle)).rejects.toBeInstanceOf(OnDeviceUnavailableError);
  await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS+ON_DEVICE_TIMEOUT_MS);await assertion;
 }finally{vi.useRealTimers();}
});
it('re-probes unknown display readiness with a 15 second deadline', async () => {
 vi.useFakeTimers();try{
  const availability=vi.fn().mockReturnValueOnce(new Promise(()=>{})).mockResolvedValueOnce('available');vi.stubGlobal('LanguageModel',{availability});
  const pending=make().onDeviceState();await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS);expect(await pending).toBe('available');expect(availability).toHaveBeenCalledTimes(2);
  availability.mockReturnValue(new Promise(()=>{}));const unavailable=make().onDeviceState();await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS+DISPLAY_READINESS_RETRY_MS);expect(await unavailable).toBe('unavailable');
 }finally{vi.useRealTimers();}
});
it('reports readiness timing and the exact unavailable message through diagnostic events', async () => {
 const listener=vi.fn();globalThis.addEventListener('barrierrelay:device-diagnostic',listener);
 try{
  vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('downloading')});await expect(make().draftOnDevice(bundle)).rejects.toThrow('downloading');
  const details=listener.mock.calls.map(([event])=>event.detail);expect(details[0]).toMatchObject({kind:'readiness',state:'downloading',timeoutMs:READINESS_TIMEOUT_MS});
  expect(details[1]).toMatchObject({kind:'unavailable-error',operation:'draft',message:expect.stringContaining('downloading')});expect(sdk.generate).not.toHaveBeenCalled();
 }finally{globalThis.removeEventListener('barrierrelay:device-diagnostic',listener);}
});

it.each(['downloadable','downloading','unavailable'])('keeps a valid rules draft usable when self-check readiness is %s', async state => {
 vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue(state)});const p=make();
 const result=await p.selfCheck(p.draftFromRules(bundle).draft,facts);
 expect(result.ok).toBe(true);expect(result.issues).toEqual([]);expect(result.log).toHaveLength(1);expect(result.log[0]).toMatchObject({ranOn:'local-code',bytesSentToCloud:0,note:expect.stringContaining(`readiness is ${state}`)});
 expect(sdk.generate).not.toHaveBeenCalled();expect(sdk.prepare).not.toHaveBeenCalled();
});
it.each([{code:'api-not-enabled'},new Error('An unknown error occurred: kErrorUnknown')])('degrades gracefully after native self-check error %j',async error=>{
 const p=make();sdk.generate.mockRejectedValue(error);const result=await p.selfCheck(p.draftFromRules(bundle).draft,facts);
 expect(result.ok).toBe(true);expect(result.issues).toEqual([]);expect(result.log[0].note).toContain('on-device check skipped');expect(result.log[0].note).toContain('Review manually');
});
it('preserves deterministic rejection even when the on-device model is unavailable',async()=>{
 vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('unavailable')});const p=make();
 const result=await p.selfCheck({...p.draftFromRules(bundle).draft,targetRef:'missing'},facts);
 expect(result.ok).toBe(false);expect(result.issues.join(' ')).toContain('Unknown targetRef');expect(sdk.generate).not.toHaveBeenCalled();
});
it('returns the local result if an unknown-readiness self-check later times out',async()=>{
 vi.useFakeTimers();try{
  vi.stubGlobal('LanguageModel',{availability:vi.fn().mockReturnValue(new Promise(()=>{}))});const p=make();sdk.generate.mockReturnValue(new Promise(()=>{}));
  const pending=p.selfCheck(p.draftFromRules(bundle).draft,facts);await vi.advanceTimersByTimeAsync(READINESS_TIMEOUT_MS+ON_DEVICE_TIMEOUT_MS);
  expect(await pending).toMatchObject({ok:true,issues:[],log:[{ranOn:'local-code',note:expect.stringContaining('timed out')}]});
 }finally{vi.useRealTimers();}
});
