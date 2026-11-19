import type { CaptureIntake, CaptureBundle } from '../contracts';
import type { CaptureFacts } from '@barrierrelay/shared/src/schema';
export const DEFAULT_EXTENSION_ID = 'ehiihcegnfekjkifcjmebdgiijpepdkp';
type Runtime = { lastError?: { message?: string }; sendMessage(id: string, message: unknown, callback: (response: any) => void): void };
function runtime(): Runtime | undefined { return (globalThis as typeof globalThis & { chrome?: { runtime?: Runtime } }).chrome?.runtime; }
function send(id: string, message: unknown, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    const api = runtime();
    if (signal?.aborted) { reject(new DOMException('Capture cancelled.', 'AbortError')); return; }
    if (!api) { reject(new Error('BarrierRelay extension is not available in this browser.')); return; }
    let settled = false;
    const finish = (error?: Error, value?: unknown) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value); };
    const abort = () => finish(new DOMException('Capture cancelled.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('The extension did not respond. Try capturing again.')), 10000);
    signal?.addEventListener('abort', abort, { once: true });
    try { api.sendMessage(id, message, response => { const error = api.lastError; finish(error ? new Error(error.message || 'Extension connection failed.') : response?.error ? new Error(response.error) : undefined, response); }); }
    catch (error) { finish(error as Error); }
  });
}
function facts(value: any): CaptureFacts {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.elements) || !value.page || !value.region) throw new Error('Invalid capture facts.');
  return value as CaptureFacts;
}
function png(data: unknown): Blob {
  if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Invalid capture image.');
  const bytes = Uint8Array.from(atob(data.split(',')[1]), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}
export async function waitForCapture(signal?: AbortSignal): Promise<CaptureBundle> {
  const params = new URLSearchParams(location.search);
  const id = params.get('capture'), extension = params.get('ext');
  if (!id || !extension || !/^[a-p]{32}$/.test(extension) || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) throw new Error('No valid extension capture in this URL. Use the extension to capture a page.');
  const response = await send(extension, { type: 'getCapture', id }, signal);
  const bundle: CaptureBundle = { facts: facts(response?.facts), regionPng: png(response?.regionPngDataUrl), source: 'extension' };
  // A capture is single-use: remove the consumed token, not unrelated query parameters.
  const url = new URL(location.href); url.searchParams.delete('capture'); url.searchParams.delete('ext'); history.replaceState(null, '', url);
  return bundle;
}
export async function loadFixture(caseId: string, variant: 'broken' | 'fixed'): Promise<CaptureBundle> {
  if (!/^\d{2}-[a-z0-9-]+$/.test(caseId) || !['broken', 'fixed'].includes(variant)) throw new Error('Invalid fixture.');
  const base = `/fixtures/pairs/${caseId}/${variant}`;
  const [json, image] = await Promise.all([fetch(base + '.facts.json'), fetch(base + '.region.png')]);
  if (!json.ok || !image.ok) throw new Error('Fixture could not be loaded.');
  return { facts: facts(await json.json()), regionPng: await image.blob(), source: 'fixture' };
}
export async function extensionInstalled(): Promise<boolean> {
  const id = (import.meta.env as Record<string, string | undefined>).VITE_EXTENSION_ID || DEFAULT_EXTENSION_ID;
  try { const response = await send(id, { type: 'ping' }); return typeof response?.version === 'string'; } catch { return false; }
}
export const captureIntake: CaptureIntake = { waitForCapture, loadFixture, extensionInstalled };
export default captureIntake;
