import { cp, mkdir } from 'node:fs/promises';
const source = new URL('../../../fixtures/', import.meta.url);
const destination = new URL('../public/fixtures/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL('index.json', source), new URL('index.json', destination));
await cp(new URL('pairs/', source), new URL('pairs/', destination), { recursive: true, filter: path => !path.includes('.') || /\.(html|json|png)$/.test(path) });
console.log('Copied synthetic fixture pages, facts, truth and screenshots.');
