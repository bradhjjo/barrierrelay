import type { FirebaseApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, Schema, type EnhancedGenerateContentResponse, type URLContextMetadata, type Part } from 'firebase/ai';
import type { CaptureFacts, RoutingLogEntry, RanOn } from '@barrierrelay/shared/src/schema';
import { OnDeviceUnavailableError, type AiPipeline, type AppConfig, type OnDeviceState } from '../contracts';
import { BARRIER_DRAFT_SCHEMA, DRAFT_SYSTEM_PROMPT, SELF_CHECK_PROMPT, SELF_CHECK_SCHEMA, SELF_CHECK_SAMPLING, selfCheckPrompt, draftPrompt, fixPlanPrompt } from './prompts';
import { draftIssues, parseJson, validateDraft, validateFixPlan } from './validation';
import { ruleDraft, ruleTypes } from './rules';
import { reconcileDraft } from './reconcile';
import { wcagReferences } from './wcag';
export { OnDeviceUnavailableError } from '../contracts';

type LanguageModelApi = { availability(options?: unknown): Promise<string> };
const languageModel = (): LanguageModelApi | undefined => (globalThis as typeof globalThis & { LanguageModel?: LanguageModelApi }).LanguageModel;
const unavailable = (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && /(?:^|\/)api-not-enabled$/.test(String(e.code));
function ranOn(response: EnhancedGenerateContentResponse): RanOn {
  if (response.inferenceSource === 'on_device') return 'on-device';
  if (response.inferenceSource === 'in_cloud') return 'in-cloud';
  throw new Error('Firebase response has no recognized inferenceSource; routing cannot be verified.');
}
export function urlContextSources(metadata: URLContextMetadata | undefined, references: { title: string; url: string }[]): { title: string; url: string }[] {
  const seen = new Set<string>();
  // URL context can return a WCAG 2.1 equivalent for the supplied 2.2 URL.
  // Match only the same official W3C Understanding slug and retain the actual retrieved URL.
  const titles = new Map(references.flatMap(reference => ['WCAG20', 'WCAG21', 'WCAG22'].map(version =>
    [reference.url.replace('WCAG22', version), reference.title] as const)));
  return (metadata?.urlMetadata ?? []).flatMap(entry => {
    const url = entry.retrievedUrl;
    if (entry.urlRetrievalStatus !== 'URL_RETRIEVAL_STATUS_SUCCESS' || !url || !titles.has(url) || seen.has(url)) return [];
    seen.add(url);
    return [{ title: titles.get(url)!, url }];
  });
}
const fixSchema = Schema.object({ properties: {
  wcag: Schema.array({ items: Schema.object({ properties: { sc: Schema.string(), title: Schema.string(), level: Schema.enumString({ enum: ['A','AA','AAA'] }) } }) }),
  rootCause: Schema.string(), fix: Schema.object({ properties: { description: Schema.string(), codeBefore: Schema.string(), codeAfter: Schema.string() }, optionalProperties: ['codeBefore'] }),
  verification: Schema.array({ items: Schema.string() }), sources: Schema.array({ items: Schema.object({ properties: { title: Schema.string(), url: Schema.string() } }) }),
} });
export const ON_DEVICE_TIMEOUT_MS = 45_000;
export const READINESS_TIMEOUT_MS = 5_000;
export const DISPLAY_READINESS_RETRY_MS = 15_000;
type Readiness = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unknown';
function deviceDiagnostic(detail: Record<string, unknown>): void {
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent('barrierrelay:device-diagnostic', { detail }));
  }
}
function deviceUnavailable(message: string, operation: string): OnDeviceUnavailableError {
  deviceDiagnostic({ kind: 'unavailable-error', operation, message });
  return new OnDeviceUnavailableError(message);
}
export const CLOUD_RETRY_DELAY_MS = 1_500;
function retryableCloudError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { status?: unknown; statusCode?: unknown; httpStatus?: unknown; message?: unknown; code?: unknown };
  const message = typeof e.message === 'string' ? e.message : '';
  const status = Number(e.status ?? e.statusCode ?? e.httpStatus ?? message.match(/(?:\[|\bHTTP\s+)(\d{3})(?:\s|\]|$)/i)?.[1]);
  // Explicit 4xx wins over vague words such as 'overloaded' in an error body.
  if (status >= 400 && status < 500) return false;
  if (status >= 500 && status < 600) return true;
  return /(?:overloaded|high demand|service unavailable|UNAVAILABLE)/i.test(message) || e.code === 'AI/server-error';
}

async function deviceResponse<T>(request: Promise<T>, operation: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([request, new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(deviceUnavailable('On-device AI timed out after 45 seconds. Use the local rules draft or try preparing the model again.', operation)), ON_DEVICE_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}
export function createAiPipeline({ app, getConfig }: { app: FirebaseApp; getConfig: () => AppConfig }): AiPipeline {
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  let cloudCalls = 0;
  const localModels = new Map<boolean, ReturnType<typeof getGenerativeModel>>();
  const localModel = (check = false) => {
    const existing = localModels.get(check);
    if (existing) return existing;
    const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: { ...(check ? SELF_CHECK_SAMPLING : {}), expectedInputs: [{ type: 'text' }, { type: 'image' }], initialPrompts: [{ role: 'system', content: [{ type: 'text', value: check ? SELF_CHECK_PROMPT : DRAFT_SYSTEM_PROMPT }] }] },
      promptOptions: { responseConstraint: check ? SELF_CHECK_SCHEMA : BARRIER_DRAFT_SCHEMA } },
    });
    localModels.set(check, model);
    return model;
  };
  async function readiness(timeoutMs = READINESS_TIMEOUT_MS): Promise<Readiness> {
    const start = performance.now();
    const api = languageModel();
    let state: Readiness = 'unavailable';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (api) {
        const value = await Promise.race([api.availability({ expectedInputs: [{ type: 'text' }, { type: 'image' }] }),
          new Promise<string>(resolve => { timer = setTimeout(() => resolve('unknown'), timeoutMs); })]);
        state = ['available', 'downloadable', 'downloading', 'unknown'].includes(value) ? value as Readiness : 'unavailable';
      }
    } catch { state = 'unavailable'; }
    finally {
      clearTimeout(timer);
      deviceDiagnostic({ kind: 'readiness', state, ms: performance.now() - start, timeoutMs });
    }
    return state;
  }
  async function onDeviceState(): Promise<OnDeviceState> {
    if (!languageModel()) return 'unsupported-browser';
    const first = await readiness();
    const state = first === 'unknown' ? await readiness(DISPLAY_READINESS_RETRY_MS) : first;
    return state === 'unknown' ? 'unavailable' : state;
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
      const state = await readiness();
      if (state !== 'available' && state !== 'unknown') throw deviceUnavailable(`On-device AI is ${state}. Prepare the model first or use the local rules draft.`, 'draft');
      const parts: Part[] = [{ type: 'text', text: draftPrompt(bundle.facts) }];
      if (bundle.regionPng) {
        const bytes = new Uint8Array(await bundle.regionPng.arrayBuffer());
        let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
        parts.push({ type: 'inlineData', inlineData: { mimeType: 'image/png', data: btoa(binary) } });
      }
      try {
        const result = await deviceResponse(localModel().generateContent(parts), 'draft');
        const where = ranOn(result.response);
        const raw = parseJson(result.response.text());
        const inferenceLog = log('draft','ONLY_ON_DEVICE',where,start);
        const correctionStart = performance.now();
        const reconciled = reconcileDraft(raw, bundle.facts);
        const draft = validateDraft(reconciled.draft, bundle.facts);
        return { draft, log: [inferenceLog, ...(reconciled.note ? [log('self-check','n/a','local-code',correctionStart,0,reconciled.note)] : [])] };
      } catch (e) { if (unavailable(e)) throw deviceUnavailable('The on-device model is unavailable. Use the local rules draft or prepare the model.', 'draft'); throw e; }
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
      if (!issues.length) {
        const state = await readiness();
        if (state !== 'available' && state !== 'unknown') {
          logs[0].note = `Deterministic checks passed; on-device check skipped: readiness is ${state}. Review manually.`;
          return { ok: true, issues, log: logs };
        }
        const checkStart = performance.now();
        try {
          const result = await deviceResponse(localModel(true).generateContent(selfCheckPrompt(draft, facts)), 'self-check');
          const check = parseJson(result.response.text()) as { consistent?: unknown; problems?: unknown };
          logs.push(log('self-check','ONLY_ON_DEVICE',ranOn(result.response),checkStart));
          if (typeof check.consistent !== 'boolean' || !Array.isArray(check.problems) || check.problems.length > 3 || check.problems.some(i => typeof i !== 'string') || (check.consistent && check.problems.length > 0)) issues.push('Invalid on-device self-check response.');
          else if (!check.consistent) issues.push(...(check.problems.length ? check.problems as string[] : ['Draft does not follow from the facts.']));
        } catch (e) {
          const reason = e instanceof OnDeviceUnavailableError ? 'on-device generation timed out'
            : unavailable(e) ? 'the SDK reported the model unavailable'
            : 'on-device inference or response processing failed';
          logs[0].note = `Deterministic checks passed; on-device check skipped: ${reason}. Review manually.`;
        }
      }
      return { ok: issues.length === 0, issues, log: logs };
    },
    async fixPlanInCloud(payload) {
      const cfg = getConfig();
      const budget = Math.max(0, Math.floor(cfg.maxCloudCallsPerSession));
      const reserveCall = () => {
        try {
          const stored = sessionStorage.getItem('barrierrelay:cloudCalls');
          const count = stored !== null && stored.trim() !== '' ? Number(stored) : NaN;
          if (Number.isSafeInteger(count) && count >= 0) cloudCalls = Math.max(cloudCalls, count);
        } catch { /* Storage may be unavailable; retain the in-memory budget. */ }
        if (!Number.isFinite(budget) || cloudCalls >= budget) return false;
        // Reserve each attempt before awaiting, including concurrent calls and errors.
        cloudCalls++;
        try { sessionStorage.setItem('barrierrelay:cloudCalls', String(cloudCalls)); }
        catch { /* The in-memory reservation still counts if persistence fails. */ }
        return true;
      };
      if (!reserveCall()) throw new Error('Cloud call limit reached for this session.');
      const start = performance.now();
      const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: {
        model: cfg.cloudModel, tools: cfg.groundingEnabled ? [{ urlContext: {} }] : [],
        // Gemini 3 supports URL context plus structured output. Older configurable
        // models use prompt-only JSON when URL context is enabled (one quota unit).
        ...(!cfg.groundingEnabled || /^gemini-[34](?:\.|-)/.test(cfg.cloudModel) ? { generationConfig: { responseMimeType: 'application/json', responseSchema: fixSchema } } : {}),
      } });
      const prompt = fixPlanPrompt(payload, cfg.groundingEnabled);
      let result;
      let retried = false;
      try { result = await model.generateContent(prompt); }
      catch (error) {
        if (!retryableCloudError(error)) throw error;
        if (!reserveCall()) throw error;
        retried = true;
        await new Promise(resolve => setTimeout(resolve, CLOUD_RETRY_DELAY_MS));
        result = await model.generateContent(prompt);
      }
      const fixPlan = validateFixPlan(parseJson(result.response.text()));
      fixPlan.sources = cfg.groundingEnabled ? urlContextSources(result.response.candidates?.[0]?.urlContextMetadata, wcagReferences(payload.draft.barrierType)) : [];
      return { fixPlan, log: [log('fix-plan','ONLY_IN_CLOUD',ranOn(result.response),start,payload.bytes * (retried ? 2 : 1),retried ? 'Retried once after a transient server error (1500 ms delay); 2 cloud attempts counted.' : undefined)] };
    },
  };
}
