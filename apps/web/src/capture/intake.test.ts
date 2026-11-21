// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForCapture, extensionInstalled, isExtensionMissing, loadFixture, armReturn, DEFAULT_EXTENSION_ID } from './intake';
const facts = { schemaVersion: 1, page: {}, region: {}, elements: [] };
const captureId = '12345678-1234-4abc-8abc-123456789abc';
const image = 'data:image/png;base64,iVBORw0KGgo=';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); history.replaceState(null, '', '/'); });
describe('capture intake', () => {
  it('retrieves a one-time capture through the external runtime API', async () => {
    history.replaceState(null, '', `/?capture=${captureId}&ext=${DEFAULT_EXTENSION_ID}`);
    const sendMessage = vi.fn((_id, _message, callback) => callback({ facts, regionPngDataUrl: image }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const result = await waitForCapture();
    expect(sendMessage).toHaveBeenCalledWith(DEFAULT_EXTENSION_ID, { type: 'getCapture', id: captureId }, expect.any(Function));
    expect(result.source).toBe('extension'); expect(result.regionPng?.type).toBe('image/png'); expect(location.search).toBe('');
  });
  it('rejects non-UUID capture tokens before messaging the extension', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    for (const id of ['returnTarget', 'control:returnTarget', 'capture:anything', '12345678-1234-1abc-8abc-123456789abc', '12345678-1234-4abc-7abc-123456789abc']) {
      history.replaceState(null, '', `/?capture=${encodeURIComponent(id)}&ext=${DEFAULT_EXTENSION_ID}`);
      await expect(waitForCapture()).rejects.toThrow('No valid extension capture');
    }
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it('arms a ticket return through the configured extension', async () => {
    const sendMessage = vi.fn((_id, _message, cb) => cb({ ok: true }));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    await armReturn('Ab123456789012345678');
    expect(sendMessage).toHaveBeenCalledWith(DEFAULT_EXTENSION_ID, { type: 'armReturn', ticketId: 'Ab123456789012345678' }, expect.any(Function));
    for (const id of ['', '../ticket', 'a'.repeat(19), 'a'.repeat(21), '_'.repeat(20)]) await expect(armReturn(id)).rejects.toThrow('Invalid ticket');
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it('reports arming failures', async () => {
    await expect(armReturn('a'.repeat(20))).rejects.toThrow('not available');
    vi.stubGlobal('chrome', { runtime: { sendMessage: (_id: string, _m: unknown, cb: any) => cb({ error: 'denied' }) } });
    await expect(armReturn('a'.repeat(20))).rejects.toThrow('denied');
  });
  it('classifies only unreachable extensions as missing', async () => {
    await armReturn('a'.repeat(20)).catch(e => expect(isExtensionMissing(e)).toBe(true));
    vi.stubGlobal('chrome', { runtime: { lastError: { message: 'Could not establish connection. Receiving end does not exist.' }, sendMessage: (_id: any, _m: any, cb: any) => cb(undefined) } });
    await armReturn('a'.repeat(20)).catch(e => expect(isExtensionMissing(e)).toBe(true));
    expect(isExtensionMissing(new Error('The extension did not respond. Try capturing again.'))).toBe(false);
    expect(isExtensionMissing(new Error('denied'))).toBe(false);
    expect.assertions(4);
  });
  it('pings the documented extension id', async () => {
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn((_id, _message, callback) => callback({ version: '0.1.0' })) } });
    expect(await extensionInstalled()).toBe(true);
  });
  it('reports missing extensions and connection errors', async () => {
    expect(await extensionInstalled()).toBe(false);
    history.replaceState(null, '', `/?capture=${captureId}&ext=${DEFAULT_EXTENSION_ID}`);
    vi.stubGlobal('chrome', { runtime: { lastError: { message: 'Not installed' }, sendMessage: (_id: any, _m: any, cb: any) => cb(undefined) } });
    await expect(waitForCapture()).rejects.toThrow('Not installed');
  });
  it('handles an expired capture and rejects malformed URLs', async () => {
    await expect(waitForCapture()).rejects.toThrow('No valid');
    history.replaceState(null, '', `/?capture=${captureId}&ext=${DEFAULT_EXTENSION_ID}`);
    vi.stubGlobal('chrome', { runtime: { sendMessage: (_id: any, _m: any, cb: any) => cb({ error: 'expired' }) } });
    await expect(waitForCapture()).rejects.toThrow('expired');
  });
  it('supports abort before and during retrieval', async () => {
    history.replaceState(null, '', `/?capture=${captureId}&ext=${DEFAULT_EXTENSION_ID}`);
    vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() } });
    const a = new AbortController(); a.abort(); await expect(waitForCapture(a.signal)).rejects.toMatchObject({ name: 'AbortError' });
    const b = new AbortController(); const pending = waitForCapture(b.signal); b.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('loads facts and a PNG fixture without chrome', async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith('.json') ? { ok:true, json:async()=>facts } : { ok:true, blob:async()=>new Blob(['png'],{type:'image/png'}) });
    vi.stubGlobal('fetch', fetcher);
    expect((await loadFixture('02-icon-pay-button', 'broken')).source).toBe('fixture');
    expect(fetcher).toHaveBeenCalledWith('/fixtures/pairs/02-icon-pay-button/broken.region.png');
    await expect(loadFixture('../private', 'broken')).rejects.toThrow('Invalid fixture');
  });
});
