import { beforeEach, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
import type { CaptureFacts, FixPlan } from '@barrierrelay/shared/src/schema';
import { createAiPipeline, OnDeviceUnavailableError, ON_DEVICE_TIMEOUT_MS } from './pipeline';
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
  sdk.generate.mockResolvedValue(response(draft)); await expect(p.draftOnDevice(bundle)).rejects.toThrow('Unknown targetRef'); sdk.generate.mockClear();
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
 const check=await p.selfCheck(p.draftFromRules(bundle).draft,facts);
 expect(check.log[0].note).toContain('unavailable');expect(sdk.generate).not.toHaveBeenCalled();expect(sdk.prepare).not.toHaveBeenCalled();
});

it('times out a hung on-device self-check without accepting it', async () => {
 vi.useFakeTimers();
 try {
  const p=make();sdk.generate.mockReturnValue(new Promise(()=>{}));
  const assertion=expect(p.selfCheck(p.draftFromRules(bundle).draft,facts)).rejects.toBeInstanceOf(OnDeviceUnavailableError);
  await vi.advanceTimersByTimeAsync(ON_DEVICE_TIMEOUT_MS);await assertion;
 } finally {vi.useRealTimers();}
});
