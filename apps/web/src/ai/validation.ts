import { BARRIER_TYPES, type BarrierDraft, type CaptureFacts, type FixPlan } from '@barrierrelay/shared/src/schema';
import { containsPii } from '../privacy/redact';
export function draftIssues(value: unknown, facts: CaptureFacts): string[] {
  if (!value || typeof value !== 'object') return ['Draft must be an object.'];
  const d = value as Record<string, unknown>;
  const issues: string[] = [];
  const fields = ['barrierType', 'targetRef', 'summary', 'stepsToReproduce', 'expected', 'actual', 'confidence'];
  if (Object.keys(d).some(key => !fields.includes(key))) issues.push('Draft has unknown fields.');
  if (!BARRIER_TYPES.includes(d.barrierType as never)) issues.push('Invalid barrierType.');
  if (d.targetRef !== null && (typeof d.targetRef !== 'string' || !facts.elements.some(e => e.ref === d.targetRef))) issues.push('Unknown targetRef.');
  if ((d.barrierType === 'none') !== (d.targetRef === null)) issues.push('Only none can have a null targetRef.');
  for (const key of ['summary', 'expected', 'actual']) {
    if (typeof d[key] !== 'string' || !d[key].trim() || d[key].length > 160) issues.push(`${key} must contain 1..160 characters.`);
  }
  if (!Array.isArray(d.stepsToReproduce) || d.stepsToReproduce.length < 1 || d.stepsToReproduce.length > 5 || d.stepsToReproduce.some(s => typeof s !== 'string' || !s.trim() || s.length > 160)) issues.push('Use 1..5 steps, each 1..160 characters.');
  if (!['low', 'medium', 'high'].includes(d.confidence as string)) issues.push('Invalid confidence.');
  if (containsPii(JSON.stringify([d.summary, d.expected, d.actual, d.stepsToReproduce]))) issues.push('Draft contains personal data patterns.');
  return issues;
}
export function validateDraft(value: unknown, facts: CaptureFacts): BarrierDraft {
  const issues = draftIssues(value, facts);
  if (issues.length) throw new Error(`Invalid BarrierDraft: ${issues.join(' ')}`);
  return value as BarrierDraft;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
export function validateFixPlan(value: unknown): FixPlan {
  if (!value || typeof value !== 'object') throw new Error('Invalid FixPlan object.');
  const p = value as FixPlan;
  if (!Array.isArray(p.wcag) || p.wcag.length === 0 || p.wcag.some(w => !/^\d\.\d\.\d+$/.test(w.sc) || !text(w.title) || !['A','AA','AAA'].includes(w.level)) ||
      !text(p.rootCause) || !p.fix || !text(p.fix.description) || !text(p.fix.codeAfter) ||
      (p.fix.codeBefore !== undefined && !text(p.fix.codeBefore)) ||
      !Array.isArray(p.verification) || !p.verification.length || p.verification.some(v => !text(v))) throw new Error('Invalid FixPlan fields.');
  // Reconstruct the shape. Never trust a model-provided sources array or extra fields.
  return { wcag: p.wcag.map(w => ({ sc: w.sc, title: w.title, level: w.level })), rootCause: p.rootCause,
    fix: { description: p.fix.description, ...(p.fix.codeBefore ? { codeBefore: p.fix.codeBefore } : {}), codeAfter: p.fix.codeAfter },
    verification: p.verification, sources: [] };
}
export function parseJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}
