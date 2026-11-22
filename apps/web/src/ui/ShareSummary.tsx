import type { SharePayload } from '../contracts';
import { environmentWords } from '../../../../packages/collector/src/environment';

const draftFieldLabels = {
  barrierType: 'barrier type',
  targetRef: 'target element',
  summary: 'summary',
  expected: 'what you expected',
  actual: 'what happened',
  confidence: 'confidence level',
} as const satisfies Record<Exclude<keyof SharePayload['draft'], 'stepsToReproduce'>, string>;

export function summarizePayload({ site, draft, sharedFacts, bytes }: SharePayload) {
  const draftFields = (Object.keys(draftFieldLabels) as (keyof typeof draftFieldLabels)[])
    .filter(field => draft[field])
    .map(field => draftFieldLabels[field]);

  return {
    origin: site.origin,
    pagePath: site.path === '/' ? null : site.path,
    draftFields,
    steps: draft.stepsToReproduce.length,
    elements: sharedFacts.elements.length,
    namedElements: sharedFacts.elements.filter(element => element.accessibleName !== '').length,
    visibleTextEntries: sharedFacts.elements.filter(element => element.visibleText).length,
    focusSteps: sharedFacts.focusTrail.length,
    ruleHits: sharedFacts.ruleHits.length,
    assistive: sharedFacts.assistive.map(option => option.replaceAll('-', ' ')),
    bytes,
  };
}

const list = new Intl.ListFormat('en', { type: 'conjunction' });

export function ShareSummary({ payload }: { payload: SharePayload }) {
  const summary = summarizePayload(payload);

  return <>
    <div class="share-summary">
      <div>
        <h3>Shared with cloud AI and the ticket</h3>
        <ul>
          <li>
            Site <strong>{summary.origin}</strong>
            {summary.pagePath && <>, page path <strong>{summary.pagePath}</strong></>}.
          </li>
          <li>
            Reviewed draft with {list.format(summary.draftFields)}
            {summary.steps > 0 && <>, plus {summary.steps} {summary.steps === 1 ? 'step' : 'steps'} to reproduce the issue</>}.
          </li>
          <li>
            Details about {summary.elements} page {summary.elements === 1 ? 'element' : 'elements'}, with{' '}
            {summary.namedElements} redacted {summary.namedElements === 1 ? 'accessible name' : 'accessible names'}.
          </li>
          <li>{summary.ruleHits} accessibility {summary.ruleHits === 1 ? 'rule match' : 'rule matches'} with redacted details.</li>
          {payload.sharedFacts.environment && <li>Reporter environment: {environmentWords(payload.sharedFacts.environment).join('; ')}.</li>}
          {summary.assistive.length > 0 && <li>Selected accessibility tools and settings include {list.format(summary.assistive)}.</li>}
          {summary.visibleTextEntries > 0 && <li>Redacted visible text from {summary.visibleTextEntries} page {summary.visibleTextEntries === 1 ? 'element' : 'elements'}.</li>}
          {summary.focusSteps > 0 && <li>Keyboard focus trail with {summary.focusSteps} {summary.focusSteps === 1 ? 'step' : 'steps'}.</li>}
        </ul>
      </div>
      <div>
        <h3>Stays on this device</h3>
        <ul>
          <li>The screenshot of the selected region.</li>
          <li>Your original free-text note from the capture.</li>
          <li>The full capture record, including the page title and capture time.</li>
        </ul>
      </div>
    </div>
    <p aria-live="polite">About <strong>{summary.bytes} bytes</strong> in the approved report.</p>
  </>;
}
