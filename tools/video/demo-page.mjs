import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fixture = new URL('../../apps/web/public/fixtures/pairs/02-icon-pay-button/broken.html', import.meta.url);
const escape = (text) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export async function serveDemo(work) {
  const file = resolve(work, 'checkout.html');
  const diff = resolve(work, 'checkout-diff.html');
  await writeFile(file, await readFile(fixture));
  const server = createServer(async (request, response) => {
    const path = { '/checkout.html': file, '/source-diff.html': diff }[request.url];
    if (request.method !== 'GET' || typeof path !== 'string') {
      response.writeHead(404).end();
      return;
    }
    try {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(await readFile(path));
    } catch (error) {
      response.destroy(error);
    }
  });
  await new Promise((done, fail) => {
    // Reuse the checkout fixture's synthetic origin when it is free.
    server.once('error', error => {
      if (error.code !== 'EADDRINUSE') return fail(error);
      server.once('error', fail);
      server.listen(0, '127.0.0.1', done);
    });
    server.listen(40231, '127.0.0.1', done);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

export async function applySuggestedFix(work, codeAfter) {
  // Use only an explicit accessible name or literal button text from the model's
  // single-button example. Preserve the checkout's SVG and click handler.
  const snippet = codeAfter.trim().replace(/^```(?:html)?[^\S\r\n]*\r?\n([\s\S]+)\r?\n```$/i, '$1').trim();
  const label = /^<button[ \t\r\n\f]+aria-label[ \t\r\n\f]*=[ \t\r\n\f]*(?:"([^"<>&]+)"|'([^'<>&]+)')[ \t\r\n\f]*>[ \t\r\n\f]*<\/button>$/i.exec(snippet);
  const text = /^<button[ \t\r\n\f]*>([^<>]+)<\/button>$/i.exec(snippet);
  const name = label?.[1] ?? label?.[2] ?? text?.[1] ?? '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\u2019.,!?$€£-]{0,78}$/u.test(name) || name.trim() !== name || name.includes('  ')) {
    throw new Error('Unsupported cloud codeAfter: expected an empty button with only aria-label, or a button with only plain text. No patch applied.');
  }
  const file = resolve(work, 'checkout.html');
  const original = await readFile(file, 'utf8');
  const targets = [...original.matchAll(/<button data-target\s+onclick="[^"<>]+">/g)];
  if (targets.length !== 1) throw new Error('Expected one known unpatched checkout button.');
  const before = targets[0][0];
  const after = label ? before.replace('data-target', () => `data-target aria-label="${escape(name)}"`) : `${before}${escape(name)}`;
  await writeFile(`${file}.next`, original.replace(before, () => after));
  await rename(`${file}.next`, file);
  const lines = { before, after };
  await writeFile(resolve(work, 'checkout-diff.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Checkout source diff</title>
<style>body{background:#f6f7ef;color:#173e35;font:26px system-ui;margin:130px}h1{font-size:64px}pre{border-radius:16px;background:#142d27;color:white;padding:36px;font:25px/1.8 monospace;white-space:pre-wrap;overflow-wrap:anywhere}del,ins{display:block;text-decoration:none}del{color:#ffc0bc}ins{color:#adf2cd}</style>
<main><h1>Checkout source diff</h1><p>Applied the cloud plan’s ${label ? 'accessible name' : 'button text'} to the demo page.</p><pre><del>− ${escape(before)}</del><ins>+ ${escape(after)}</ins></pre><p>Saved checkout.html. Reloading the same page for the reporter’s re-capture.</p></main></html>`);
  return { ...lines, name };
}
