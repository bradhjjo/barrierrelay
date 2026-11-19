import puppeteer from 'puppeteer-core';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = new URL('./out/', import.meta.url);
await mkdir(out, { recursive: true });
await import('../../apps/web/scripts/copy-fixtures.mjs');
const base = process.env.BARRIERRELAY_E2E_URL || 'http://127.0.0.1:5173';
let server;
try { await fetch(base); } catch {
  server = spawn('npm', ['run', 'dev', '--', '--strictPort'], { cwd: `${root}/apps/web`, stdio: 'ignore' });
  for (let n = 0; n < 60; n++) { try { if ((await fetch(base)).ok) break; } catch {} await delay(250); }
}
const profile = await mkdtemp(`${tmpdir()}/barrierrelay-e2e-`);
let browser;
const results = { ticketId: null, axe: {}, mode: 'Deterministic local-code pipeline; real Firebase Auth, App Check initialization and Firestore.' };
try {
  browser = await puppeteer.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, userDataDir: profile, args: ['--no-first-run', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(45000);
  const axe = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  async function checkpoint(name) {
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, out)), fullPage: true });
    await page.evaluate(axe);
    const report = await page.evaluate(async () => { const result = await window.axe.run(document); return result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })); });
    results.axe[name] = report;
    const severe = report.filter(v => ['serious','critical'].includes(v.impact));
    if (severe.length) throw new Error(`${name} accessibility violations: ${JSON.stringify(severe)}`);
  }
  async function button(text) { const buttons = await page.$$('button'); for (const b of buttons) { if (await b.evaluate((e, value) => e.textContent.trim() === value, text)) { await b.focus(); await page.keyboard.press('Enter'); return; } } throw new Error(`Button not found: ${text}`); }
  async function waitText(text) { await page.waitForFunction(t => document.body.innerText.includes(t), {}, text); }
  async function noError() { const error = await page.$('[role="alert"]'); if (error) throw new Error(await error.evaluate(e => e.textContent)); }
  await page.goto(`${base}/?demo=1`, { waitUntil: 'networkidle2' });
  await waitText('Try a demo'); await checkpoint('home');
  await page.goto(`${base}/report?fixture=02-icon-pay-button&variant=broken&demo=1`, { waitUntil: 'networkidle2' });
  await waitText('Secure checkout'); await checkpoint('report-1-capture');
  await button('Create private draft'); await waitText('Rules-only draft (no on-device AI available)');
  const summary = await page.$('textarea'); await summary.focus(); await page.keyboard.down('Control'); await page.keyboard.press('Home'); await page.keyboard.up('Control'); await page.keyboard.type('[e2e] ');
  await checkpoint('report-2-draft');
  await button('Run self-check'); await waitText('Self-check passed.'); await checkpoint('report-3-privacy');
  await button('Get a fix plan'); await waitText('4. Repair guidance'); await checkpoint('report-4-plan');
  await button('Create shareable ticket');
  await page.waitForFunction(() => document.querySelector('[data-testid="owner-link"]') || document.querySelector('[role="alert"]'));
  await noError();
  const ownerLink = await page.$eval('[data-testid="owner-link"]', e => e.href);
  results.ticketId = new URL(ownerLink).pathname.split('/')[2];
  if (!/^[A-Za-z0-9]{20}$/.test(results.ticketId)) throw new Error('Expected Firestore auto-generated 20-character ID.');
  await checkpoint('report-5-share');
  await page.goto(`${ownerLink}?demo=1`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('[data-testid="ticket-status"]'); await checkpoint('owner-open');
  await button('Acknowledge'); await page.waitForFunction(() => document.querySelector('[data-testid="ticket-status"]').textContent === 'acknowledged');
  await button('Mark fixed'); await page.waitForFunction(() => document.querySelector('[data-testid="ticket-status"]').textContent === 'fixed');
  await page.select('#verify-fixture', '02-icon-pay-button');
  await button('Verify fix');
  await page.waitForFunction(() => document.querySelector('[data-testid="ticket-status"]').textContent === 'verified' || document.querySelector('[role="alert"]'));
  await noError(); await waitText('Verification pass'); await checkpoint('owner-verified');
  const rows = await page.$$eval('.routing tbody tr', rows => rows.map(r => r.textContent));
  if (!rows.some(row => row.includes('verify') && row.includes('Local code'))) throw new Error('Missing honest verification routing entry.');
  await page.goto(`${base}/mine?demo=1`, { waitUntil: 'networkidle2' }); await waitText('[e2e]'); await checkpoint('mine');
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(new URL('results.json', out), JSON.stringify(results, null, 2));
  await browser?.close(); server?.kill('SIGTERM'); await rm(profile, { recursive: true, force: true });
}
