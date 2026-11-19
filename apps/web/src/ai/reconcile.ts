import type { BarrierType, CaptureFacts } from '@barrierrelay/shared/src/schema';
import { ruleTypes } from './rules.ts';

/** Correct only metadata supported by an unambiguous rule; never rewrite AI text. */
export function reconcileDraft(value: unknown, facts: CaptureFacts): { draft: unknown; note?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { draft: value };
  const draft = value as Record<string, unknown>;
  const typesByRef = new Map<string, Set<BarrierType>>();
  for (const hit of facts.ruleHits) {
    const type = ruleTypes[hit.ruleId];
    if (!type || !facts.elements.some(element => element.ref === hit.ref)) continue;
    const types = typesByRef.get(hit.ref) ?? new Set<BarrierType>();
    types.add(type); typesByRef.set(hit.ref, types);
  }
  let targetRef = draft.targetRef;
  const targetExists = facts.elements.some(element => element.ref === targetRef);
  if (!targetExists) {
    if (typesByRef.size !== 1) return { draft: value };
    targetRef = [...typesByRef.keys()][0];
  }
  const types = typesByRef.get(targetRef as string);
  if (!types || types.size !== 1) return { draft: value };
  const barrierType = [...types][0];
  if (draft.barrierType === barrierType && draft.targetRef === targetRef) return { draft: value };
  const corrected = { ...draft, barrierType, targetRef };
  const from = JSON.stringify({ barrierType: draft.barrierType, targetRef: draft.targetRef });
  const to = JSON.stringify({ barrierType, targetRef });
  return { draft: corrected, note: `Draft corrected by rules: ${from} -> ${to}` };
}
