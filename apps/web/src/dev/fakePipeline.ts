import type { AiPipeline } from '../contracts';
import { OnDeviceUnavailableError } from '../contracts';
import type { BarrierType, RoutingLogEntry } from '@barrierrelay/shared/src/schema';
const log = (step: RoutingLogEntry['step']): RoutingLogEntry[] => [{ step, mode: 'n/a', ranOn: 'local-code', ms: 0, bytesSentToCloud: 0, note: 'Deterministic demo; no AI inference.' }];
export function createFakePipeline(): AiPipeline {
  return {
    async onDeviceState() { return 'unavailable'; },
    async prepareOnDevice() { return 'unavailable'; },
    async draftOnDevice() { throw new OnDeviceUnavailableError('No on-device model in deterministic demo mode.'); },
    draftFromRules({ facts }) {
      const hit = facts.ruleHits[0];
      const types: Record<string, BarrierType> = { 'button-name': 'unnamed-button', 'link-name': 'unnamed-link', 'label': 'unlabeled-input', 'br-keyboard-unreachable': 'unreachable-by-keyboard', 'br-focus-not-visible': 'focus-not-visible', 'br-keyboard-trap': 'keyboard-trap' };
      return { draft: { barrierType: hit ? types[hit.ruleId] ?? 'other' : 'none', targetRef: hit?.ref ?? null, summary: hit ? `Accessibility barrier: ${hit.ruleId}` : 'No supported barrier detected', stepsToReproduce: ['Open the page.', 'Navigate to the reported control using the keyboard.'], expected: 'The control has a clear name and works with the keyboard.', actual: hit?.detail.slice(0, 160) ?? 'No supported rule hits.', confidence: 'medium' }, log: log('draft') };
    },
    async selfCheck(draft, facts) { const issues = draft.targetRef && !facts.elements.some(e => e.ref === draft.targetRef) ? ['Target reference is not in the capture.'] : []; return { ok: !issues.length, issues, log: log('self-check') }; },
    async fixPlanInCloud() { return { fixPlan: { wcag: [{ sc: '4.1.2', title: 'Name, Role, Value', level: 'A' }], rootCause: 'Demo rule-based guidance; no cloud AI was called. Confirm the specific control with the reporter.', fix: { description: 'Use a native control with an accessible name and retain the visible focus indicator.', codeBefore: '<button><svg aria-hidden="true">…</svg></button>', codeAfter: '<button aria-label="Pay now"><svg aria-hidden="true">…</svg></button>' }, verification: ['Tab to the control and confirm focus is visible.', 'Confirm its name with a screen reader.', 'Activate with Enter and Space.'], sources: [] }, log: log('fix-plan') }; },
  };
}
