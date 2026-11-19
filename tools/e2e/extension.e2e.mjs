import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { id } = JSON.parse(await readFile(resolve(root, 'extension/key.json'), 'utf8'));
const stub = `<!doctype html><html lang="en"><title>BarrierRelay intake test</title><h1>Capture intake test</h1><p role="status" id="result" aria-live="polite">Receiving capture…</p><script>
const p=new URLSearchParams(location.search);window.captureResult=null;
chrome.runtime.sendMessage(p.get('ext'),{type:'getCapture',id:p.get('capture')},r=>{window.captureResult=r||{error:chrome.runtime.lastError?.message||'No response'};document.querySelector('#result').textContent=window.captureResult.error||'Capture received';});
</script></html>`;
const servers = [];
async function server(port, handler) {
  const instance = createServer(handler);
  await new Promise((resolve, reject) => { instance.once('error', reject); instance.listen(port, '127.0.0.1', resolve); });
  servers.push(instance); return instance;
}
let browser;
const profile = await mkdtemp(resolve(tmpdir(), 'barrierrelay-extension-e2e-'));
try {
  // A dedicated fixture server never depends on the app's UI or development server.
  const fixtureServer = await server(0, async (req, res) => {
    const path = resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (!path.startsWith(root + '/fixtures/')) { res.writeHead(404).end(); return; }
    try { res.setHeader('Content-Type', extname(path) === '.html' ? 'text/html' : 'text/css'); res.end(await readFile(path)); } catch { res.writeHead(404).end(); }
  });
  // A local-only proxy serves the report stub even when Vite owns port 5173.
  // The browser still sees the authorized web origin; no existing server is touched.
  const proxy = await server(0, async (req, res) => {
    try {
      const url = new URL(req.url);
      if (url.origin === 'http://127.0.0.1:5173' && url.pathname === '/report') {
        res.setHeader('Content-Type', 'text/html'); res.end(stub); return;
      }
      if (url.origin !== `http://127.0.0.1:${fixtureServer.address().port}`) { res.writeHead(403).end(); return; }
      const upstream = await fetch(url); res.writeHead(upstream.status, Object.fromEntries(upstream.headers)); res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { res.writeHead(502).end(); }
  });
  browser = await puppeteer.launch({ executablePath: '/opt/google/chrome/chrome', headless: process.env.HEADFUL !== '1', userDataDir: profile, enableExtensions: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-extension-debugging', `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=<-loopback>'] });
  const cdp = await browser.target().createCDPSession();
  const extensions = await cdp.send('Extensions.getExtensions');
  if (!extensions.extensions.some(e => e.id === id)) await cdp.send('Extensions.loadUnpacked', { path: resolve(root, 'extension/dist') });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${fixtureServer.address().port}/fixtures/pairs/02-icon-pay-button/broken.html`);
  // Only real keyboard input: the target's accessible name is intentionally empty.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.tagName === 'BUTTON')) break;
  }
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
  const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const targetInfo = targetInfos.find(t => t.url === page.url());
  assert.ok(targetInfo, 'Fixture tab target exists');
  // This is a genuine toolbar action and grants activeTab, unlike synthetic shortcuts.
  await cdp.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(el => el.shadowRoot?.querySelector('textarea')));
  const activeTag = () => page.evaluate(() => [...document.querySelectorAll('div')].find(el => el.shadowRoot?.querySelector('textarea'))?.shadowRoot.activeElement?.tagName);
  assert.equal(await activeTag(), 'TEXTAREA');
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  assert.equal(await activeTag(), 'BUTTON');
  await page.keyboard.press('Tab');
  assert.equal(await activeTag(), 'TEXTAREA');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'BUTTON');
  await cdp.send('Extensions.triggerAction', { id, targetId: targetInfo.targetId });
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(el => el.shadowRoot?.querySelector('textarea')));
  await page.evaluate(() => {
    const host = [...document.querySelectorAll('div')].find(el => el.shadowRoot?.querySelector('textarea'));
    const s = host.shadowRoot;
    s.querySelector('textarea').value = 'I am trying to pay, but this button has no name.';
    s.querySelector('input[value="screen-reader"]').checked = true;
  });
  // Submit through a keyboard gesture with focus inside the extension's shadow DOM.
  await page.evaluate(() => [...document.querySelectorAll('div')].find(el => el.shadowRoot?.querySelector('textarea')).shadowRoot.querySelector('button[type=submit]').focus());
  const reportTargetPromise = browser.waitForTarget(t => t.url().startsWith('http://127.0.0.1:5173/report?capture='), { timeout: 30000 });
  await page.keyboard.press('Enter');
  const reportTarget = await reportTargetPromise;
  const report = await reportTarget.page();
  const url = new URL(reportTarget.url()); assert.ok(url.searchParams.get('capture')); assert.equal(url.searchParams.get('ext'), id);
  await report.waitForFunction(() => window.captureResult != null);
  const result = await report.evaluate(() => window.captureResult);
  assert.ok(!result.error, result.error);
  const target = result.facts.elements.find(el => el.tag === 'button' && el.accessibleName === '');
  assert.ok(target, 'Captured an unnamed button');
  assert.match(result.regionPngDataUrl, /^data:image\/png;base64,/);
  const dimensions = await report.evaluate(async data => { const image = new Image(); image.src = data; await image.decode(); return [image.width, image.height]; }, result.regionPngDataUrl);
  assert.ok(Math.max(...dimensions) <= 768);
  assert.ok(result.facts.focusTrail.some(step => step.key === 'Tab' && step.ref === target.ref));
  // One-time retrieval and origin authorization are part of the same integration boundary.
  const second = await report.evaluate(async () => { const p = new URLSearchParams(location.search); return await new Promise(resolve => chrome.runtime.sendMessage(p.get('ext'), { type:'getCapture', id:p.get('capture') }, resolve)); });
  assert.match(second.error, /already retrieved/);
  console.log(JSON.stringify({ extensionId: id, target, focusSteps: result.facts.focusTrail.length, pngBytes: result.regionPngDataUrl.length, oneTimeRetrieval: true }, null, 2));
} finally {
  await browser?.close();
  await Promise.all(servers.map(s => new Promise(resolve => s.close(resolve))));
  await rm(profile, { recursive: true, force: true });
}
