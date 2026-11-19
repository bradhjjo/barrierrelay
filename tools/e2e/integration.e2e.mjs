import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const base = 'http://127.0.0.1:4173';
const out = resolve(root, 'tools/e2e/out');
const note = 'Integration private note: I need to pay for my order with a screen reader.';
const { id } = JSON.parse(await readFile(resolve(root, 'extension/key.json'), 'utf8'));
let preview;
let browser;
let report;
let profile;
const forbiddenRequests = [];

async function build(args) {
  const child = spawn('npm', args, { cwd: root, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `npm ${args.join(' ')} must succeed`);
}
async function assertPortFree() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(4173, '127.0.0.1', () => probe.close(resolve));
  });
}
async function startPreview() {
  await assertPortFree(); // Never reuse or terminate someone else's server.
  preview = spawn('npm', ['run', 'preview', '--workspace=@barrierrelay/web', '--', '--strictPort'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let output = '';
  preview.stdout.on('data', chunk => { output += chunk; });
  preview.stderr.on('data', chunk => { output += chunk; });
  let startupError;
  preview.once('error', error => { startupError = error; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (startupError) throw startupError;
    if (preview.exitCode !== null) throw new Error(`Preview exited before readiness: ${output}`);
    try {
      const response = await fetch(base, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error(`Preview did not start on ${base}: ${output}`);
}
async function clickButton(page, name) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled), {}, name);
  const buttons = await page.$$('button');
  for (const button of buttons) {
    if (await button.evaluate((element, text) => element.textContent.trim() === text, name)) {
      await button.focus(); await page.keyboard.press('Enter'); return;
    }
  }
  throw new Error(`Button not found: ${name}`);
}
async function assertNoUiError(page) {
  const errors = await page.$$eval('[role=alert]', nodes => nodes.map(node => node.textContent));
  assert.deepEqual(errors, [], `Unexpected app error: ${errors.join(' ')}`);
}
async function screenshot(name) {
  await report.screenshot({ path: resolve(out, `integration-${name}.png`), fullPage: true });
}

try {
  await mkdir(out, { recursive: true });
  await build(['run', 'build', '--workspace=@barrierrelay/web']);
  await build(['--prefix', 'extension', 'run', 'build']);
  await startPreview();
  profile = await mkdtemp(resolve(tmpdir(), 'barrierrelay-integration-e2e-'));
  browser = await puppeteer.launch({
    executablePath: '/opt/google/chrome/chrome', headless: process.env.HEADFUL !== '1',
    userDataDir: profile, enableExtensions: true,
    // No Nano feature/download flags, no preparation, and never the shared Nano profile.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-extension-debugging'],
  });
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Extensions.loadUnpacked', { path: resolve(root, 'extension/dist') });

  // Exercise the actual options UI and its storage, not a build-time origin override.
  const options = await browser.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.select('#origin', base);
  await clickButton(options, 'Save');
  await options.waitForFunction(() => document.querySelector('[role=status]').textContent === 'Report app saved.');
  const storedOrigin = await options.evaluate(async () => (await chrome.storage.local.get('webOrigin')).webOrigin);
  assert.equal(storedOrigin, base);
  await options.close();

  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${base}/fixtures/pairs/02-icon-pay-button/broken.html`);
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.tagName === 'BUTTON')) break;
  }
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tab = targetInfos.find(target => target.url === page.url());
  assert.ok(tab, 'Fixture has a tab target');
  await cdp.send('Extensions.triggerAction', { id, targetId: tab.targetId });
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(element => element.shadowRoot?.querySelector('textarea')));
  await page.evaluate(value => {
    const shadow = [...document.querySelectorAll('div')].find(element => element.shadowRoot?.querySelector('textarea')).shadowRoot;
    shadow.querySelector('textarea').value = value;
    shadow.querySelector('input[value="screen-reader"]').checked = true;
    shadow.querySelector('button[type=submit]').focus();
  }, note);

  let handoffUrl;
  const reportTargetPromise = browser.waitForTarget(target => {
    if (!target.url().startsWith(`${base}/report?capture=`)) return false;
    handoffUrl = target.url(); return true;
  }, { timeout: 30000 });
  await page.keyboard.press('Enter');
  const target = await reportTargetPromise;
  report = await target.page();
  report.setDefaultTimeout(45000);
  await report.setViewport({ width: 1440, height: 1000 });

  // Guard against accidental paid inference or ticket access/writes. Startup Auth,
  // reCAPTCHA/App Check, and Remote Config use their real production integration.
  await report.setRequestInterception(true);
  report.on('request', request => {
    const url = new URL(request.url());
    const forbidden = /(?:generateContent|streamGenerateContent)/.test(url.pathname) ||
      url.hostname === 'firestore.googleapis.com';
    if (forbidden) { forbiddenRequests.push(url.origin + url.pathname); void request.abort(); }
    else void request.continue();
  });

  const opened = new URL(handoffUrl);
  assert.ok(opened.searchParams.get('capture'));
  assert.equal(opened.searchParams.get('ext'), id);
  assert.equal(opened.searchParams.has('demo'), false, 'Use the real pipeline, not deterministic demo mode');
  await report.waitForFunction(() => document.querySelector('#capture-heading') && [...document.querySelectorAll('section[aria-labelledby="capture-heading"] li')].some(element => /button: \(no accessible name\)/.test(element.textContent)));
  await assertNoUiError(report);
  assert.ok(await report.$eval('section[aria-labelledby="capture-heading"]', element => element.textContent.includes('· extension')), 'Intake source is extension, not a fixture bundle');
  assert.equal(new URL(report.url()).searchParams.has('capture'), false, 'Real intake consumes the one-time URL token');
  await report.waitForFunction(() => { const image = document.querySelector('img.capture'); return image?.complete && image.naturalWidth > 0; });
  const image = await report.$eval('img.capture', element => ({ src: element.src, width: element.naturalWidth, height: element.naturalHeight }));
  assert.ok(image.src.startsWith('blob:'), 'Real intake renders its local PNG Blob');
  assert.ok(Math.max(image.width, image.height) <= 768);
  await screenshot('capture');

  await clickButton(report, 'Create private draft');
  await report.waitForFunction(() => document.body.textContent.includes('Rules-only draft (no on-device AI available)') || document.querySelector('[role=alert]'));
  await assertNoUiError(report);
  assert.ok(await report.evaluate(() => document.body.textContent.includes('Rules-only draft (no on-device AI available)')), 'A model-free profile must use the genuine rules fallback');
  const barrierType = await report.evaluate(() => [...document.querySelectorAll('label')].find(element => element.textContent.startsWith('Barrier type'))?.querySelector('select')?.value);
  assert.equal(barrierType, 'unnamed-button');
  await screenshot('rules-only');

  await clickButton(report, 'Run self-check');
  await report.waitForFunction(() => document.body.textContent.includes('Self-check passed.') || document.querySelector('[role=alert]'));
  await assertNoUiError(report);
  await report.waitForSelector('pre[aria-label="Approved shared JSON"]');
  const preview = await report.$eval('pre[aria-label="Approved shared JSON"]', element => element.textContent);
  const payload = JSON.parse(preview);
  assert.equal(payload.draft.barrierType, 'unnamed-button');
  assert.equal(preview.includes(note), false, 'Original user note must never enter the shared JSON');
  assert.equal(preview.includes('Integration private note'), false);
  assert.equal(Object.hasOwn(payload, 'userNote'), false);
  assert.equal(Object.hasOwn(payload, 'regionPng'), false);
  assert.equal(Object.hasOwn(payload, 'facts'), false);
  assert.ok(payload.sharedFacts.elements.some(element => element.tag === 'button' && element.accessibleName === ''));
  assert.deepEqual(payload.sharedFacts.focusTrail, [], 'Optional key sharing defaults off');
  assert.deepEqual(forbiddenRequests, [], 'No cloud generation or Firestore requests may be attempted');
  const routing = await report.$$eval('.routing tbody tr', rows => rows.map(row => row.textContent));
  assert.ok(routing.some(row => row.includes('draft') && row.includes('Local code')));
  assert.equal(routing.some(row => row.includes('fix-plan')), false);
  await screenshot('privacy');
  console.log(JSON.stringify({ extensionId: id, appOrigin: base, source: 'extension', barrierType, regionImage: { width: image.width, height: image.height }, originalNoteExcluded: true, modelMode: 'real rules-only fallback; no demo flag', cloudRequests: 0, firestoreRequests: 0, screenshots: ['integration-capture.png', 'integration-rules-only.png', 'integration-privacy.png'] }, null, 2));
} catch (error) {
  if (report && !report.isClosed()) await screenshot('failure').catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (preview?.pid) {
    const closed = preview.exitCode !== null ? Promise.resolve() : once(preview, 'exit');
    try { process.kill(-preview.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await closed;
  }
  if (profile) await rm(profile, { recursive: true, force: true });
}
