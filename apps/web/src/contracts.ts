// Module boundaries inside apps/web. Coordinator-owned: implementers must match these signatures.
import type { BarrierDraft, CaptureFacts, FixPlan, RoutingLogEntry, Ticket, TicketStatus, RuleHit } from '@barrierrelay/shared/src/schema';

/** A capture handed over by the extension (or loaded from a fixture in demo mode). */
export interface CaptureBundle {
  facts: CaptureFacts;
  regionPng: Blob | null;      // cropped region screenshot; stays on device
  source: 'extension' | 'fixture' | 'file';
}

export type OnDeviceState = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported-browser';

/** src/ai/pipeline.ts (AI worker) */
export interface AiPipeline {
  onDeviceState(): Promise<OnDeviceState>;
  /** Must be called from a user gesture handler. Reports 0..1 progress when the browser exposes it. */
  prepareOnDevice(onProgress?: (p: number) => void): Promise<OnDeviceState>;
  /** On-device structured draft. Never sends facts/image to the cloud. Throws OnDeviceUnavailableError if no on-device model. */
  draftOnDevice(bundle: CaptureBundle): Promise<{ draft: BarrierDraft; log: RoutingLogEntry[] }>;
  /** Deterministic + on-device self-check of the draft against the facts (targetRef exists, type consistent with ruleHits, no PII patterns). */
  selfCheck(draft: BarrierDraft, facts: CaptureFacts): Promise<{ ok: boolean; issues: string[]; log: RoutingLogEntry[] }>;
  /** Manual fallback when no on-device model: deterministic draft from ruleHits + userNote, editable by the user. No AI, no cloud. */
  draftFromRules(bundle: CaptureBundle): { draft: BarrierDraft; log: RoutingLogEntry[] };
  /** Cloud fix plan from the reporter-approved, redacted payload only. Uses Google Search grounding when enabled by Remote Config. */
  fixPlanInCloud(payload: SharePayload): Promise<{ fixPlan: FixPlan; log: RoutingLogEntry[] }>;
}

export class OnDeviceUnavailableError extends Error {}

/** src/privacy/redact.ts (AI worker) — pure function, unit-tested. */
export interface SharePayload {
  site: { origin: string; path: string };
  draft: BarrierDraft;
  sharedFacts: Ticket['sharedFacts'];
  bytes: number;               // JSON byte length that will be sent to the cloud
}
export interface ShareApprovals { includeEnvironment?: boolean; includePath: boolean; includeVisibleText: boolean; includeFocusTrail: boolean }
export type Redact = (bundle: CaptureBundle, draft: BarrierDraft, approvals: ShareApprovals) => SharePayload;

/** src/store/tickets.ts (Firebase worker) */
export interface TicketStore {
  create(payload: SharePayload, fixPlan: FixPlan | null, routing: RoutingLogEntry[]): Promise<{ id: string; ownerLink: string }>;
  get(id: string): Promise<Ticket | null>;
  setStatus(id: string, status: TicketStatus): Promise<void>;
  addVerification(id: string, result: 'pass' | 'fail', ruleHitsAfter: RuleHit[]): Promise<void>;
  listMine(): Promise<Ticket[]>;
}

/** src/capture/intake.ts (extension worker) — resolves when a capture arrives from the extension. */
export interface CaptureIntake {
  waitForCapture(signal?: AbortSignal): Promise<CaptureBundle>;
  loadFixture(caseId: string, variant: 'broken' | 'fixed'): Promise<CaptureBundle>; // fetches /fixtures/... copied into public/
  extensionInstalled(): Promise<boolean>;
}

/** src/config.ts (Firebase worker) — Remote Config backed, with in-code defaults. */
export interface AppConfig {
  cloudModel: string;              // default 'gemini-3.5-flash-lite' unless docs say otherwise
  groundingEnabled: boolean;       // default true
  maxCloudCallsPerSession: number; // default 5
  ruleCardsVersion: string;
}
