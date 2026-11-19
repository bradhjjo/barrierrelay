import type { BarrierDraft, CaptureFacts } from '@barrierrelay/shared/src/schema';
import { ruleTypes, ruleDraft } from './rules.ts';

// Facts are rendered as observations, separate from the requested response JSON.
// Desired behavior and proposed reproduction actions are not factual assertions.
export function selfCheckPrompt(draft: BarrierDraft, facts: CaptureFacts): string {
  const target = facts.elements.find(element => element.ref === draft.targetRef);
  const rules = facts.ruleHits.filter(hit => hit.ref === draft.targetRef && ruleTypes[hit.ruleId]);
  const targetExists = draft.barrierType === 'none' ? draft.targetRef === null : Boolean(target);
  const supportedTypes = rules.map(hit => ruleTypes[hit.ruleId]);
  if (!supportedTypes.length && target && !target.accessibleName) {
    if (target.role === 'button') supportedTypes.push('unnamed-button');
    else if (target.role === 'link') supportedTypes.push('unnamed-link');
    else if (['input', 'select', 'textarea'].includes(target.tag) && !['hidden', 'button', 'submit', 'reset'].includes(target.inputType ?? '')) supportedTypes.push('unlabeled-input');
  }
  const ruleTypeMatches = supportedTypes.length === 0 || supportedTypes.includes(draft.barrierType);
  const machineProblems = [
    ...(!targetExists ? [`Draft targetRef ${draft.targetRef} does not exist in the facts.`] : []),
    ...(!ruleTypeMatches ? [`Draft barrierType ${draft.barrierType} contradicts target evidence for ${supportedTypes.join(' or ')}.`] : []),
  ];
  const local = ruleDraft(facts);
  const evidence = [
    `Target ${draft.targetRef}: ${targetExists ? 'exists' : 'DOES NOT EXIST'}.`,
    `Rule type comparison: ${ruleTypeMatches ? 'matches' : 'CONTRADICTION'}.`,
    ...(target ? [`Role: ${target.role ?? target.tag}. Accessible name: ${target.accessibleName ? JSON.stringify(target.accessibleName) : 'NO ACCESSIBLE NAME'}.`,
      `Keyboard focusable: ${target.focusable}. Visible focus indicator: ${target.visibleFocusIndicator === null ? 'not measured' : target.visibleFocusIndicator}.`] : []),
    ...(local.targetRef === draft.targetRef ? [`Observed barrier: ${local.actual}`] : []),
    `User observation: ${JSON.stringify(facts.userNote)}.`,
    `Last Escape result: ${JSON.stringify([...facts.focusTrail].reverse().find(step => step.key === 'Escape') ?? null)}.`,
  ];
  const report = `Type: ${draft.barrierType}\nTarget: ${draft.targetRef}\nSummary: ${JSON.stringify(draft.summary)}\nReported actual behavior: ${JSON.stringify(draft.actual)}`;
  return `EVIDENCE:\n${evidence.join('\n')}\n\nREPORT TO CHECK (not the response format):\n${report}\n\nTRUSTED LOCAL CONTRADICTIONS: ${JSON.stringify(machineProblems)}\n${machineProblems.length
    ? 'The report has the listed contradictions. Is it consistent with the evidence? Return consistent false and the listed contradictions.'
    : 'Local ref and type checks passed. Does this report accurately describe the evidence? A report describing the observed barrier is consistent. Return consistent true unless you identify an actual unsupported claim or personal data in the report.'}`;
}
