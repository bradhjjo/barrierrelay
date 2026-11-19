import { build } from 'esbuild';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const { key } = JSON.parse(await readFile(new URL('key.json', root)));
await mkdir(new URL('dist', root), { recursive: true });
await build({ entryPoints: ['src/content.ts', 'src/background.ts', 'src/options.ts'].map(p => new URL(p, root).pathname), outdir: new URL('dist', root).pathname, bundle: true, format: 'iife', target: 'chrome120' });
const manifest = {
  manifest_version: 3, name: 'BarrierRelay', version: '0.1.0', key,
  description: 'Capture an accessibility barrier privately, using your keyboard.',
  permissions: ['activeTab', 'scripting', 'storage'],
  background: { service_worker: 'background.js' },
  action: { default_title: 'Capture where I am now' },
  commands: { 'capture-current': { suggested_key: { default: 'Alt+Shift+B' }, description: 'Capture where I am now' } },
  content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'], run_at: 'document_start' }],
  options_page: 'options.html',
  externally_connectable: { matches: ['http://127.0.0.1:5173/*', 'https://barrierrelay-lpun3.web.app/*'] }
};
await writeFile(new URL('dist/manifest.json', root), JSON.stringify(manifest, null, 2));
await copyFile(new URL('src/options.html', root), new URL('dist/options.html', root));
