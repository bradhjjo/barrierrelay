import type { FirebaseApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema, type EnhancedGenerateContentResponse, type GroundingMetadata, type Part } from 'firebase/ai';
import type { CaptureFacts, RoutingLogEntry, RanOn } from '@barrierrelay/shared/src/schema';
import { OnDeviceUnavailableError, type AiPipeline, type AppConfig, type OnDeviceState } from '../contracts';
import { BARRIER_DRAFT_SCHEMA, DRAFT_SYSTEM_PROMPT, SELF_CHECK_PROMPT, draftPrompt, fixPlanPrompt } from './prompts';
import { draftIssues, parseJson, validateDraft, validateFixPlan } from './validation';
import { ruleDraft, ruleTypes } from './rules';
export { OnDeviceUnavailableError } from '../contracts';

type LanguageModelApi = { availability(options?: unknown): Promise<string> };
const languageModel = (): LanguageModelApi | undefined => (globalThis as typeof globalThis & { LanguageModel?: LanguageModelApi }).LanguageModel;
const unavailable = (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && /(?:^|\/)api-not-enabled$/.test(String(e.code));
function ranOn(response: EnhancedGenerateContentResponse): RanOn {
  if (response.inferenceSource === 'on_device') return 'on-device';
  if (response.inferenceSource === 'in_cloud') return 'in-cloud';
  throw new Error('Firebase response has no recognized inferenceSource; routing cannot be verified.');
}
export function groundingSources(metadata?: GroundingMetadata): { title: string; url: string }[] {
  const seen = new Set<string>();
  return (metadata?.groundingChunks ?? []).flatMap(({ web }) => {
    if (!web?.uri || !/^https?:\/\//i.test(web.uri) || seen.has(web.uri)) return [];
    seen.add(web.uri);
    return [{ title: web.title || web.uri, url: web.uri }];
  });
}
const fixSchema = Schema.object({ properties: {
  wcag: Schema.array({ items: Schema.object({ properties: { sc: Schema.string(), title: Schema.string(), level: Schema.enumString({ enum: ['A','AA','AAA'] }) } }) }),
  rootCause: Schema.string(), fix: Schema.object({ properties: { description: Schema.string(), codeBefore: Schema.string(), codeAfter: Schema.string() }, optionalProperties: ['codeBefore'] }),
  verification: Schema.array({ items: Schema.string() }), sources: Schema.array({ items: Schema.object({ properties: { title: Schema.string(), url: Schema.string() } }) }),
} });
const checkSchema = { type: 'object', properties: { ok: { type: 'boolean' }, issues: { type: 'array', items: { type: 'string' } } }, required: ['ok','issues'], additionalProperties: false };
export function createAiPipeline({ app, getConfig }: { app: FirebaseApp; getConfig: () => AppConfig }): AiPipeline {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  let cloudCalls = 0;
  const localModels = new Map<boolean, ReturnType<typeof getGenerativeModel>>();
  const localModel = (check = false) => {
    const existing = localModels.get(check);
    if (existing) return existing;
    const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: { expectedInputs: [{ type: 'text' }, { type: 'image' }], initialPrompts: [{ role: 'system', content: [{ type: 'text', value: check ? SELF_CHECK_PROMPT : DRAFT_SYSTEM_PROMPT }] }] },
      promptOptions: { responseConstraint: check ? checkSchema : BARRIER_DRAFT_SCHEMA } },
    });
    localModels.set(check, model);
    return model;
  };
  async function onDeviceState(): Promise<OnDeviceState> {
    const api = languageModel();
    if (!api) return 'unsupported-browser';
    try {
      // Bound readiness probes: Chrome can leave availability pending when its manifest is missing.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const state = await Promise.race([api.availability({ expectedInputs: [{ type: 'text' }, { type: 'image' }] }), new Promise<string>(resolve => { timer = setTimeout(() => resolve('unavailable'), 5000); })]);
        return ['available','downloadable','downloading'].includes(state) ? state as OnDeviceState : 'unavailable';
      } finally { clearTimeout(timer); }
    } catch { return 'unavailable'; }
  }
  const log = (step: RoutingLogEntry['step'], mode: RoutingLogEntry['mode'], where: RanOn, start: number, bytes = 0, note?: string): RoutingLogEntry => ({ step, mode, ranOn: where, ms: performance.now() - start, bytesSentToCloud: bytes, ...(note ? { note } : {}) });
  return {
    onDeviceState,
    async prepareOnDevice(onProgress) {
      if (!languageModel()) return 'unsupported-browser';
      try {
        // Call immediately so the SDK can consume the caller's user activation.
        await localModel().initializeDeviceModel(p => onProgress?.(Math.max(0, Math.min(1, p))));
        return await onDeviceState();
      } catch (e) { if (unavailable(e)) return 'unavailable'; throw e; }
    },
    async draftOnDevice(bundle) {
      const start = performance.now();
      const parts: Part[] = [{ type: 'text', text: draftPrompt(bundle.facts) }];
      if (bundle.regionPng) {
        const bytes = new Uint8Array(await bundle.regionPng.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        parts.push({ type: 'inlineData', inlineData: { mimeType: 'image/png', data: btoa(binary) } });
      }
      try {
        const result = await localModel().generateContent(parts);
        const where = ranOn(result.response);
        const draft = validateDraft(parseJson(result.response.text()), bundle.facts);
        return { draft, log: [log('draft','ONLY_ON_DEVICE',where,start)] };
      } catch (e) { if (unavailable(e)) throw new OnDeviceUnavailableError('The on-device model is unavailable. Use the local rules draft or prepare the model.'); throw e; }
    },
    draftFromRules(bundle) {
      const start = performance.now();
      return { draft: ruleDraft(bundle.facts), log: [log('draft','n/a','local-code',start,0,'Deterministic rules draft; no AI.')] };
    },
    async selfCheck(draft, facts) {
      const start = performance.now();
      const issues = draftIssues(draft, facts);
      const relevant = facts.ruleHits.filter(h => h.ref === draft.targetRef && ruleTypes[h.ruleId]);
      if (relevant.length && !relevant.some(h => ruleTypes[h.ruleId] === draft.barrierType)) issues.push('barrierType is inconsistent with target ruleHits.');
      if (draft.barrierType === 'none' && facts.ruleHits.some(h => ruleTypes[h.ruleId])) issues.push('Supported ruleHits contradict none.');
      const logs = [log('self-check','n/a','local-code',start)];
      if (!issues.length && await onDeviceState() === 'available') {
        const checkStart = performance.now();
        try {
          const result = await localModel(true).generateContent(JSON.stringify({ draft, facts }));
          const check = parseJson(result.response.text()) as { ok?: unknown; issues?: unknown };
          logs.push(log('self-check','ONLY_ON_DEVICE',ranOn(result.response),checkStart));
          if (typeof check.ok !== 'boolean' || !Array.isArray(check.issues) || check.issues.some(i => typeof i !== 'string')) issues.push('Invalid on-device self-check response.');
          else if (!check.ok) issues.push(...(check.issues.length ? check.issues as string[] : ['Draft does not follow from the facts.']));
        } catch (e) { issues.push(unavailable(e) ? 'On-device self-check became unavailable; review the draft manually.' : 'On-device self-check failed; review the draft manually.'); }
      } else if (!issues.length) logs[0].note = 'Deterministic checks passed; on-device check unavailable. Review manually.';
      return { ok: issues.length === 0, issues, log: logs };
    },
    async fixPlanInCloud(payload) {
      const cfg = getConfig();
      if (cloudCalls >= Math.max(0, cfg.maxCloudCallsPerSession)) throw new Error('Cloud call limit reached for this session.');
      // Reserve before awaiting: concurrent clicks and failed attempts also consume the budget.
      cloudCalls++;
      const start = performance.now();
      const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: {
        model: cfg.cloudModel, tools: cfg.groundingEnabled ? [{ googleSearch: {} }] : [],
        // Gemini 3 supports built-in tools plus structured output. Older configurable
        // models use prompt-only JSON when grounding is enabled (one quota unit).
        ...(!cfg.groundingEnabled || /^gemini-[34](?:\.|-)/.test(cfg.cloudModel) ? { generationConfig: { responseMimeType: 'application/json', responseSchema: fixSchema } } : {}),
      } });
      const result = await model.generateContent(fixPlanPrompt(payload));
      const fixPlan = validateFixPlan(parseJson(result.response.text()));
      fixPlan.sources = groundingSources(result.response.candidates?.[0]?.groundingMetadata);
      return { fixPlan, log: [log('fix-plan','ONLY_IN_CLOUD',ranOn(result.response),start,payload.bytes)] };
    },
  };
}
