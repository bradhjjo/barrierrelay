import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoot = path.join(root, 'fixtures');
const pairs = path.join(fixtureRoot, 'pairs');
const bundle = path.join(root, 'packages/collector/dist/collector.js');
const profile = await mkdtemp(path.join(os.tmpdir(), 'barrierrelay-fixtures-'));
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(fixtureRoot, '.' + pathname);
    if (!filename.startsWith(fixtureRoot + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(filename);
    res.setHeader('Content-Type', filename.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end('Not found'); }
});
let browser;
const rows = [];
const index = { schemaVersion: 1, viewport: { w: 1280, h: 800 }, cases: [] };
const allowedKeys = new Set(['role', 'type', 'autocomplete', 'alt', 'href']);
function validate(facts) {
  assert.equal(facts.schemaVersion, 1);
  assert(!Number.isNaN(Date.parse(facts.capturedAt)));
  assert.equal(typeof facts.page.title, 'string');
  assert(!/[?#]/.test(facts.page.url));
  assert(facts.page.lang === null || typeof facts.page.lang === 'string');
  assert.deepEqual(facts.page.viewport, { w: 1280, h: 800 });
  for (const key of ['x','y','w','h']) assert(Number.isFinite(facts.region[key]));
  assert(facts.elements.length <= 40 && facts.focusTrail.length <= 20);
  const refs = new Set(facts.elements.map(e => e.ref));
  for (const [i, el] of facts.elements.entries()) {
    assert.equal(el.ref, `e${i+1}`);
    assert.equal(typeof el.tag, 'string');
    assert(el.role === null || typeof el.role === 'string');
    assert.equal(typeof el.accessibleName, 'string');
    assert(el.accessibleName.length <= 80);
    assert(Array.isArray(el.nameSources));
    assert.equal(typeof el.focusable, 'boolean');
    assert(el.tabIndex === null || Number.isInteger(el.tabIndex));
    assert(el.visibleFocusIndicator === null || typeof el.visibleFocusIndicator === 'boolean');
    for (const key of ['x','y','w','h']) assert(Number.isFinite(el.bbox[key]));
    assert(!('value' in el) && !('innerHTML' in el));
    assert(el.visibleText.length <= 40 && !/\d/.test(el.visibleText));
    if (['input','textarea','select'].includes(el.tag)) assert.equal(el.visibleText, '');
    for (const [key, value] of Object.entries(el.attrs)) {
      assert(allowedKeys.has(key) || key.startsWith('aria-'), `Forbidden attr ${key}`);
      assert.equal(typeof value, 'string');
      if (key === 'href') assert(!/[?#]/.test(value));
      if (key === 'alt') assert(['present','empty'].includes(value));
    }
  }
  for (const [i, step] of facts.focusTrail.entries()) {
    assert.equal(step.index, i);
    assert(['Tab','Shift+Tab','Enter','Space','Escape'].includes(step.key));
    assert(step.ref === null || refs.has(step.ref));
  }
  for (const hit of facts.ruleHits) {
    assert(refs.has(hit.ref));
    assert.equal(typeof hit.ruleId, 'string');
    assert.equal(typeof hit.detail, 'string');
  }
  assert.equal(typeof facts.userNote, 'string');
  assert(facts.userNote.length <= 300);
  assert(Array.isArray(facts.assistive));
}
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await puppeteer.launch({
    executablePath: '/opt/google/chrome/chrome', headless: true, userDataDir: profile,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'],
  });
  const dirs = (await readdir(pairs, { withFileTypes: true })).filter(d => d.isDirectory() && /^\d{2}-/.test(d.name)).map(d => d.name).sort();
  assert.equal(dirs.length, 10, 'Expected ten fixture pairs');
  for (const id of dirs) {
    const entry = { id, variants: {} };
    for (const variant of ['broken', 'fixed']) {
      const truthPath = path.join(pairs, id, `truth.${variant}.json`);
      const truth = JSON.parse(await readFile(truthPath, 'utf8'));
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
        // Self-contained fixtures must never fetch third-party resources.
        await page.setRequestInterception(true);
        page.on('request', req => req.url().startsWith(origin + '/') || req.url().startsWith('data:') ? req.continue() : req.abort());
        const errors = [];
        page.on('pageerror', err => errors.push(String(err)));
        await page.goto(`${origin}/pairs/${id}/${variant}.html`, { waitUntil: 'networkidle0' });
        await page.addScriptTag({ path: bundle });
        await page.evaluate(() => { window.__fixtureFocus = []; });
        for (const key of [...Array(12).fill('Tab'), ...(id.startsWith('07-') ? ['Escape'] : [])]) {
          await page.keyboard.press(key);
          await page.evaluate(key => {
            window.__fixtureFocus.push({ key, element: document.activeElement });
          }, key);
        }
        const { facts, targetRef } = await page.evaluate(async truth => {
          const region = document.querySelector(truth.regionSelector);
          if (!region) throw new Error(`Missing region ${truth.regionSelector}`);
          const refs = window.BarrierRelayCollector.getElementRefs(region);
          const reverse = new Map([...refs].map(([ref, element]) => [element, ref]));
          const focusTrail = window.__fixtureFocus.map((step, index) => ({ index, key: step.key, ref: reverse.get(step.element) || null }));
          const targetRef = reverse.get(document.querySelector('[data-target]')) || null;
          const facts = await window.BarrierRelayCollector.collect(region, { userNote: truth.userNote, assistive: truth.assistive, focusTrail });
          return { facts, targetRef };
        }, truth);
        assert.deepEqual(errors, [], `${id}/${variant} raised browser errors`);
        validate(facts);
        const targetHits = facts.ruleHits.filter(h => h.ref === targetRef).map(h => h.ruleId);
        if (variant === 'broken') {
          assert(targetRef && facts.elements.some(e => e.ref === targetRef), `${id}: broken target missing`);
          assert(targetHits.length || facts.focusTrail.some(s => s.ref === targetRef), `${id}: no target evidence`);
          truth.targetRef = targetRef;
        } else {
          assert.equal(truth.barrierType, 'none');
          assert.equal(truth.targetRef, null);
          assert.equal(targetHits.length, 0, `${id}: fixed target still has rule hits: ${targetHits.join(', ')}`);
        }
        const prefix = path.join(pairs, id, variant);
        await writeFile(truthPath, JSON.stringify(truth, null, 2) + '\n');
        await writeFile(`${prefix}.facts.json`, JSON.stringify(facts, null, 2) + '\n');
        await page.screenshot({ path: `${prefix}.full.png`, type: 'png', fullPage: false });
        const { x, y, w, h } = facts.region;
        const clip = { x: Math.max(0, x - 16), y: Math.max(0, y - 16), width: w + 32, height: h + 32 };
        clip.scale = Math.min(1, 768 / Math.max(clip.width, clip.height));
        await page.screenshot({ path: `${prefix}.region.png`, type: 'png', clip, captureBeyondViewport: true });
        rows.push({ case: id, variant, '#elements': facts.elements.length, '#ruleHits': facts.ruleHits.length, 'target ruleHit ids': targetHits.join(', ') || '—' });
        entry.variants[variant] = {
          html: `pairs/${id}/${variant}.html`, truth: `pairs/${id}/truth.${variant}.json`,
          facts: `pairs/${id}/${variant}.facts.json`, region: `pairs/${id}/${variant}.region.png`, full: `pairs/${id}/${variant}.full.png`,
        };
      } finally { await page.close(); }
    }
    index.cases.push(entry);
  }
  await writeFile(path.join(fixtureRoot, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  await writeFile(path.join(fixtureRoot, 'build-summary.json'), JSON.stringify(rows, null, 2) + '\n');
  console.table(rows);
  console.log('Broken targets without an axe-core hit (focus trail / br-* evidence remains): ' + rows.filter(r => r.variant === 'broken' && !r['target ruleHit ids'].split(', ').some(id => id !== '—' && !id.startsWith('br-'))).map(r => r.case).join(', '));
  console.log('Validated 20 CaptureFacts files; captured 20 region PNGs and 20 viewport PNGs.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
