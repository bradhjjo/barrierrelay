// BarrierRelay shared contracts. Owned by the coordinator; workers must not change
// field names or semantics without an orca "ask". Additive optional fields need an ask too.

/** What blocked the user. 'none' = the captured region has no barrier of the supported kinds. */
export type BarrierType =
  | 'unlabeled-input'        // form control with no accessible name (WCAG 1.3.1 / 4.1.2 / 3.3.2)
  | 'unnamed-button'         // button (native or role) with no accessible name (4.1.2)
  | 'unnamed-link'           // link with no accessible name, e.g. icon/image link (2.4.4 / 4.1.2)
  | 'unreachable-by-keyboard'// interactive thing that cannot get keyboard focus or be activated (2.1.1)
  | 'focus-not-visible'      // focus moves but no visible indicator (2.4.7)
  | 'keyboard-trap'          // focus cannot leave a component with the keyboard (2.1.2)
  | 'other'
  | 'none';

export const BARRIER_TYPES: BarrierType[] = [
  'unlabeled-input', 'unnamed-button', 'unnamed-link', 'unreachable-by-keyboard',
  'focus-not-visible', 'keyboard-trap', 'other', 'none',
];

export type AssistiveContext = 'screen-reader' | 'keyboard-only' | 'voice-control' | 'low-vision' | 'switch-access';

export interface BBox { x: number; y: number; w: number; h: number }

/** One element inside the user-selected region. Never contains form values, cookies or full HTML. */
export interface ElementFact {
  ref: string;                 // virtual id "e1", "e2"... stable within one capture; never a real selector/id
  tag: string;                 // lowercase tag name
  role: string | null;         // explicit role attr or implicit ARIA role
  accessibleName: string;      // computed accessible name ('' if none), max 80 chars
  nameSources: string[];       // where the name came from: 'aria-label','aria-labelledby','label','text','title','alt','placeholder'
  inputType?: string;          // for <input>
  focusable: boolean;          // reachable by Tab
  tabIndex: number | null;
  visibleFocusIndicator: boolean | null; // null = not measured
  bbox: BBox;                  // CSS px relative to the viewport at capture time
  visibleText?: string;        // trimmed visible text, max 40 chars, digits masked as '#'; never input values
  attrs: Record<string, string>; // allowlist only: role, type, aria-*, autocomplete, alt (presence -> 'present'/'empty'), href (origin+path only)
}

export interface FocusStep {
  index: number;               // 0-based order
  key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Space' | 'Escape';
  ref: string | null;          // element that had focus after the key; null = focus left the region / body
  announced?: string;          // what a screen reader would roughly announce: "<role>, <name>"
}

export interface RuleHit { ruleId: string; ref: string; detail: string } // ruleId = axe-core rule id or 'br-*' for own rules

/** Output of the deterministic collector (no AI). Input to on-device drafting. */
export interface CaptureFacts {
  schemaVersion: 1;
  environment?: {
    browser: { name: string; major: number | null };
    os: { name: string };
    settings: { forcedColors: boolean; prefersContrast: 'more' | 'less' | 'custom' | 'no-preference'; reducedMotion: boolean; colorScheme: 'light' | 'dark'; devicePixelRatio: number };
  };
  capturedAt: string;          // ISO time
  page: { url: string; title: string; lang: string | null; viewport: { w: number; h: number } }; // url = origin+pathname only
  region: BBox;
  elements: ElementFact[];     // max 40, ordered by DOM order
  focusTrail: FocusStep[];     // max 20
  ruleHits: RuleHit[];
  userNote: string;            // the user's own words, max 300 chars
  assistive: AssistiveContext[];
}

/** On-device (Gemini Nano) output. Small on purpose: single-turn, structured output. */
export interface BarrierDraft {
  barrierType: BarrierType;
  targetRef: string | null;    // ElementFact.ref, null when barrierType = 'none'
  summary: string;             // <= 160 chars, plain English, no personal data
  stepsToReproduce: string[];  // 1..5 short steps
  expected: string;            // <= 160 chars
  actual: string;              // <= 160 chars
  confidence: 'low' | 'medium' | 'high';
}

/** Cloud output (grounded fix plan for the site owner). */
export interface FixPlan {
  wcag: { sc: string; title: string; level: 'A' | 'AA' | 'AAA' }[]; // e.g. {sc:'4.1.2', title:'Name, Role, Value', level:'A'}
  rootCause: string;
  fix: { description: string; codeBefore?: string; codeAfter: string };
  verification: string[];      // manual keyboard / screen reader checks
  sources: { title: string; url: string }[]; // grounding sources actually returned by the API; empty if none
}

export type RanOn = 'on-device' | 'in-cloud' | 'local-code';

export interface RoutingLogEntry {
  step: 'collect' | 'image-describe' | 'draft' | 'self-check' | 'fix-plan' | 'redact' | 'verify';
  mode: 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD' | 'n/a';
  ranOn: RanOn;
  ms: number;
  bytesSentToCloud: number;    // 0 for on-device/local steps
  note?: string;
}

export type TicketStatus = 'open' | 'acknowledged' | 'fixed' | 'verified';

/** Firestore document tickets/{ticketId}. Only what the reporter approved for sharing. */
export interface Ticket {
  id: string;
  reporterUid: string;
  createdAt: string;
  status: TicketStatus;
  site: { origin: string; path: string };
  draft: BarrierDraft;
  fixPlan: FixPlan | null;
  sharedFacts: Pick<CaptureFacts, 'elements' | 'focusTrail' | 'ruleHits' | 'assistive' | 'environment'>; // reporter-approved subset
  routing: RoutingLogEntry[];
  verification?: { at: string; result: 'pass' | 'fail'; ruleHitsAfter: RuleHit[] };
}

/** Ground truth for one synthetic fixture page (fixtures/pairs/NN-slug/truth.json). */
export interface FixtureTruth {
  id: string;                  // "02-icon-pay-button"
  variant: 'broken' | 'fixed';
  barrierType: BarrierType;    // 'none' for fixed variants
  targetRef: string | null;    // ref in the matching facts file
  wcag: string[];              // e.g. ["4.1.2"]
  userNote: string;            // what the user would say, first person
  assistive: AssistiveContext[];
  regionSelector: string;      // CSS selector used only by the fixture tooling to crop the region
}
