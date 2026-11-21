export {};
declare const chrome: any;
const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';
const ORIGINS = [DEFAULT_ORIGIN, 'http://127.0.0.1:4173', 'https://barrierrelay-lpun3.web.app'];
const pending = new Set<string>();
const RETURN_KEY = 'control:returnTarget';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Keep return-target read/create/remove atomic relative to arming and other captures.
let returnQueue: Promise<unknown> = Promise.resolve();
function withReturnLock<T>(work: () => Promise<T>): Promise<T> {
  const next = returnQueue.then(work);
  returnQueue = next.catch(() => {});
  return next;
}

async function startCapture(tab?: any) {
  if (!tab?.id) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Open a regular web page first.');
  try { await chrome.tabs.sendMessage(tab.id, { type: 'startCapture' }); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'startCapture' });
  }
}
// Exposed for automation: Chrome does not dispatch extension commands from synthetic key events.
(globalThis as any).startCapture = startCapture;
chrome.action.onClicked.addListener((tab: any) => startCapture(tab).catch(console.warn));
chrome.commands.onCommand.addListener((command: string) => {
  if (command === 'capture-current') startCapture().catch(console.warn);
});
chrome.runtime.onMessage.addListener((message: any, sender: any, respond: any) => {
  if (message?.type !== 'capture' || sender.id !== chrome.runtime.id || !sender.tab) return;
  (async () => {
    const active = await chrome.tabs.query({ active: true, windowId: sender.tab.windowId });
    if (active[0]?.id !== sender.tab.id) throw new Error('Keep the captured tab active and try again.');
    const data = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
    const image = await createImageBitmap(await (await fetch(data)).blob());
    const region = message.facts.region;
    const sx = image.width / message.facts.page.viewport.w;
    const sy = image.height / message.facts.page.viewport.h;
    const scale = Math.min(1, 768 / Math.max(region.w * sx, region.h * sy));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(region.w * sx * scale)), Math.max(1, Math.round(region.h * sy * scale)));
    canvas.getContext('2d')!.drawImage(image, region.x * sx, region.y * sy, region.w * sx, region.h * sy, 0, 0, canvas.width, canvas.height);
    image.close();
    const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let binary = ''; for (const byte of png) binary += String.fromCharCode(byte);
    const id = crypto.randomUUID();
    await chrome.storage.session.set({ [`capture:${id}`]: { facts: message.facts, regionPngDataUrl: 'data:image/png;base64,' + btoa(binary), expires: Date.now() + 30 * 60 * 1000 } });
    // Limit lifetime and storage, even if a user never opens the report.
    const all = await chrome.storage.session.get(null);
    await chrome.storage.session.remove(Object.keys(all).filter(k => k.startsWith('capture:') && all[k].expires < Date.now()));
    const config = await chrome.storage.local.get('webOrigin');
    const origin = ORIGINS.includes(config.webOrigin) ? config.webOrigin : DEFAULT_ORIGIN;
    await withReturnLock(async () => {
      const target = (await chrome.storage.session.get(RETURN_KEY))[RETURN_KEY];
      const valid = target && target.expires > Date.now() && ORIGINS.includes(target.origin) && /^\/t\/[A-Za-z0-9]{20}$/.test(target.path);
      if (target && !valid) await chrome.storage.session.remove(RETURN_KEY);
      await chrome.tabs.create({ url: `${valid ? target.origin : origin}${valid ? target.path : '/report'}?capture=${id}&ext=${chrome.runtime.id}` });
      // A failed tabs.create leaves a valid target armed for retry.
      if (valid) await chrome.storage.session.remove(RETURN_KEY);
    });
    respond({ ok: true });
  })().catch(error => respond({ error: error.message }));
  return true;
});
chrome.runtime.onMessageExternal.addListener((message: any, sender: any, respond: any) => {
  let origin: string; try { origin = new URL(sender.url).origin; } catch { return; }
  if (!ORIGINS.includes(origin)) return;
  if (message?.type === 'ping') { respond({ version: chrome.runtime.getManifest().version }); return; }
  if (message?.type === 'armReturn') {
    if (typeof message.ticketId !== 'string' || !/^[A-Za-z0-9]{20}$/.test(message.ticketId)) { respond({ error: 'Invalid ticket ID.' }); return; }
    withReturnLock(() => chrome.storage.session.set({ [RETURN_KEY]: { path: `/t/${message.ticketId}`, origin, expires: Date.now() + 30 * 60 * 1000 } }))
      .then(() => respond({ ok: true })).catch((error: Error) => respond({ error: error.message }));
    return true;
  }
  if (message?.type !== 'getCapture') return;
  if (typeof message.id !== 'string' || !UUID.test(message.id)) { respond({ error: 'Invalid capture ID.' }); return; }
  if (pending.has(message.id)) { respond({ error: 'Capture is already being retrieved.' }); return; }
  pending.add(message.id);
  (async () => {
    try {
      const key = `capture:${message.id}`;
      const bundle = (await chrome.storage.session.get(key))[key];
      await chrome.storage.session.remove(key);
      respond(bundle && bundle.expires > Date.now() ? { facts: bundle.facts, regionPngDataUrl: bundle.regionPngDataUrl } : { error: 'Capture expired or already retrieved.' });
    } finally { pending.delete(message.id); }
  })().catch(error => respond({ error: error.message }));
  return true;
});
