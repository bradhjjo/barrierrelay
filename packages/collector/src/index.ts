import axe from 'axe-core';
import { collectEnvironment } from './environment';
import { computeAccessibleName, getRole } from 'dom-accessibility-api';
import type { AssistiveContext, BBox, CaptureFacts, ElementFact, FocusStep, RuleHit } from '../../shared/src/schema';

export type { AssistiveContext, BBox, CaptureFacts, ElementFact, FocusStep } from '../../shared/src/schema';
export interface CollectOptions {
  userNote: string;
  assistive: AssistiveContext[];
  focusTrail?: FocusStep[];
}

const candidateSelector = [
  'a[href]', 'area[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
  'summary', '[tabindex]', '[contenteditable="true"]', '[role]', '[aria-label]',
  '[aria-labelledby]', 'label', 'img[alt]', 'nav', 'main', 'header', 'footer', 'aside',
  'section[aria-label]', 'form[aria-label]', '[onclick]', 'div',
].join(',');
const rect = (el: Element): BBox => {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};
const intersects = (a: BBox, b: BBox) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const clean = (s: string, max: number) => s.replace(/\s+/g, ' ').trim().slice(0, max);
const safeUrl = (s: string) => {
  try { const u = new URL(s, location.href); return /^https?:$/.test(u.protocol) ? u.origin + u.pathname : ''; }
  catch { return ''; }
};
const clickHint = (el: Element) => getComputedStyle(el).cursor === 'pointer' &&
  (el.hasAttribute('onclick') || (el.localName === 'div' && !el.hasAttribute('role') && !el.hasAttribute('tabindex')));
const visible = (el: Element) => {
  const s = getComputedStyle(el);
  return el.getClientRects().length > 0 && s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse';
};
const tabbable = (el: Element) => el instanceof HTMLElement && el.tabIndex >= 0 &&
  !el.matches(':disabled') && !el.closest('[inert]') && visible(el);

/** Ephemeral DOM handles only: never attach this map to serialized facts. Same ordering as collect(). */
export function getElementRefs(regionEl: Element | BBox): Map<string, Element> {
  const region = regionEl instanceof Element ? rect(regionEl) : regionEl;
  const candidates = [...document.querySelectorAll(candidateSelector)];
  const elements = candidates.filter(el => {
    if (el.localName === 'div' && !el.matches('[role],[aria-label],[aria-labelledby],[tabindex],[onclick],[contenteditable="true"]') && !clickHint(el)) return false;
    return visible(el) && intersects(rect(el), region);
  }).slice(0, 40);
  return new Map(elements.map((el, index) => [`e${index + 1}`, el]));
}

// Walk only text nodes: input/textarea values and hidden descendants are never read.
function visibleText(el: Element): string {
  const parts: string[] = [];
  const walk = (node: Node) => {
    if (node instanceof Element && (node.matches('input,textarea,select,script,style,[hidden],[aria-hidden="true"]') || !visible(node))) return;
    if (node.nodeType === Node.TEXT_NODE) parts.push(node.textContent || '');
    else for (const child of node.childNodes) walk(child);
  };
  walk(el);
  return clean(parts.join(' ').replace(/\d/g, '#'), 40);
}
/** Accname can include a referenced/embedded textbox's current value. Compute on an inert,
 * value-cleared document instead, retaining IDs, labels, and the real page's computed styles.
 * No live control value is read, even for aria-labelledby pointing at a textbox.
 */
function privateNameComputer(): (el: Element) => string {
  const snapshot = document.implementation.createHTMLDocument('');
  const copy = snapshot.importNode(document.documentElement, true);
  snapshot.replaceChild(copy, snapshot.documentElement);
  // dom-accessibility-api needs a Window for type guards; this document is never displayed.
  Object.defineProperty(snapshot, 'defaultView', { value: window });
  const originals = [document.documentElement, ...document.documentElement.querySelectorAll('*')];
  const copies = [copy, ...copy.querySelectorAll('*')];
  const toCopy = new Map(originals.map((el, i) => [el, copies[i]]));
  const toOriginal = new Map(copies.map((el, i) => [el, originals[i]]));
  for (const control of copy.querySelectorAll('input,textarea,select')) {
    control.removeAttribute('value');
    if (control.localName === 'input') (control as HTMLInputElement).value = '';
    else control.textContent = '';
  }
  return el => clean(computeAccessibleName(toCopy.get(el) || el, {
    getComputedStyle: (node, pseudo) => window.getComputedStyle(toOriginal.get(node) || node, pseudo),
    computedStyleSupportsPseudoElements: false,
  }), 80);
}
function sources(el: Element, name: string): string[] {
  if (!name) return [];
  if (el.hasAttribute('aria-labelledby')) return ['aria-labelledby'];
  if (el.hasAttribute('aria-label')) return ['aria-label'];
  if ((el as HTMLInputElement).labels?.length) return ['label'];
  if (el.localName === 'img' && el.hasAttribute('alt')) return ['alt'];
  if (visibleText(el)) return ['text'];
  if (el.hasAttribute('title')) return ['title'];
  return [];
}
function attributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of el.attributes) {
    if (a.name === 'alt') out.alt = a.value ? 'present' : 'empty';
    else if (a.name === 'href') out.href = safeUrl(a.value);
    else if (['role', 'type', 'autocomplete'].includes(a.name) || a.name.startsWith('aria-')) out[a.name] = a.value;
  }
  return out;
}
function focusStyle(el: Element): string[] {
  const s = getComputedStyle(el);
  return [
    s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.outlineOffset}` : '',
    s.boxShadow === 'none' ? '' : s.boxShadow,
    [s.borderTop, s.borderRight, s.borderBottom, s.borderLeft].join('|'),
  ];
}
function measureFocus(el: Element): boolean | null {
  if (!tabbable(el) || !(el instanceof HTMLElement)) return null;
  // Preserve keyboard modality so :focus-visible is included. Restore focus/scroll after all probes.
  el.blur();
  const before = focusStyle(el);
  el.focus({ preventScroll: true });
  if (document.activeElement !== el) return null;
  const after = focusStyle(el);
  el.blur();
  return after.some((value, i) => value !== before[i] && value !== '');
}

/** Pure page-side capture: no Node, network requests, storage, HTML serialization, or form-value reads. */
export async function collect(regionEl: Element | BBox, opts: CollectOptions): Promise<CaptureFacts> {
  const refs = getElementRefs(regionEl);
  const reverse = new Map([...refs].map(([ref, el]) => [el, ref]));
  const region = regionEl instanceof Element ? rect(regionEl) : { ...regionEl };
  const originalFocus = document.activeElement;
  const scroll = { x: window.scrollX, y: window.scrollY };
  const ruleHits: RuleHit[] = [];
  const elements: ElementFact[] = [];
  const privateName = privateNameComputer();
  try {
    for (const [ref, el] of refs) {
      const accessibleName = privateName(el);
      const visibleFocusIndicator = measureFocus(el);
      elements.push({
        ref, tag: el.localName, role: getRole(el), accessibleName,
        nameSources: sources(el, accessibleName),
        ...(el.localName === 'input' ? { inputType: (el.getAttribute('type') || 'text').toLowerCase() } : {}),
        focusable: tabbable(el), tabIndex: el instanceof HTMLElement ? el.tabIndex : null,
        visibleFocusIndicator, bbox: rect(el), visibleText: visibleText(el), attrs: attributes(el),
      });
      if (visibleFocusIndicator === false) ruleHits.push({ ruleId: 'br-focus-not-visible', ref, detail: 'Focus produced no change in computed outline, box-shadow, or border.' });
      if (clickHint(el) && !tabbable(el)) ruleHits.push({ ruleId: 'br-click-not-focusable', ref, detail: 'Pointer/click hints are present but the element is not reachable with Tab.' });
    }
  } finally {
    if (originalFocus instanceof HTMLElement) originalFocus.focus({ preventScroll: true });
    window.scrollTo(scroll.x, scroll.y);
  }
  const context = regionEl instanceof Element ? regionEl : document.body;
  const result = await axe.run(context, { elementRef: true } as axe.RunOptions);
  for (const violation of result.violations) {
    for (const node of violation.nodes) {
      const el = (node as typeof node & { element?: Element }).element;
      const ref = el ? reverse.get(el) : undefined;
      if (ref && !ruleHits.some(hit => hit.ref === ref && hit.ruleId === violation.id)) {
        // Do not copy axe's HTML, selectors, failureSummary, or control values into facts.
        ruleHits.push({ ruleId: violation.id, ref, detail: violation.help });
      }
    }
  }
  return {
    environment: collectEnvironment(),
    schemaVersion: 1, capturedAt: new Date().toISOString(),
    page: { url: safeUrl(location.href), title: document.title, lang: document.documentElement.lang || null, viewport: { w: innerWidth, h: innerHeight } },
    region, elements, focusTrail: (opts.focusTrail || []).slice(0, 20).map(step => ({
      index: step.index, key: step.key, ref: step.ref && refs.has(step.ref) ? step.ref : null,
      ...(step.announced ? { announced: clean(step.announced, 100) } : {}),
    })),
    ruleHits, userNote: opts.userNote.slice(0, 300), assistive: [...opts.assistive],
  };
}
