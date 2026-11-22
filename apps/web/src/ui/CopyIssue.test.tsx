import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { Ticket } from '@barrierrelay/shared/src/schema';
import { CopyIssue } from './CopyIssue';
import { issueMarkdown } from '../owner/issueExport';

const ticket: Ticket = {
  id: 'private-id', reporterUid: 'private-user', createdAt: '', status: 'open',
  site: { origin: 'https://example.com', path: '/' },
  draft: { barrierType: 'other', targetRef: null, summary: 'Barrier', stepsToReproduce: ['Tab'], expected: 'Focus', actual: 'No focus', confidence: 'high' },
  fixPlan: null, routing: [], sharedFacts: { elements: [], focusTrail: [], ruleHits: [], assistive: [] },
};
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
function mockClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, get: () => value });
}
let root: HTMLDivElement;
function mount() {
  root = document.createElement('div'); document.body.append(root);
  act(() => render(<CopyIssue ticket={ticket} />, root));
}
async function copy() {
  await act(async () => { root.querySelector('button')!.click(); await Promise.resolve(); });
}
afterEach(() => {
  if (root) { act(() => render(null, root)); root.remove(); }
  vi.restoreAllMocks();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});
describe('CopyIssue', () => {
  it('copies Markdown and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard({ writeText });
    mount(); await copy();
    expect(writeText).toHaveBeenCalledWith(issueMarkdown(ticket));
    expect(root.querySelector('[role="status"]')!.textContent).toContain('copied');
  });
  it('announces clipboard failure', async () => {
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    mount(); await copy();
    expect(root.querySelector('[role="status"]')!.textContent).toContain('Could not copy');
  });
  it('handles an unavailable clipboard', async () => {
    mockClipboard(undefined);
    mount(); await copy();
    expect(root.querySelector('[role="status"]')!.textContent).toContain('Clipboard unavailable');
  });
  it('offers a properly labelled repository input and only valid external links', () => {
    mount();
    const input = root.querySelector('input')!;
    expect(input.closest('label')!.textContent).toContain('owner/repo');
    expect(root.querySelector('a')).toBeNull();
    act(() => { input.value = ' owner/_repo '; input.dispatchEvent(new Event('input', { bubbles: true })); });
    const link = root.querySelector('a')!;
    expect(link.href).toMatch(/^https:\/\/github\.com\/owner\/_repo\/issues\/new\?/);
    expect(link.target).toBe('_blank'); expect(link.rel).toBe('noreferrer');
    act(() => { input.value = '../bad/repo'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(root.querySelector('a')).toBeNull();
    act(() => { input.value = 'owner/private-id'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(root.querySelector('a')).toBeNull();
  });
});
