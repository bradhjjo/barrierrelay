import { beforeEach, expect, it, vi } from 'vitest';
import type { FirebaseApp } from 'firebase/app';
import type { CaptureFacts, FixPlan } from '@barrierrelay/shared/src/schema';
import { createAiPipeline, OnDeviceUnavailableError } from './pipeline';
import { BARRIER_DRAFT_SCHEMA, DRAFT_SYSTEM_PROMPT, draftPrompt } from './prompts';
import promptSpec from './draft-prompt.json';
import { redact } from '../privacy/redact';
const sdk = vi.hoisted(() => ({ generate:vi.fn(), prepare:vi.fn(), model:vi.fn() }));
vi.mock('firebase/ai', async importOriginal => ({ ...await importOriginal<typeof import('firebase/ai')>(), getAI:vi.fn(() => ({})), GoogleAIBackend:vi.fn(), getGenerativeModel:sdk.model }));
const captures = import.meta.glob('../../../../fixtures/pairs/*/broken.facts.json', { eager:true, import:'default' }) as Record<string,CaptureFacts>;
const truths = import.meta.glob('../../../../fixtures/pairs/*/truth.broken.json', { eager:true, import:'default' }) as Record<string,{barrierType:string}>;
const facts = Object.entries(captures).find(([path]) => path.includes('02-icon'))![1];
const bundle = { facts, regionPng:null, source:'fixture' as const };
const config = { cloudModel:'gemini-3.5-flash-lite', groundingEnabled:true, maxCloudCallsPerSession:1, ruleCardsVersion:'1' };
const make = () => createAiPipeline({ app:{} as FirebaseApp, getConfig:() => config });
const response = (value:unknown, inferenceSource='on_device', extra={}) => ({ response:{ text:() => JSON.stringify(value), inferenceSource,...extra } });
beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); sdk.model.mockImplementation(() => ({ generateContent:sdk.generate, initializeDeviceModel:sdk.prepare })); });
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
  vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')}); const p=make(); sdk.generate.mockResolvedValue(response({ok:false,issues:['Insufficient evidence.']}));
  const check=await p.selfCheck(p.draftFromRules(bundle).draft,facts); expect(check.ok).toBe(false); expect(check.issues).toContain('Insufficient evidence.'); expect(check.log[1]).toMatchObject({ranOn:'on-device',step:'self-check'});
});
it('reports unsupported-browser and uses SDK prepare progress', async () => {
  const p=make(); expect(await p.onDeviceState()).toBe('unsupported-browser'); vi.stubGlobal('LanguageModel',{availability:vi.fn().mockResolvedValue('available')});
  sdk.prepare.mockImplementation(async(callback:(n:number)=>void)=>callback(.7)); const progress=vi.fn(); expect(await p.prepareOnDevice(progress)).toBe('available'); expect(progress).toHaveBeenCalledWith(.7);
});
it('classifies at least 8 of all 10 broken fixtures deterministically', () => {
  const p=make(); let score=0; const failures:string[]=[]; expect(Object.keys(captures)).toHaveLength(10);
  for(const [path,facts] of Object.entries(captures)){ const truth=truths[path.replace('broken.facts.json','truth.broken.json')]; const result=p.draftFromRules({...bundle,facts}); if(result.draft.barrierType===truth.barrierType)score++;else failures.push(path); expect(result.draft.confidence).toBe('low');expect(result.log[0].ranOn).toBe('local-code'); }
  console.info(`draftFromRules: ${score}/10; failures: ${failures.join(', ')||'none'}`);expect(score).toBeGreaterThanOrEqual(8);
});
it('uses the same shared JSON prompt/schema as the eval runner', () => { expect(DRAFT_SYSTEM_PROMPT).toBe(promptSpec.system);expect(BARRIER_DRAFT_SCHEMA).toEqual(promptSpec.schema);expect(draftPrompt(facts)).toBe(JSON.stringify(facts)); });
const plan:FixPlan={wcag:[{sc:'4.1.2',title:'Name, Role, Value',level:'A'}],rootCause:'No button name.',fix:{description:'Add name.',codeBefore:'<button></button>',codeAfter:'<button aria-label="Pay"></button>'},verification:['Check the announced name.'],sources:[{title:'Invented',url:'https://invented.invalid'}]};
it('maps grounding metadata sources, counts bytes, enforces session budget', async () => {
 const p=make(),payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 sdk.generate.mockResolvedValue(response(plan,'in_cloud',{candidates:[{groundingMetadata:{groundingChunks:[{web:{uri:'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',title:'Name, Role, Value'}},{web:{uri:'javascript:alert(1)',title:'Unsafe'}}]}}]}));
 const result=await p.fixPlanInCloud(payload);expect(result.fixPlan.sources).toEqual([{title:'Name, Role, Value',url:'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html'}]);expect(result.log[0]).toMatchObject({ranOn:'in-cloud',bytesSentToCloud:payload.bytes});
 expect(sdk.model.mock.calls.at(-1)?.[1]).toMatchObject({mode:'only_in_cloud',inCloudParams:{model:config.cloudModel,tools:[{googleSearch:{}}]}});
 await expect(p.fixPlanInCloud(payload)).rejects.toThrow('limit');expect(sdk.generate).toHaveBeenCalledTimes(1);
});
it('ignores invented sources and rejects malformed plans', async () => {
 const p=make(),payload=redact(bundle,p.draftFromRules(bundle).draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});sdk.generate.mockResolvedValue(response(plan,'in_cloud'));
 expect((await p.fixPlanInCloud(payload)).fixPlan.sources).toEqual([]);sdk.generate.mockResolvedValue(response({fix:{}},'in_cloud'));await expect(make().fixPlanInCloud(payload)).rejects.toThrow('Invalid FixPlan');
});
