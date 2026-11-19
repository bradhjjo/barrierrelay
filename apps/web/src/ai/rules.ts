import type { BarrierType, CaptureFacts, BarrierDraft } from '@barrierrelay/shared/src/schema';
export const ruleTypes: Record<string, BarrierType> = {
  label: 'unlabeled-input', 'label-title-only': 'unlabeled-input', 'select-name': 'unlabeled-input', 'aria-input-field-name': 'unlabeled-input',
  'button-name': 'unnamed-button', 'input-button-name': 'unnamed-button', 'aria-command-name': 'unnamed-button',
  'link-name': 'unnamed-link', 'br-click-not-focusable': 'unreachable-by-keyboard', 'br-focus-not-visible': 'focus-not-visible', 'br-keyboard-trap': 'keyboard-trap',
};
export function ruleDraft(facts: CaptureFacts): BarrierDraft {
  const hit = facts.ruleHits.find(h => ruleTypes[h.ruleId] && facts.elements.some(e => e.ref === h.ref));
  let type: BarrierType = hit ? ruleTypes[hit.ruleId] : 'none';
  let ref: string | null = hit?.ref ?? null;
  if (!hit) {
    const unnamed = facts.elements.find(e => ['input','select','textarea'].includes(e.tag) && !e.accessibleName && !['hidden','submit','button'].includes(e.inputType ?? ''));
    const escape = [...facts.focusTrail].reverse().find(s => s.key === 'Escape');
    const repeated = facts.focusTrail.filter(s => s.key === 'Tab');
    const trapped = escape?.ref && repeated.length >= 4 && repeated.every(s => s.ref !== null) && /stuck|trap|can't.*leave|cannot.*leave/i.test(facts.userNote);
    if (unnamed) { type = 'unlabeled-input'; ref = unnamed.ref; }
    else if (trapped) { type = 'keyboard-trap'; ref = escape.ref; }
    else {
      const other = facts.ruleHits.find(h => facts.elements.some(e => e.ref === h.ref));
      if (other) { type = 'other'; ref = other.ref; }
    }
  }
  const descriptions: Record<BarrierType, [string,string]> = {
    'unlabeled-input': ['The input has no accessible name.', 'The input has a clear, persistent accessible name.'],
    'unnamed-button': ['The button has no accessible name.', 'The button announces its purpose.'],
    'unnamed-link': ['The link has no accessible name.', 'The link announces its destination or purpose.'],
    'unreachable-by-keyboard': ['The control cannot be reached with Tab.', 'The control can be reached and activated with the keyboard.'],
    'focus-not-visible': ['Keyboard focus has no visible indicator.', 'Keyboard focus has a clear visible indicator.'],
    'keyboard-trap': ['Focus stays in the component after Escape.', 'The keyboard can leave or dismiss the component.'],
    other: ['The captured rules report an accessibility issue.', 'The control works with the selected assistive technology.'],
    none: ['No supported barrier was detected in the captured facts.', 'The controls remain accessible.'],
  };
  const [actual, expected] = descriptions[type];
  return { barrierType: type, targetRef: ref, summary: ref ? `${ref}: ${actual}` : actual,
    stepsToReproduce: ['Open the captured page and region.', ref ? `Use Tab to reach ${ref} and check its name and behavior.` : 'Check the controls with the keyboard and screen reader.', ...(type === 'keyboard-trap' ? ['Press Escape, then Tab to try to leave the component.'] : [])], expected, actual, confidence: 'low' };
}
