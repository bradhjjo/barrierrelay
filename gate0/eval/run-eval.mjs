#!/usr/bin/env node
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createNanoSession } from '../../tools/nano/run.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const spec = JSON.parse(await readFile(resolve(root, 'apps/web/src/ai/draft-prompt.json'), 'utf8'));
const out = resolve(root, 'gate0/out');
await mkdir(out, { recursive: true });
let session;
const rows = [];
function valid(d, facts) {
  return d && spec.schema.properties.barrierType.enum.includes(d.barrierType) &&
    (d.barrierType === 'none' ? d.targetRef === null : facts.elements.some(e => e.ref === d.targetRef)) &&
    ['summary','expected','actual'].every(k => typeof d[k] === 'string' && d[k].length > 0 && d[k].length <= 160) &&
    Array.isArray(d.stepsToReproduce) && d.stepsToReproduce.length >= 1 && d.stepsToReproduce.length <= 5 && d.stepsToReproduce.every(s => typeof s === 'string' && s.length > 0 && s.length <= 160) &&
    ['low','medium','high'].includes(d.confidence) && Object.keys(d).every(k => spec.schema.required.includes(k));
}
try {
  session = await createNanoSession({ timeoutMs: 90000 });
  const availability = await session.page.evaluate(async () => {
    if (!globalThis.LanguageModel) return 'unsupported-browser';
    return await Promise.race([LanguageModel.availability({ expectedInputs: [{ type:'text' }, { type:'image' }] }), new Promise(r => setTimeout(() => r('unavailable (readiness timeout)'), 8000))]);
  });
  // Never trigger a model download on an evaluation run.
  if (availability !== 'available') throw new Error(`Nano unavailable: ${availability}. Prepare the model on an unmetered network first.`);
  for (const mode of ['text-only','text+image']) {
    for (const id of (await readdir(resolve(root, 'fixtures/pairs'))).sort()) for (const variant of ['broken','fixed']) {
      const folder = resolve(root, 'fixtures/pairs', id);
      const facts = JSON.parse(await readFile(resolve(folder, `${variant}.facts.json`), 'utf8'));
      const truth = JSON.parse(await readFile(resolve(folder, `truth.${variant}.json`), 'utf8'));
      try {
        const result = await session.run({ system: spec.system, prompt: JSON.stringify(facts), schema: spec.schema, ...(mode === 'text+image' ? { imagePath: resolve(folder, `${variant}.region.png`) } : {}) });
        const draft = result.json;
        rows.push({ mode, id, variant, draft, schemaValid: !!valid(draft, facts), barrierTypeCorrect: draft?.barrierType === truth.barrierType, targetRefCorrect: draft?.targetRef === truth.targetRef, ms: result.ms });
      } catch (e) {
        rows.push({ mode, id, variant, schemaValid:false, barrierTypeCorrect:false, targetRefCorrect:false, error:e.message });
      }
      console.error(`${mode} ${id}/${variant}: ${rows.at(-1).barrierTypeCorrect ? 'OK' : 'MISS'}`);
    }
  }
  const summary = ['text-only','text+image'].map(mode => {
    const group = rows.filter(r => r.mode === mode), latency = group.filter(r => Number.isFinite(r.ms)).map(r => r.ms).sort((a,b) => a-b);
    const middle = Math.floor(latency.length / 2);
    return { mode, n:group.length, barrierType:group.filter(r => r.barrierTypeCorrect).length, targetRef:group.filter(r => r.targetRefCorrect).length, schemaValid:group.filter(r => r.schemaValid).length, brokenBarrierType:group.filter(r => r.variant === 'broken' && r.barrierTypeCorrect).length, fixedNone:group.filter(r => r.variant === 'fixed' && r.draft?.barrierType === 'none').length, medianMs:latency.length ? (latency[middle] + latency[Math.floor((latency.length - 1)/2)]) / 2 : null };
  });
  await writeFile(resolve(out, 'eval.json'), JSON.stringify({ at:new Date().toISOString(), availability, prompt:spec, summary, rows }, null, 2) + '\n');
  console.table(summary);
} catch (e) {
  const message = /Nano unavailable/.test(e.message) ? e.message : `Nano unavailable or evaluation startup failed: ${e.message}`;
  await writeFile(resolve(out, 'eval.json'), JSON.stringify({ at:new Date().toISOString(), error:message, rows }, null, 2) + '\n');
  console.error(message); process.exitCode = 1;
} finally { await session?.close(); }
