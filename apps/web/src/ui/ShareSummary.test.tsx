// @vitest-environment jsdom
import { render } from 'preact';
import { expect, it } from 'vitest';
import type { CaptureFacts } from '@barrierrelay/shared/src/schema';
import factsFixture from '../../../../fixtures/pairs/02-icon-pay-button/broken.facts.json';
import type { CaptureBundle, ShareApprovals, SharePayload } from '../contracts';
import { redact } from '../privacy/redact';
import { ShareSummary, summarizePayload } from './ShareSummary';
import { collectEnvironment } from '../../../../packages/collector/src/environment';
it('lists environment only when approved for cloud and ticket', () => {
  const capture = structuredClone(bundle); capture.facts.environment = collectEnvironment();
  const host = document.createElement('div');
  render(<ShareSummary payload={redact(capture, draft, allowed)} />, host);
  expect(host.querySelector('ul')?.textContent).toContain('Reporter environment: Browser:');
  render(<ShareSummary payload={redact(capture, draft, { ...allowed, includeEnvironment: false })} />, host);
  expect(host.textContent).not.toContain('Reporter environment:');
});

const bundle: CaptureBundle = {
  facts: {
    ...factsFixture as unknown as CaptureFacts,
    page: { ...factsFixture.page, url: 'https://example.org/checkout?private=value' },
    userNote: 'My private capture note',
  },
  regionPng: null,
  source: 'fixture',
};
const draft: SharePayload['draft'] = {
  barrierType: 'unnamed-button',
  targetRef: null,
  summary: 'A button has no name.',
  stepsToReproduce: ['Tab to the button.'],
  expected: 'The button announces its purpose.',
  actual: 'The button has no name.',
  confidence: 'low',
};
const blocked: ShareApprovals = { includePath: false, includeVisibleText: false, includeFocusTrail: false };
const allowed: ShareApprovals = { includePath: true, includeVisibleText: true, includeFocusTrail: true };

it('counts only values in the redacted payload and treats a root path as site-only', () => {
  const payload = redact(bundle, draft, blocked);

  expect(summarizePayload(payload)).toEqual({
    origin: 'https://example.org',
    pagePath: null,
    draftFields: ['barrier type', 'summary', 'what you expected', 'what happened', 'confidence level'],
    steps: 1,
    elements: 4,
    namedElements: 1,
    visibleTextEntries: 0,
    focusSteps: 0,
    ruleHits: 1,
    assistive: ['screen reader'],
    bytes: payload.bytes,
  });
});

it('updates the two review lists when the actual shared data changes', () => {
  const host = document.createElement('div');
  render(<ShareSummary payload={redact(bundle, draft, blocked)} />, host);

  expect(Array.from(host.querySelectorAll('h3'), heading => heading.textContent)).toEqual([
    'Shared with cloud AI and the ticket', 'Stays on this device',
  ]);
  const [shared, local] = host.querySelectorAll('ul');
  expect(local.querySelectorAll('li')).toHaveLength(3);
  expect(shared.textContent).toContain('4 page elements, with 1 redacted accessible name');
  expect(shared.textContent).toContain('1 accessibility rule match with redacted details');
  expect(shared.textContent).not.toMatch(/checkout|visible text|focus trail/);
  expect(host.textContent).not.toContain(bundle.facts.userNote);

  const payload = redact(bundle, { ...draft, targetRef: bundle.facts.elements[0].ref }, allowed);
  render(<ShareSummary payload={payload} />, host);

  expect(shared.textContent).toContain('page path /checkout');
  expect(shared.textContent).toContain('target element');
  expect(shared.textContent).toContain('Redacted visible text from 3 page elements');
  expect(shared.textContent).toContain('Keyboard focus trail with 12 steps');
  expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain(`${payload.bytes} bytes`);
  expect(host.textContent).not.toContain('?private=value');
});
