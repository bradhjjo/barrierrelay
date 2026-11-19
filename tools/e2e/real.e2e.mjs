import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { features, profilePath } from '../nano/run.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = new URL('./out/', import.meta.url);
const base = 'http://127.0.0.1:5173';
const allowCloudFail = process.argv.includes('--allow-cloud-fail');
const headless = process.env.NANO_HEADFUL !== '1';
const timeout = Number(process.env.REAL_E2E_TIMEOUT_MS || 240000);
await mkdir(out, { recursive: true });
await import('../../apps/web/scripts/copy-fixtures.mjs');
let server, browser, page, cdp;
let stage = 'startup';
const results = { completed: false, profilePath, fakePipeline: false, steps: [], screenshots: [], pageErrors: [], cloudFailureExpected: false };
const paths = {
  prepare: 'App → AiPipeline.prepareOnDevice → GenerativeModel.initializeDeviceModel (trusted click)',
  draft: 'App → AiPipeline.draftOnDevice → ONLY_ON_DEVICE generateContent → response.inferenceSource → validateDraft',
  'self-check': 'App → AiPipeline.selfCheck → deterministic validation + optional ONLY_ON_DEVICE generateContent',
  cloud: 'App → AiPipeline.fixPlanInCloud → ONLY_IN_CLOUD generateContent → grounding sources',
};
try {
  try { assert.equal((await fetch(base)).status, 200); } catch {
    server = spawn('npm', ['run', 'dev', '--', '--strictPort'], { cwd: `${root}/apps/web`, stdio: 'ignore', detached: true });
    let ready = false;
    for (let i = 0; i < 80; i++) { try { ready = (await fetch(base)).ok; } catch {} if (ready) break; await delay(250); }
    assert.ok(ready, 'Vite did not start on 5173.');
  }
  // Chrome's own profile lock rejects concurrent use. Never delete Singleton* locks.
  browser = await puppeteer.launch({ executablePath: '/opt/google/chrome/chrome', userDataDir: profilePath, headless, protocolTimeout: timeout, ignoreDefaultArgs: true,
    args: [`--user-data-dir=${profilePath}`, `--enable-features=${features}`, '--no-first-run', '--no-default-browser-check', ...(headless ? ['--headless=new'] : [])] });
  page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  // Diagnostics only: observe pipeline events without wrapping APIs or changing results.
  await page.evaluateOnNewDocument(() => {
    window.barrierrelayDeviceDiagnostics = [];
    window.addEventListener('barrierrelay:device-diagnostic', event => {
      window.barrierrelayDeviceDiagnostics.push({ ...event.detail, atMs: performance.now(), documentStartedAt: performance.timeOrigin, pageUrl: location.href });
    });
  });
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('pageerror', error => results.pageErrors.push(error.message));
  cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  let aiRequests = 0;
  cdp.on('Network.requestWillBeSent', ({ request }) => { if (/firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com/.test(request.url)) aiRequests++; });
  async function screenshot(name) {
    const filename = `real-${name}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(filename, out)), fullPage: true });
    results.screenshots.push(filename);
  }
  async function rows() {
    return page.$$eval('.routing tbody tr', elements => elements.map(row => ({ step: row.cells[0].firstChild.textContent.trim(), ranOn: ({ 'On-device': 'on-device', Cloud: 'in-cloud', 'Local code': 'local-code' })[row.cells[1].textContent.trim()], ms: Number(row.cells[2].textContent), bytes: Number(row.cells[3].textContent), note: row.cells[0].querySelector('small')?.textContent || '' })));
  }
  async function click(label) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text), label);
    const button = handle.asElement();
    assert.ok(button, `Missing button: ${label}`);
    assert.equal(await button.evaluate(element => element.disabled), false, `Disabled button: ${label}`);
    await button.click(); // Puppeteer sends trusted CDP mouse events; never element.click().
    await handle.dispose();
  }
  async function settled() {
    await page.waitForFunction(() => !document.querySelector('.notice')?.textContent.includes('Working…'));
    const error = await page.$eval('main', element => element.querySelector('[role="alert"]')?.textContent || '');
    if (error) throw new Error(error);
  }
  async function network(offline) {
    await cdp.send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    assert.equal(await page.evaluate(() => navigator.onLine), !offline, 'navigator.onLine disagrees with CDP offline mode.');
  }
  await page.goto(`${base}/report?fixture=02-icon-pay-button&variant=broken`, { waitUntil: 'networkidle2' });
  await settled();
  assert.equal(new URL(page.url()).searchParams.has('demo'), false);
  assert.equal(await page.$eval('.notice', e => /deterministic demo/i.test(e.textContent)), false);
  await screenshot('01-capture');

  stage = 'prepare';
  const prepare = await page.$('section[aria-labelledby="report-device-heading"] button');
  if (prepare) { await click('Prepare private on-device AI'); await settled(); }
  const state = await page.$eval('section[aria-labelledby="report-device-heading"] strong', e => e.textContent);
  assert.equal(state, 'available', `Nano preparation returned ${state}`);
  await screenshot('02-prepared');

  stage = 'draft';
  const requestsBeforeDraft = aiRequests;
  await network(true);
  const draftStart = performance.now();
  await click('Create private draft');
  await settled();
  const draftRows = (await rows()).filter(row => row.step === 'draft');
  assert.ok(draftRows.length, 'No draft routing row rendered.');
  const draftRow = draftRows.at(-1);
  results.draftDiagnostic = { routing: draftRow, wallMs: Math.round(performance.now() - draftStart) };
  results.deviceDiagnostics = await page.evaluate(() => window.barrierrelayDeviceDiagnostics ?? []);
  results.fallbackReason = draftRow.ranOn === 'local-code'
    ? results.deviceDiagnostics.filter(event => event.kind === 'unavailable-error' && event.operation === 'draft').at(-1)?.message ?? 'No unavailable error captured.'
    : null;
  assert.equal(draftRow.ranOn, 'on-device', 'Offline draft must use the real SDK on-device response, not rules fallback.');
  assert.equal(draftRow.bytes, 0);
  assert.match(draftRow.note, /\bOffline\b/);
  assert.equal(aiRequests, requestsBeforeDraft, 'Offline drafting attempted an AI network request.');
  results.steps.push({ ...draftRow, offline: true, wallMs: Math.round(performance.now() - draftStart), aiNetworkRequests: aiRequests - requestsBeforeDraft });
  await screenshot('03-offline-draft');
  await network(false);

  // Tag the real ticket using the editable UI, before running its self-check.
  const summary = await page.$('textarea');
  await summary.focus();
  await page.keyboard.down('Control'); await page.keyboard.press('Home'); await page.keyboard.up('Control');
  await page.keyboard.type('[e2e] ');
  stage = 'self-check';
  await click('Run self-check'); await settled();
  const checkText = await page.$$eval('p[role="status"]', elements => elements.map(e => e.textContent).join('\n'));
  results.selfCheck = { text: checkText, onDevice: (await rows()).some(row => row.step === 'self-check' && row.ranOn === 'on-device') };
  results.steps.push(...(await rows()).filter(row => row.step === 'self-check'));
  await screenshot('04-self-check');
  assert.match(checkText, /Self-check passed\./);

  stage = 'privacy';
  const payloadText = await page.$eval('pre.payload', element => element.textContent);
  assert.doesNotMatch(payloadText, /"(?:userNote|visibleText)"\s*:/);
  const payload = JSON.parse(payloadText);
  results.privacy = { noUserNote: true, noVisibleTextByDefault: true, bytes: payload.bytes };
  await screenshot('05-privacy');

  stage = 'cloud';
  await click('Get a fix plan');
  try { await settled(); } catch (error) {
    results.cloudError = error.message;
    await screenshot('06-cloud-error');
    const oldSearchQuota = /429|RESOURCE_EXHAUSTED/i.test(error.message) && /search|grounding|quota/i.test(error.message);
    if (!allowCloudFail || !oldSearchQuota) throw error;
    results.cloudFailureExpected = true;
    results.expectedUntil = 'Google Search quota failure; rerun after URL-context grounding lands.';
  }
  if (!results.cloudFailureExpected) {
    const cloudRow = (await rows()).findLast(row => row.step === 'fix-plan');
    assert.ok(cloudRow, 'Cloud routing row missing.');
    assert.equal(cloudRow.ranOn, 'in-cloud');
    assert.ok(cloudRow.bytes > 0, 'Cloud bytes must be positive.');
    results.steps.push(...(await rows()).filter(row => row.step === 'redact' || row.step === 'fix-plan'));
    results.sources = await page.$$eval('.sources a', links => links.map(link => ({ text: link.textContent, url: link.href })));
    assert.ok(results.sources.length, 'Real grounded cloud plan must render sources.');
    for (const source of results.sources) { assert.match(source.url, /^https:\/\//); assert.ok(source.text.includes(source.url) && source.text.length > source.url.length, 'Source must show title and URL.'); }
    await screenshot('06-cloud-plan');

    stage = 'share';
    await click('Create shareable ticket'); await settled();
    const ownerLink = await page.$eval('[data-testid="owner-link"]', link => link.href);
    results.ticketId = new URL(ownerLink).pathname.split('/')[2];
    assert.match(results.ticketId, /^[A-Za-z0-9]{20}$/);
    await screenshot('07-share');
    stage = 'owner';
    results.deviceDiagnostics = await page.evaluate(() => window.barrierrelayDeviceDiagnostics ?? []);
    await page.goto(ownerLink, { waitUntil: 'networkidle2' }); await settled();
    await screenshot('08-owner-open');
    await click('Acknowledge'); await settled();
    assert.equal(await page.$eval('[data-testid="ticket-status"]', e => e.textContent), 'acknowledged');
    await click('Mark fixed'); await settled();
    await page.select('#verify-fixture', '02-icon-pay-button');
    await screenshot('09-owner-fixed');
    stage = 'verify';
    await click('Verify fix'); await settled();
    assert.equal(await page.$eval('[data-testid="ticket-status"]', e => e.textContent), 'verified');
    results.steps.push(...(await rows()).filter(row => row.step === 'verify'));
    await screenshot('10-owner-verified');
    results.completed = true;
  }
} catch (error) {
  results.failure = { stage, message: error.message, codePath: paths[stage] || stage, stack: error.stack };
  if (page && !page.isClosed()) {
    results.failure.uiError = await page.$eval('main', e => e.querySelector('[role="alert"]')?.textContent || '').catch(() => '');
    await page.screenshot({ path: fileURLToPath(new URL(`real-failure-${stage}.png`, out)), fullPage: true }).catch(() => undefined);
  }
  process.exitCode = 1;
} finally {
  if (page && !page.isClosed()) {
    const current = await page.evaluate(() => window.barrierrelayDeviceDiagnostics ?? []).catch(() => []);
    const combined = [...(results.deviceDiagnostics ?? []), ...current];
    results.deviceDiagnostics = combined.filter((event, index) => combined.findIndex(other =>
      other.documentStartedAt === event.documentStartedAt && other.atMs === event.atMs && other.kind === event.kind) === index);
  }
  if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => undefined);
  await browser?.close();
  if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} }
  await writeFile(new URL('real-results.json', out), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
