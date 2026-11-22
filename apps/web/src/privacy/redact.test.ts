import { expect, it, vi } from 'vitest';
import type { BarrierDraft, CaptureFacts } from '@barrierrelay/shared/src/schema';
import facts02 from '../../../../fixtures/pairs/02-icon-pay-button/broken.facts.json';
import { redact } from './redact';
import { collectEnvironment } from '../../../../packages/collector/src/environment';
it('collects only coarse brands/platform and media settings with a UA fallback', () => {
 try {
  vi.stubGlobal('navigator', { userAgent: 'NEVER SERIALIZE', userAgentData: { brands: [{ brand: 'Not A Brand', version: '99' }, { brand: 'Chromium', version: '140.1' }, { brand: 'Google Chrome', version: '140.2.3' }], platform: 'Linux' } });
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: ['(forced-colors: active)', '(prefers-contrast: more)', '(prefers-reduced-motion: reduce)', '(prefers-color-scheme: dark)'].includes(query) }));
  const environment = collectEnvironment();
  expect(environment.browser).toEqual({ name: 'Google Chrome', major: 140 });
  expect(environment.os).toEqual({ name: 'Linux' });
  expect(environment.settings).toMatchObject({ forcedColors: true, prefersContrast: 'more', reducedMotion: true, colorScheme: 'dark' });
  expect(JSON.stringify(environment)).not.toMatch(/NEVER SERIALIZE|140\.2|viewport|fonts/);
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/139.0 Safari/537.36 Edg/140.0' });
  expect(collectEnvironment().os.name).toBe('Windows');
  expect(collectEnvironment().browser).toEqual({ name: 'Edge', major: 140 });
 } finally { vi.unstubAllGlobals(); }
});
it('shares only the approved coarse environment, defaults on and excludes unknown keys', () => {
 const capture = bundle();
 capture.facts.environment = Object.assign(collectEnvironment(), { userAgent: 'NEVER SHARE' });
 const approvals = { includePath: false, includeVisibleText: false, includeFocusTrail: false };
 expect(redact(capture, draft, approvals).sharedFacts.environment).toBeDefined();
 expect(JSON.stringify(redact(capture, draft, approvals))).not.toContain('NEVER SHARE');
 expect(redact(capture, draft, { ...approvals, includeEnvironment: false }).sharedFacts).not.toHaveProperty('environment');
 delete capture.facts.environment;
 expect(redact(capture, draft, approvals).sharedFacts).not.toHaveProperty('environment');
});
const draft:BarrierDraft={barrierType:'unnamed-button',targetRef:'e3',summary:'Email me@example.com or call (312) 555-0123.',stepsToReproduce:['Use card 4111 1111 1111 1111.'],expected:'A button name.',actual:'No name.',confidence:'low'};
function bundle(){ const facts=structuredClone(facts02) as unknown as CaptureFacts; facts.userNote='My name is Secret Person. Email me@example.com';facts.page.url='https://example.org/private/4111111111111111?secret=value';facts.elements[0].visibleText='PRIVATE VISIBLE TEXT';facts.elements[0].accessibleName='me@example.com';facts.elements[0].attrs={href:'https://secret.invalid',alt:'Secret Person',role:'button','aria-label':'312-555-0123',type:'button',autocomplete:'off'};return{facts,regionPng:null,source:'fixture' as const}; }
it('never leaks notes, unapproved text/path/focus or PII; remains pure and measures actual UTF-8 bytes',()=>{
 const capture=bundle(),before=JSON.stringify(capture),result=redact(capture,draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false}),json=JSON.stringify(result);
 for(const secret of ['PRIVATE VISIBLE TEXT','Secret Person','userNote','me@example.com','312-555-0123','4111111111111111','secret=value','visibleText','href','alt'])expect(json).not.toContain(secret);
 expect(result.site.path).toBe('/');expect(result.sharedFacts.focusTrail).toEqual([]);expect(JSON.stringify(capture)).toBe(before);const{bytes,...withoutBytes}=result;expect(bytes).toBe(new TextEncoder().encode(JSON.stringify(withoutBytes)).byteLength);
});
it('keeps approved fields but still scrubs card/contact information',()=>{
 const capture=bundle();capture.facts.elements[0].visibleText='Résumé 4111111111111111';capture.facts.focusTrail[0].announced='person@example.com';const result=redact(capture,draft,{includePath:true,includeVisibleText:true,includeFocusTrail:true});
 expect(result.sharedFacts.elements[0].visibleText).toBe('Résumé [redacted]');expect(result.sharedFacts.focusTrail[0].announced).toBe('[redacted]');expect(result.site.path).toBe('/private/[redacted]');expect(result.sharedFacts.elements[0].attrs).toEqual({role:'button','aria-label':'[redacted]',type:'button',autocomplete:'off'});
});

it('preserves the exact scheme, host and port for IP origins while removing query and unapproved path',()=>{
 const capture=bundle();capture.facts.page.url='http://127.0.0.1:38351/private?secret=yes';
 const result=redact(capture,draft,{includePath:false,includeVisibleText:false,includeFocusTrail:false});
 expect(result.site).toEqual({origin:'http://127.0.0.1:38351',path:'/'});
 const {bytes,...data}=result;expect(bytes).toBe(new TextEncoder().encode(JSON.stringify(data)).byteLength);
});
