import type { Redact } from '../contracts';

// Recreate regexes for each call, so global regex state never changes the result.
const patterns = () => [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  /\+?\d[\d ().-]{5,}\d/g,
  /(?:\d[ -]?){13,19}/g,
];
export function containsPii(text: string): boolean {
  return patterns().some(pattern => pattern.test(text));
}
export function scrubPii(text: string): string {
  return patterns().reduce((value, pattern) => value.replace(pattern, '[redacted]'), text);
}
export const redact: Redact = (bundle, draft, approvals) => {
  const facts = bundle.facts;
  // Do not serialize CaptureFacts: userNote, page title, screenshot and capture URL
  // must never become part of the approved cloud payload.
  const url = new URL(facts.page.url);
  const cleanDraft = {
    barrierType: draft.barrierType, targetRef: draft.targetRef,
    summary: scrubPii(draft.summary),
    stepsToReproduce: draft.stepsToReproduce.map(scrubPii),
    expected: scrubPii(draft.expected), actual: scrubPii(draft.actual), confidence: draft.confidence,
  };
  const data = scrubStrings({
    site: { origin: url.origin, path: approvals.includePath ? scrubPii(decodePath(url.pathname)) : '/' },
    draft: cleanDraft,
    sharedFacts: {
      elements: facts.elements.map(e => ({
        ref: e.ref, tag: e.tag, role: e.role, accessibleName: scrubPii(e.accessibleName),
        nameSources: [...e.nameSources], ...(e.inputType ? { inputType: e.inputType } : {}),
        focusable: e.focusable, tabIndex: e.tabIndex, visibleFocusIndicator: e.visibleFocusIndicator,
        bbox: { ...e.bbox },
        ...(approvals.includeVisibleText && e.visibleText !== undefined ? { visibleText: scrubPii(e.visibleText) } : {}),
        attrs: Object.fromEntries(Object.entries(e.attrs)
          .filter(([key]) => /^(role|type|autocomplete|aria-[a-z-]+)$/.test(key))
          .map(([key, value]) => [key, scrubPii(value)])),
      })),
      focusTrail: approvals.includeFocusTrail ? facts.focusTrail.map(step => ({
        index: step.index, key: step.key, ref: step.ref,
        ...(step.announced !== undefined ? { announced: scrubPii(step.announced) } : {}),
      })) : [],
      ruleHits: facts.ruleHits.map(hit => ({ ruleId: hit.ruleId, ref: hit.ref, detail: scrubPii(hit.detail) })),
      assistive: [...facts.assistive],
    },
  });
  // Origin identifies the site, including localhost/IP hosts; it is not report text.
  data.site.origin = url.origin;
  return { ...data, bytes: new TextEncoder().encode(JSON.stringify(data)).byteLength };
};
function decodePath(path: string): string { try { return decodeURIComponent(path); } catch { return path; } }
export default redact;

// Re-scan every string in the constructed allowlisted payload, including less
// common fields such as nameSources and ARIA values. Numeric geometry is not text.
function scrubStrings<T>(value: T): T {
  if (typeof value === 'string') return scrubPii(value) as T;
  if (Array.isArray(value)) return value.map(scrubStrings) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubStrings(item)])) as T;
  return value;
}
