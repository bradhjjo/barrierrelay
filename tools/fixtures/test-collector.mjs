import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const bundle = fileURLToPath(new URL('../../packages/collector/dist/collector.js', import.meta.url));
const profile = await mkdtemp(path.join(os.tmpdir(), 'barrierrelay-collector-test-'));
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="en"><title>Collector privacy test</title><style>
    button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid blue}
    #region{margin:30px;padding:20px;width:650px}#cap{margin:30px;padding:20px;width:650px}
    .click{cursor:pointer}.noFocus:focus,.noFocus:focus-visible{outline:none;box-shadow:none;border:1px solid black}
    .noFocus{border:1px solid black}button{margin:2px}
    </style><main id="region" aria-label="Test region">
    <label for="private">Email</label><input id="private" value="PRIVATE_FORM_CANARY_98765" autocomplete="email">
    <button aria-labelledby="private">Referenced textbox</button>
    <textarea aria-label="Message">PRIVATE_TEXTAREA_CANARY_98765</textarea>
    <a href="/orders?token=SECRET#private" data-private="NEVER_SERIALIZE">Order 4242</a>
    <div class="click" onclick="void 0">Continue</div><button class="noFocus">No focus style</button>
    <button hidden>Hidden button</button><input type="hidden" value="HIDDEN_CANARY_98765">
    </main><section id="cap" aria-label="Forty element cap">${Array.from({length:50},(_,i)=>`<button>Action ${i}</button>`).join('')}</section></html>`);
});
let browser;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await puppeteer.launch({ executablePath: '/opt/google/chrome/chrome', headless: true, userDataDir: profile, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${server.address().port}/test?secret=PAGE_SECRET#private`);
  await page.addScriptTag({ path: bundle });
  await page.keyboard.press('Tab');
  const result = await page.evaluate(async () => {
    const region = document.getElementById('region');
    const originalFocus = document.activeElement;
    const refs = window.BarrierRelayCollector.getElementRefs(region);
    const options = { userNote: 'x'.repeat(350), assistive: ['keyboard-only'], focusTrail: Array.from({length:30},(_,index)=>({index,key:'Tab',ref:index===0?'invalid':'e2'})) };
    const facts = await window.BarrierRelayCollector.collect(region, options);
    const b = region.getBoundingClientRect();
    const byBox = await window.BarrierRelayCollector.collect({x:b.x,y:b.y,w:b.width,h:b.height}, {...options, focusTrail: []});
    const cap = await window.BarrierRelayCollector.collect(document.getElementById('cap'), {...options,focusTrail: []});
    return { facts, byBox, cap, focusRestored: originalFocus === document.activeElement,
      matchingRefs: [...refs.keys()].join() === facts.elements.map(e=>e.ref).join(),
      privateUnchanged: document.getElementById('private').getAttribute('value') === 'PRIVATE_FORM_CANARY_98765' };
  });
  const serialized = JSON.stringify(result.facts);
  for (const secret of ['PRIVATE_FORM_CANARY', 'PRIVATE_TEXTAREA_CANARY', 'HIDDEN_CANARY', 'PAGE_SECRET', 'SECRET', 'NEVER_SERIALIZE']) assert(!serialized.includes(secret), `Leaked ${secret}`);
  assert(result.focusRestored && result.matchingRefs && result.privateUnchanged);
  assert.equal(result.facts.userNote.length, 300);
  assert.equal(result.facts.focusTrail.length, 20);
  assert.equal(result.facts.focusTrail[0].ref, null);
  assert.equal(result.cap.elements.length, 40);
  assert.equal(result.cap.elements.at(-1).ref, 'e40');
  assert.deepEqual(result.byBox.elements.map(e=>e.ref), result.facts.elements.map(e=>e.ref));
  assert(!result.facts.elements.some(e=>e.accessibleName === 'Hidden button'));
  const link = result.facts.elements.find(e=>e.tag==='a');
  assert.equal(link.visibleText, 'Order ####');
  assert(!/[?#]/.test(link.attrs.href));
  assert(result.facts.ruleHits.some(h=>h.ruleId==='br-click-not-focusable'));
  assert(result.facts.ruleHits.some(h=>h.ruleId==='br-focus-not-visible'));
  console.log('Collector smoke tests passed: input-value privacy (including referenced textboxes), attrs/URLs, masking, DOM refs, hidden controls, BBox, 40-element/20-step caps, focus restoration, own rules.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive:true, force:true });
}
