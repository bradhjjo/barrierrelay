import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'http://127.0.0.1:4174';
const result = { states: [], blockedRequests: [], ownerDesk: 'Not covered: demo=1 replaces AI only; owner tickets still require Firestore (apps/web/src/services.ts and ui/App.tsx).', methodology: 'axe WCAG 2.2 A/AA including inherited WCAG 2.0/2.1 tags; fresh model-free Chrome; forward and reverse Tab cycle; computed focus styles; Puppeteer full accessibility snapshots. Disabled and hidden controls excluded from keyboard expectations.' };
let browser, preview, profile;
async function click(page, text) {
  await page.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === t && !b.disabled), {}, text);
  const buttons = await page.$$('button');
  for (const button of buttons) if (await button.evaluate((b,t) => b.textContent.trim() === t, text)) { await button.focus(); await page.keyboard.press('Enter'); return; }
}
async function audit(page, name) {
  await page.addScriptTag({ content: await readFile(resolve(root, 'node_modules/axe-core/axe.min.js'), 'utf8') });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'] } });
    return { violations: r.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.map(n => ({ target: n.target, failureSummary: n.failureSummary })) })), incomplete: r.incomplete.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })), passes: r.passes.length };
  });
  result.axeVersion = await page.evaluate(() => window.axe.version);
  const snapshot = await page.accessibility.snapshot({ interestingOnly: false });
  const controls = [];
  function walk(node) { if (['button','link','textbox','combobox','checkbox','radio','DisclosureTriangle','spinbutton','slider','searchbox','switch'].includes(node.role)) controls.push({ role: node.role, name: node.name || '', disabled: !!node.disabled }); for (const child of node.children || []) walk(child); }
  walk(snapshot);
  const expected = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex],[contenteditable=true]')].filter(e => !e.disabled && e.tabIndex >= 0 && e.checkVisibility() && !e.closest('[inert]'));
    nodes.forEach((e,i) => e.setAttribute('data-audit-id', String(i)));
    return nodes.map((e,i) => ({ id: String(i), tag: e.tagName.toLowerCase() }));
  });
  await page.evaluate(() => { document.activeElement?.blur(); const start = document.createElement('span'); start.id = 'audit-start'; start.tabIndex = -1; document.body.prepend(start); start.focus(); });
  const focusOrder = [], reverse = [];
  async function focused() {
    const handle = await page.evaluateHandle(() => document.activeElement);
    const ax = await page.accessibility.snapshot({ root: handle, interestingOnly: false });
    const info = await handle.evaluate(e => { const s = getComputedStyle(e); return { id: e.getAttribute('data-audit-id'), tag: e.tagName.toLowerCase(), visibleFocus: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none', outline: `${s.outlineStyle} ${s.outlineWidth}`, boxShadow: s.boxShadow }; });
    await handle.dispose(); return { ...info, role: ax?.role || '', name: ax?.name || '' };
  }
  for (let i = 0; i < expected.length + 3; i++) { await page.keyboard.press('Tab'); focusOrder.push(await focused()); }
  await page.keyboard.down('Shift');
  for (let i = 0; i < expected.length + 3; i++) { await page.keyboard.press('Tab'); reverse.push(await focused()); }
  await page.keyboard.up('Shift');
  const reached = new Set(focusOrder.map(x => x.id));
  const reverseReached = new Set(reverse.map(x => x.id));
  await page.evaluate(() => document.querySelector('#audit-start')?.remove());
  const liveRegions = await page.$$eval('[role=status],[role=alert],[aria-live]', nodes => nodes.map(e => ({ role: e.getAttribute('role'), live: e.getAttribute('aria-live') || (e.getAttribute('role') === 'alert' ? 'assertive (implicit)' : 'polite (implicit)'), text: e.textContent.trim() })));
  const statusCheck = await page.evaluate(() => {
    const known = ['Ready. Private on-device drafting; approved cloud fix planning.', 'Self-check passed.'];
    return known.flatMap(text => [...document.querySelectorAll('p,[role=status]')].filter(e => e.textContent.trim() === text).map(e => ({ text, inLiveRegion: !!e.closest('[role=status],[role=alert],[aria-live=polite],[aria-live=assertive]') })));
  });
  result.states.push({ name, axe, controls, statusCheck, unnamedControls: controls.filter(c => !c.name.trim()), keyboard: { expectedCount: expected.length, focusOrder, reverseFocusOrder: reverse, unreachable: expected.filter(e => !reached.has(e.id)), reverseUnreachable: expected.filter(e => !reverseReached.has(e.id)), missingFocusIndicator: focusOrder.filter(e => e.id !== null && !e.visibleFocus), noTrapObserved: expected.every(e => reached.has(e.id) && reverseReached.has(e.id)) }, liveRegions });
}
try {
  const build = spawn('npm', ['run','build','--workspace=@barrierrelay/web'], { cwd: root, stdio: 'inherit' });
  if ((await once(build, 'exit'))[0]) throw new Error('Web build failed');
  const probe = createServer();
  await new Promise((yes,no) => { probe.once('error',no); probe.listen(4174,'127.0.0.1',() => probe.close(yes)); });
  preview = spawn('npm',['run','preview','--workspace=@barrierrelay/web','--','--host','127.0.0.1','--port','4174','--strictPort'],{cwd:root,stdio:'ignore',detached:true});
  let ready = false;
  for (let i=0;i<100;i++) { if (preview.exitCode !== null) throw new Error('Preview exited'); try { if ((await fetch(base)).ok) { ready=true; break; } } catch {} await delay(200); }
  if (!ready) throw new Error('Preview readiness timeout');
  profile = await mkdtemp(resolve(tmpdir(),'barrierrelay-a11y-'));
  browser = await puppeteer.launch({executablePath:'/opt/google/chrome/chrome',headless:true,userDataDir:profile,args:['--no-sandbox','--disable-dev-shm-usage']});
  result.browserVersion = await browser.version();
  result.executedAt = new Date().toISOString();
  const page = await browser.newPage(); page.setDefaultTimeout(60000); await page.setViewport({width:1440,height:1000});
  await page.setRequestInterception(true);
  page.on('request', request => { const u=new URL(request.url()); if (/(?:generateContent|streamGenerateContent)/.test(u.pathname) || u.hostname === 'firestore.googleapis.com') { result.blockedRequests.push(u.origin+u.pathname); void request.abort(); } else void request.continue(); });
  await page.goto(base); await page.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('Ready.')); await audit(page,'home');
  await page.goto(base+'/report?fixture=02-icon-pay-button&variant=broken'); await page.waitForSelector('#capture-heading'); await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Create private draft' && !b.disabled)); await audit(page,'report-loaded');
  await click(page,'Create private draft'); await page.waitForFunction(() => document.body.textContent.includes('Rules-only draft (no on-device AI available)')); await audit(page,'private-draft');
  await click(page,'Run self-check'); await page.waitForFunction(() => document.body.textContent.includes('Self-check passed.')); await audit(page,'self-check');
  await page.waitForFunction(() => document.body.textContent.includes('Shared with cloud AI') && document.body.textContent.includes('Stays on this device'));
  // The share-review panel appears in the same render as the successful self-check.
  // Expand its disclosure with the keyboard to cover the scrollable JSON too.
  await page.focus('summary'); await page.keyboard.press('Enter'); await audit(page,'share-review-expanded');
  await page.goto(base+'/mine'); await page.waitForSelector('h1'); await delay(1500); await audit(page,'mine');
  result.seriousCritical = result.states.reduce((n,s) => n+s.axe.violations.filter(v => ['serious','critical'].includes(v.impact)).length,0);
  result.exitCode = result.seriousCritical ? 1 : 0;
  await mkdir(resolve(root,'docs/evidence'),{recursive:true});
  await writeFile(resolve(root,'docs/evidence/a11y-audit.json'), JSON.stringify(result,null,2)+'\n');
  const rows = result.states.map(s => { const count=i=>s.axe.violations.filter(v=>v.impact===i).length; return `| ${s.name} | ${count('critical')} / ${count('serious')} / ${count('moderate')} / ${count('minor')} | ${new Set(s.keyboard.focusOrder.filter(e=>e.id!==null).map(e=>e.id)).size}/${s.keyboard.expectedCount} | ${s.unnamedControls.length} | ${s.keyboard.missingFocusIndicator.length} | ${s.keyboard.noTrapObserved ? 'none observed' : 'inspect raw results'} |`; });
  const violations = result.states.flatMap(s=>s.axe.violations.map(v=>`- **${s.name}: ${v.id} (${v.impact})** — ${v.help}. Selectors: ${v.nodes.map(n=>n.target.join(' ')).join('; ')}. Suggested fix: ${v.nodes.map(n=>n.failureSummary).join('; ')}. [Rule guidance](${v.helpUrl}).`));
  await writeFile(resolve(root,'docs/A11Y-AUDIT.md'),`# BarrierRelay UI accessibility audit\n\nRun: \`node tools/e2e/a11y-audit.mjs\`. Builds the web workspace, uses strict preview port 4174 and a fresh temporary headless Chrome profile, then removes it. No app code is changed. Exit code: **${result.exitCode}** (serious/critical axe violations gate the exit).\n\n## Scope and results\n\nReal rules-only pipeline without Nano; no fix-plan request or ticket creation. Auth/App Check/Remote Config may initialize over the network; cloud generation and Firestore requests are intercepted and aborted using the integration E2E guard. Blocked attempts: **${result.blockedRequests.length}**.\n\n| State | Axe critical / serious / moderate / minor | Unique Tab stops / expected | Unnamed AX controls | Missing focus indicators | Keyboard trap |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n\nSelf-check and share review are the same UI render; the latter additionally opens “View approved shared JSON” using Enter. Every state includes a full forward and reverse Tab traversal, computed outline/box-shadow checks, and a Puppeteer accessibility-tree snapshot of buttons, inputs, links and disclosure controls. Disabled/hidden controls are excluded from Tab expectations; accessible-name checks include disabled controls. Readiness and self-check messages were also checked for live-region ancestry (see raw statusCheck); other status/alert regions are inventoried. Full focus order (role and accessible name), reverse order, live-region text and axe incomplete checks are in [raw evidence](evidence/a11y-audit.json).\n\n## Findings for coordinator\n\n${violations.join('\n') || 'No WCAG-tagged axe violations found in the tested states.'}\n\n## Limits\n\n- Automated checks find only a subset of accessibility issues; **no real screen-reader user was tested**, and no screen-reader speech or announcement timing was verified. This is not a user study or WCAG conformance claim.\n- Focus visibility is a computed-style heuristic, not a visual contrast/occlusion assessment. A complete forward/reverse cycle found no trap only in these static states; controls were not all activated.\n- Status/alert/live-region semantics are recorded in JSON; dynamic announcement behavior remains untested. Axe incomplete results need manual review.\n- ${result.ownerDesk}\n- Mine is the empty/error-safe view with Firestore blocked, not a populated authenticated ticket list. Transient busy/error states, mobile layouts, extension UI, fixture pages themselves, cloud fix plans and populated owner desks are outside scope.\n- No local profile paths, authentication tokens, screenshots or environment files are included in evidence.\n`);
  console.log(JSON.stringify({states:result.states.map(s=>({name:s.name,violations:s.axe.violations.length,unnamed:s.unnamedControls.length})),exitCode:result.exitCode},null,2)); process.exitCode=result.exitCode;
} finally {
  await browser?.close();
  if (preview?.pid) { const done=preview.exitCode!==null ? Promise.resolve() : once(preview,'exit'); try { process.kill(-preview.pid,'SIGTERM'); } catch(e) { if(e.code!=='ESRCH') throw e; } await done; }
  if(profile) await rm(profile,{recursive:true,force:true});
}
