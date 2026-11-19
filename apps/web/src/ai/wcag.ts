import type { BarrierType } from '@barrierrelay/shared/src/schema';

export const WCAG_CRITERIA = {
  '1.3.1': { title: 'Info and Relationships', slug: 'info-and-relationships' },
  '2.1.1': { title: 'Keyboard', slug: 'keyboard' },
  '2.1.2': { title: 'No Keyboard Trap', slug: 'no-keyboard-trap' },
  '2.4.4': { title: 'Link Purpose (In Context)', slug: 'link-purpose-in-context' },
  '2.4.7': { title: 'Focus Visible', slug: 'focus-visible' },
  '2.5.3': { title: 'Label in Name', slug: 'label-in-name' },
  '3.3.2': { title: 'Labels or Instructions', slug: 'labels-or-instructions' },
  '4.1.2': { title: 'Name, Role, Value', slug: 'name-role-value' },
} as const;
type Criterion = keyof typeof WCAG_CRITERIA;
export const BARRIER_CRITERIA: Record<BarrierType, readonly Criterion[]> = {
  'unlabeled-input': ['1.3.1', '3.3.2', '4.1.2'],
  'unnamed-button': ['4.1.2', '2.5.3'],
  'unnamed-link': ['2.4.4', '4.1.2'],
  'unreachable-by-keyboard': ['2.1.1'],
  'focus-not-visible': ['2.4.7'],
  'keyboard-trap': ['2.1.2'],
  other: ['4.1.2'],
  none: ['4.1.2'],
};
// These are reference candidates, not a determination that every SC is violated.
export function wcagReferences(type: BarrierType): { sc: string; title: string; url: string }[] {
  return BARRIER_CRITERIA[type].map(sc => ({ sc, title: WCAG_CRITERIA[sc].title,
    url: `https://www.w3.org/WAI/WCAG22/Understanding/${WCAG_CRITERIA[sc].slug}.html` }));
}
