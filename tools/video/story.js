// This script runs in ego-browser's Node runtime with a config supplied by record.mjs.
const { spawn } = await import('node:child_process');
const { setTimeout: delay } = await import('node:timers/promises');
const { appendFile, writeFile } = await import('node:fs/promises');
const { pathToFileURL } = await import('node:url');
const { resolve } = await import('node:path');
const { applySuggestedFix } = await import(pathToFileURL(resolve('tools/video/demo-page.mjs')));
const { checkout, work, extension, id } = config;
const app = 'http://127.0.0.1:5173';
const metrics = { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false };
const verificationDescription = "Verification uses the reporter's re-capture of the repaired page: a scoped rule check on the same control, not WCAG conformance.";
const size = { width: metrics.width, height: metrics.height };
const progress = phase => appendFile(work + '/story-phases.log', new Date().toISOString() + ' ' + phase + '\n');
await writeFile(work + '/story-phases.log', '');
await taskSpaces.useOrCreate('barrierrelay-video');
page.setDefaultTimeout(30000);

async function waitFor(probe, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  do {
    const result = await probe();
    if (result) return result;
    await delay(200);
  } while (Date.now() < deadline);
  throw Error('Timed out waiting for ' + label);
}

async function viewport(session) {
  if (session) await cdp('Page.enable', {}, session);
  await cdp('Emulation.setDeviceMetricsOverride', metrics, session);
  await cdp('Page.bringToFront', {}, session);
}

function decorate(label, privacy = false) {
  document.getElementById('video-recorder-label')?.remove();
  const badge = document.createElement('p');
  badge.id = 'video-recorder-label';
  badge.textContent = label;
  badge.style.cssText = 'position:fixed;z-index:2147483647;top:12px;left:50%;transform:translateX(-50%);margin:0;padding:10px 20px;border-radius:8px;background:#102e34;color:white;font:600 18px system-ui;pointer-events:none;box-shadow:0 2px 14px #0003';
  document.body.append(badge);
  if (privacy) {
    // Recorder-only styling. Keep the owner link and original screenshot out of the video.
    const style = document.createElement('style');
    style.textContent = 'img.capture, input[readonly]{filter:blur(7px)}';
    document.head.append(style);
  }
}

async function checkoutView(label) {
  await viewport();
  await page.evaluate(showPrivacyBadge => {
    const contact = [...document.querySelectorAll('p')].find(p => p.textContent.includes('@example.com'));
    if (!contact) throw Error('Missing synthetic checkout contact details.');
    contact.style.filter = 'blur(7px)';
    if (showPrivacyBadge) {
      const badge = document.createElement('p');
      badge.textContent = 'DEMO EMAIL/ADDRESS BLURRED';
      badge.style.cssText = 'position:fixed;z-index:2147483647;bottom:20px;right:28px;margin:0;padding:8px;background:#102e34;color:white;font:15px system-ui;pointer-events:none';
      document.body.append(badge);
    }
  }, Boolean(label));
  if (label) await page.evaluate(decorate, label);
}

async function managedShot(name, action) {
  await page.screencast.start({ path: work + '/' + name + '.webm', size, quality: 95 });
  try { await action(); } finally { await page.screencast.stop(); }
}

async function targets() {
  return (await cdp('Target.getTargets', {}, null)).targetInfos;
}

async function focusPay() {
  if (await page.evaluate(() => document.activeElement?.matches('button[data-target]'))) return;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    await delay(360);
    if (await page.evaluate(() => document.activeElement?.matches('button[data-target]'))) return;
  }
  throw Error('Keyboard did not reach the checkout payment button.');
}

async function capture(note, path, record) {
  await focusPay();
  const before = new Set((await targets()).map(target => target.targetId));
  await page.evaluate(() => document.getElementById('video-recorder-label')?.remove());
  const tabs = await cdp('Target.getTargets', { filter: [{ type: 'tab' }] }, null);
  const tab = tabs.targetInfos.find(t => t.url === checkout);
  if (!tab) throw Error('Could not find the checkout tab.');
  await cdp('Extensions.triggerAction', { id, targetId: tab.targetId }, null);
  await page.waitForFunction(() => [...document.querySelectorAll('div')].some(el => el.shadowRoot?.querySelector('textarea')));
  await page.evaluate(() => [...document.querySelectorAll('div')]
    .find(el => el.shadowRoot?.querySelector('textarea')).shadowRoot.querySelector('textarea').focus());
  for (const char of note) {
    await page.keyboard.type(char);
    if (record) await delay(45);
  }
  await page.getByRole('checkbox', { name: 'Screen reader' }).check();
  if (record) await delay(1400);
  await page.getByRole('button', { name: 'Capture and open report' }).focus();
  await page.keyboard.press('Enter');
  const target = await waitFor(async () => (await targets()).find(t =>
    t.type === 'page' && !before.has(t.targetId) && t.url.startsWith(app + path)
  ), 'the extension handoff tab');
  return attach(target.targetId);
}

async function attach(targetId) {
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true }, null);
  return {
    sessionId,
    async eval(fn, ...args) {
      const result = await cdp('Runtime.evaluate', {
        expression: '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')',
        returnByValue: true,
        awaitPromise: true,
      }, sessionId);
      return result.exceptionDetails ? undefined : result.result.value;
    },
    async scroll(selector) {
      const found = await this.eval(selector => {
        const element = document.querySelector(selector);
        element?.scrollIntoView({ block: 'center' });
        return Boolean(element);
      }, selector);
      if (!found) throw Error('Missing element: ' + selector);
    },
    async click(name, selector = 'button') {
      const { x, y } = await waitFor(() => this.eval((name, selector) => {
        const element = [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === name);
        if (!element || element.disabled) return null;
        element.scrollIntoView({ block: 'center' });
        const rect = element.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      }, name, selector), 'enabled control ' + name);
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }, sessionId);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }, sessionId);
    },
    async ready(predicate = '') {
      await waitFor(async () => {
        const state = await this.eval(() => ({
          unavailable: location.protocol === 'chrome-error:',
          loading: /Loading services|Working…/.test(document.querySelector('.notice')?.textContent),
          demo: document.querySelector('.notice')?.textContent.includes('Deterministic demo mode'),
          failed: document.querySelector('main [role="alert"]')?.textContent,
          text: document.body.innerText,
        }));
        if (state?.unavailable) throw Error('The development app is unreachable.');
        if (state?.demo) throw Error('The app is running in demo mode.');
        if (state?.failed) {
          const safe = state.failed.replace(/https?:\/\/\S+/g, '[URL]').replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]');
          throw Error('App action failed: ' + safe.slice(0, 300));
        }
        return state && !state.loading && state.text.includes(predicate);
      }, predicate || 'app ready', 90000);
    },
  };
}

// Extension-created tabs stay attached to their genuine navigation. This recorder
// consumes their CDP frames without reopening the one-time handoff URL.
async function rawShot(tab, name, action) {
  const session = tab.sessionId;
  const encoder = spawn('ffmpeg', [
    '-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '10', '-i', 'pipe:0',
    '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '6', '-b:v', '4M',
    work + '/' + name + '.webm',
  ], { stdio: ['pipe', 'ignore', 'inherit'] });
  encoder.stdin.on('error', () => {});
  const encoded = new Promise(resolve => {
    encoder.on('error', () => resolve(false));
    encoder.on('exit', code => resolve(code === 0));
  });
  await page.drainEvents();
  await cdp('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080 }, session);
  let active = true;
  let count = 0;
  const pump = (async () => {
    let frame;
    while (active) {
      await delay(100);
      for (const event of await page.drainEvents()) {
        if (event.method !== 'Page.screencastFrame' || event.sessionId !== session) continue;
        frame = Buffer.from(event.params.data, 'base64');
        await cdp('Page.screencastFrameAck', { sessionId: event.params.sessionId }, session);
      }
      if (frame) {
        encoder.stdin.write(frame);
        count++;
      }
    }
  })();
  try {
    await action(() => count / 10);
  } finally {
    active = false;
    await pump;
    await cdp('Page.stopScreencast', {}, session);
    encoder.stdin.end();
    if (!await encoded || !count) throw Error('No usable screencast for ' + name);
  }
}

await cdp('Extensions.loadUnpacked', { path: extension }, null);
await page.goto('chrome-extension://' + id + '/options.html');
await page.locator('#origin').selectOption(app);
await page.getByRole('button', { name: 'Save' }).click();
await page.goto(checkout);
await checkoutView();
await managedShot('01-problem', async () => {
  await delay(1800);
  await focusPay();
  await page.evaluate(decorate, 'Screen reader announcement SIMULATION: “button”');
  await delay(6500);
});
await progress('Checkout problem recorded');
let report;
await managedShot('02-capture', async () => {
  await checkoutView('Real extension capture · demo checkout');
  await delay(1800);
  report = await capture('I need to pay, but my screen reader only says button.', '/report', true);
});
await progress('Extension opened report tab');
await viewport(report.sessionId);
await report.ready('Create private draft');
await progress('Report capture loaded');
const unnamedButtons = await report.eval(() => [...document.querySelectorAll('[aria-labelledby="capture-heading"] ul li')]
  .filter(line => /button:.*\(no accessible name\)/.test(line.innerText))
  .map(line => line.querySelector('code')?.textContent));
if (unnamedButtons?.length !== 1 || !unnamedButtons[0]) {
  throw Error('The original extension capture did not include the unnamed button.');
}
await report.eval(decorate, 'Real extension handoff · capture image blurred for recording', true);
await report.scroll('[aria-labelledby="capture-heading"]');
await rawShot(report, '02-handoff', () => delay(6100));
await report.click('Prepare private on-device AI');
await report.ready('On-device AI: available');
await progress('Nano prepared');

const network = offline => cdp('Network.emulateNetworkConditions', {
  offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
}, report.sessionId);
const routing = () => report.eval(() => [...document.querySelectorAll('.routing tbody tr')].map(row => ({
  step: row.cells[0].childNodes[0].textContent.trim(),
  note: row.cells[0].querySelector('small')?.textContent,
  where: row.cells[1].textContent.trim(),
  ms: Number(row.cells[2].textContent),
  bytes: Number(row.cells[3].textContent),
})));
const highlight = () => report.eval(() => {
  document.querySelector('.routing').style.boxShadow = '0 0 0 4px #18b9a3,0 12px 36px #0002';
});
async function checkedDraft() {
  await report.click('Run self-check');
  return waitFor(() => report.eval(() => [...document.querySelectorAll('main [role="status"]')]
    .map(status => status.textContent)
    .find(text => /^(Self-check passed\.|Review needed:)/.test(text))), 'a completed self-check', 55000);
}

let reporterCorrectedDraft = false;
let rows;
const offlineCuts = {};
await rawShot(report, '03-offline', async elapsed => {
  await cdp('Network.enable', {}, report.sessionId);
  await network(true);
  if (await report.eval(() => navigator.onLine) !== false) throw Error('The reporter tab is not offline.');
  await report.eval(decorate, 'Network: offline (DevTools emulation) · app + model already prepared', true);
  await delay(1800);
  await report.click('Create private draft');
  await delay(600);
  offlineCuts.waiting = elapsed();
  await report.ready('Draft ready.');
  rows = await routing();
  if (!rows.some(r => r.step === 'draft' && r.where === 'On-device' && r.bytes === 0 && /Offline/.test(r.note))) {
    throw Error('The offline draft did not use real on-device inference.');
  }
  await highlight();
  await report.scroll('.routing');
  await delay(500);
  offlineCuts.routing = elapsed();
  await delay(4700);
  offlineCuts.selfCheck = elapsed();
  await report.eval(() => {
    document.querySelector('textarea').focus();
    document.activeElement.setSelectionRange(0, 0);
  });
  await cdp('Input.insertText', { text: '[demo] ' }, report.sessionId);
  const check = await checkedDraft();
  if (check.startsWith('Review needed:')) {
    reporterCorrectedDraft = true;
    await report.eval(decorate, 'Offline · reporter corrects the draft using the captured facts', true);
    await delay(1500);
    const edited = await report.eval(target => {
      const button = [...document.querySelectorAll('main button')].find(el => el.textContent === 'Run self-check');
      const draft = button?.closest('section');
      if (!draft) return false;
      const fields = [
        ['Barrier type', 'unnamed-button'],
        ['Target element', target],
        ['Summary', 'Payment button has no accessible name.'],
        ['Expected', 'The payment button has an accessible name.'],
        ['Actual', 'The button has no accessible name.'],
        ['Steps to reproduce', 'Tab to the payment button.\nCheck its name in a screen reader.'],
      ];
      for (const [label, value] of fields) {
        const field = [...draft.querySelectorAll('label')].find(el => el.firstChild?.textContent.startsWith(label))
          ?.querySelector('select, textarea');
        if (!field) return false;
        field.value = value;
        if (field.value !== value) return false;
        field.dispatchEvent(new Event(field.matches('select') ? 'change' : 'input', { bubbles: true }));
      }
      return true;
    }, unnamedButtons[0]);
    if (!edited) throw Error('The recorder could not correct the draft through the review form.');
    if (await checkedDraft() !== 'Self-check passed.') throw Error('The self-check still requested review after the reporter correction.');
  }
  await delay(4500);
});
await writeFile(work + '/offline-cuts.json', JSON.stringify(offlineCuts));
await progress('Real offline draft and self-check completed');
await report.eval(decorate, 'Privacy review · original note and local image excluded');
let payload;
await rawShot(report, '04-privacy', async () => {
  await report.scroll('main fieldset');
  await delay(1500);
  await report.click('Include keyboard focus trail', 'fieldset label');
  await delay(3000);
  await report.click('Include keyboard focus trail', 'fieldset label');
  // Use the existing privacy control. The deployed ticket rules currently accept
  // the core shared facts, and this demo does not need environment details.
  const environment = await report.eval(() => [...document.querySelectorAll('fieldset label')]
    .find(el => el.textContent.trim().startsWith('Include coarse browser, OS and settings') &&
      el.querySelector('input[type="checkbox"]')?.checked)?.textContent.trim());
  if (environment) await report.click(environment, 'fieldset label');
  await report.click('View approved shared JSON', 'summary');
  await report.scroll('pre.payload');
  const text = await report.eval(() => document.querySelector('pre.payload').textContent);
  payload = JSON.parse(text);
  if ('environment' in payload.sharedFacts) throw Error('The optional environment sharing toggle must be off.');
  if (/"(?:userNote|regionPng|facts)"\s*:/.test(text)) throw Error('Raw capture leaked into the payload.');
  if (payload.site.origin !== new URL(checkout).origin || payload.draft.barrierType !== 'unnamed-button' ||
      !payload.sharedFacts.ruleHits.some(h => h.ref === payload.draft.targetRef && h.ruleId === 'button-name') ||
      !payload.sharedFacts.elements.some(e => e.ref === payload.draft.targetRef && e.tag === 'button' && !e.accessibleName)) {
    throw Error('The original report was not about the unnamed checkout payment button.');
  }
  await delay(4600);
});

await network(false);
await report.eval(decorate, 'Network: online · real cloud request · edited for time');
await progress('Approved capture payload checked');
let codeAfter, sources;
await rawShot(report, '05-cloud', async () => {
  await progress('Requesting real cloud plan');
  await report.click('Get a fix plan');
  await report.ready('Cloud fix plan ready.');
  rows = await routing();
  if (!rows.some(r => r.step === 'fix-plan' && r.where === 'Cloud' && r.bytes === payload.bytes * (r.note?.includes('Retried once') ? 2 : 1))) {
    throw Error('The cloud routing row did not agree with the approved payload.');
  }
  await highlight();
  await delay(3500);
  const plan = await report.eval(() => {
    const heading = [...document.querySelectorAll('h3')].find(el => el.textContent === 'After');
    return {
      code: heading?.nextElementSibling.textContent,
      sources: [...document.querySelectorAll('.sources a')].map(el => el.href),
    };
  });
  codeAfter = plan?.code;
  sources = plan?.sources;
  if (!codeAfter || !sources?.length) throw Error('The cloud plan did not include codeAfter and retrieved W3C sources.');
  await report.scroll('.sources');
  await delay(5600);
});

await progress('Real cloud plan recorded');
await report.click('Create shareable ticket');
await report.ready('Ticket created.');
const owner = await report.eval(() => {
  const link = document.querySelector('[data-testid="owner-link"]');
  return link && new URL(link.href).pathname;
});
if (!/^\/t\/[A-Za-z0-9]{20}$/.test(owner ?? '')) throw Error('The real Firestore ticket link was missing.');
await report.click('Open owner ticket', 'a');
const ticketStatus = tab => tab.eval(() => document.querySelector('[data-testid="ticket-status"]')?.textContent);
await waitFor(async () => await ticketStatus(report) === 'open', 'open ticket');
await report.eval(decorate, 'Site owner repair desk · real Firestore ticket · link-based access');
await rawShot(report, '06-owner', async () => {
  await delay(4200);
  await report.click('Acknowledge');
  await waitFor(async () => await ticketStatus(report) === 'acknowledged', 'acknowledged ticket');
  await delay(1600);
});

await progress('Real Firestore ticket acknowledged');
const storedCode = await report.eval(() => [...document.querySelectorAll('h3')]
  .find(el => el.textContent === 'After')?.nextElementSibling.textContent);
if (storedCode !== codeAfter) throw Error('Stored codeAfter differed from the cloud plan.');
const applied = await applySuggestedFix(work, storedCode);
await progress('Applied the stored code suggestion');
await page.goto(new URL('/source-diff.html', checkout).href);
await viewport();
await managedShot('06-diff', () => delay(8100));

// Reload the working checkout before asking the reporter to return.
await page.goto(checkout);
await viewport();
if (!await page.getByRole('button', { name: applied.name, exact: true }).count()) {
  throw Error('The owner could not confirm the suggested accessible name after reload.');
}
await viewport(report.sessionId);
await rawShot(report, '06-arm', async () => {
  await report.click('Mark fixed');
  await waitFor(async () => await ticketStatus(report) === 'fixed', 'fixed ticket');
  await report.click('Start reporter re-capture');
  await report.ready('Armed for 30 minutes.');
  await report.ready(verificationDescription);
  await report.scroll('#verify-fixture');
  await delay(3800);
});

let returned;
await page.goto(checkout);
await checkoutView('Patched demo checkout · accessible name: “' + applied.name + '”');
await managedShot('06-recapture', async () => {
  if (!await page.getByRole('button', { name: applied.name, exact: true }).count()) {
    throw Error('Reloaded checkout did not expose the suggested accessible name.');
  }
  await focusPay();
  await delay(2400);
  returned = await capture('Re-checking the repaired payment button.', owner, false);
});
await progress('Extension opened ticket with patched capture');
await viewport(returned.sessionId);
await returned.ready('Re-capture received');
await returned.ready(verificationDescription);

// Read back just the chosen control independently from the extension's pending
// capture. Leave the one-use capture untouched for the app's Verify fix click.
const captureId = await returned.eval(() => new URL(location.href).searchParams.get('capture'));
const workerTarget = await waitFor(async () => (await targets()).find(t =>
  t.type === 'service_worker' && t.url.startsWith('chrome-extension://' + id + '/')
), 'extension service worker');
const worker = await attach(workerTarget.targetId);
const recapture = await worker.eval(async (captureId, reference, checkout) => {
  const key = 'capture:' + captureId;
  const stored = (await chrome.storage.session.get(key))[key]?.facts;
  if (stored?.page.url !== checkout) return null;
  const buttons = stored.elements.filter(el => el.tag === 'button');
  if (buttons.length !== 1 || buttons[0].ref !== reference) return null;
  return {
    ref: buttons[0].ref,
    name: buttons[0].accessibleName,
    targetRules: stored.ruleHits.filter(r => r.ref === reference).map(r => r.ruleId),
  };
}, captureId, payload.draft.targetRef, checkout);
if (recapture?.name !== applied.name || recapture.targetRules.length) {
  throw Error('The patched checkout re-capture did not match the original button and clear its rule hit.');
}

await returned.eval(decorate, 'Reporter re-capture · scoped rule check');
await rawShot(returned, '06-verify', async () => {
  await returned.scroll('#verify-fixture');
  await delay(2400);
  if (await returned.eval(() => document.querySelector('#verify-fixture').value) !== '') {
    throw Error('Verification source did not default to Reporter re-capture.');
  }
  await returned.click('Verify fix');
  await returned.ready('Verification pass: 0 remaining target rule hits.');
  if (await ticketStatus(returned) !== 'verified') throw Error('Ticket did not become verified.');
  await returned.scroll('[data-testid="ticket-status"]');
  await delay(4500);
});

const receipt = {
  originalCapture: { source: 'extension', targetRef: payload.draft.targetRef, accessibleName: '', targetRule: 'button-name' },
  reporterCorrectedDraft,
  routing: rows.filter(r => ['draft', 'self-check', 'fix-plan'].includes(r.step)),
  sources,
  cloudCodeAfter: codeAfter,
  appliedDiff: { before: applied.before, after: applied.after },
  recapture: { source: 'extension', sameCheckout: true, targetRef: recapture.ref, accessibleName: recapture.name, remainingTargetRuleHits: recapture.targetRules.length },
  ticket: { backend: 'Firestore', lifecycle: ['open', 'acknowledged', 'fixed', 'verified'], verificationSource: 'Reporter re-capture', verificationDescription },
};
await writeFile(work + '/hybrid-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
await progress('Real Firestore ticket verified using the patched checkout re-capture');
await taskSpaces.complete('barrierrelay-video', { keep: false });
