import { expect, it } from 'vitest';
import type { CaptureFacts } from '@barrierrelay/shared/src/schema';
import { createFakePipeline } from './fakePipeline';

const captures = import.meta.glob('../../../../fixtures/pairs/*/broken.facts.json', { eager: true, import: 'default' }) as Record<string, CaptureFacts>;

it.each(['05-div-continue-not-focusable', '09-custom-toggle-div'])('classifies keyboard-unreachable controls in demo fixture %s', fixture => {
  const facts = captures[`../../../../fixtures/pairs/${fixture}/broken.facts.json`];
  const bundle = { facts, regionPng: null, source: 'fixture' as const };
  const pipeline = createFakePipeline();
  const result = pipeline.draftFromRules(bundle);
  expect(result.draft).toMatchObject({ barrierType: 'unreachable-by-keyboard', targetRef: facts.ruleHits[0].ref });
  expect(result.log[0]).toMatchObject({ ranOn: 'local-code', bytesSentToCloud: 0, note: 'Deterministic demo; no AI inference.' });
  expect(createFakePipeline().draftFromRules(bundle)).toEqual(result);
});
