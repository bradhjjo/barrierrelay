import { collect, getElementRefs, type BBox, type AssistiveContext, type FocusStep } from '../../packages/collector/src/index';
declare const chrome: any;
const marker = '__barrierRelayInstalled';
if (!(globalThis as any)[marker]) {
  (globalThis as any)[marker] = true;
  install();
}
function install() {
  const trail: { key: FocusStep['key']; target: Element | null }[] = [];
  let host: HTMLElement | null = null;
  let recording = true;
  let pendingStep: { key: FocusStep['key']; target: Element | null } | null = null;
  document.addEventListener('focusin', () => { if (recording && pendingStep) pendingStep.target = document.activeElement; }, true);
  document.addEventListener('keydown', event => {
    if (!recording || host?.contains(event.target as Node)) return;
    const key = event.key === 'Tab' ? (event.shiftKey ? 'Shift+Tab' : 'Tab') : event.key === ' ' ? 'Space' : event.key;
    if (!['Tab', 'Shift+Tab', 'Enter', 'Space', 'Escape'].includes(key)) return;
    // Capture focus transitions during the key's default action, not typed values.
    const step = { key: key as FocusStep['key'], target: document.activeElement };
    trail.push(step); if (trail.length > 20) trail.shift();
    pendingStep = step;
    setTimeout(() => { if (pendingStep === step) pendingStep = null; }, 0);
  }, true);
  chrome.runtime.onMessage.addListener((message: any) => {
    if (message?.type === 'startCapture' && !host) openPanel();
  });
  function clipped(r: BBox, center?: Element | null): BBox {
    const focus = center?.getBoundingClientRect();
    const w = Math.max(1, Math.min(r.w, 1000, innerWidth));
    const h = Math.max(1, Math.min(r.h, 700, innerHeight));
    let x = r.x, y = r.y;
    if (focus && r.w > w) x = focus.x + focus.width / 2 - w / 2;
    if (focus && r.h > h) y = focus.y + focus.height / 2 - h / 2;
    return { x: Math.max(0, Math.min(x, innerWidth - w)), y: Math.max(0, Math.min(y, innerHeight - h)), w, h };
  }
  function regionFor(el: Element | null): BBox {
    const landmark = el?.closest('form,dialog,[role="dialog"],nav,main section,main,aside,header,footer,[role="main"],[role="navigation"],[role="region"],[role="banner"],[role="complementary"],[role="contentinfo"],[role="search"],[role="form"]');
    const r = (landmark || el)?.getBoundingClientRect();
    if (landmark && r && r.width > 0 && r.height > 0) return clipped({ x: r.x, y: r.y, w: r.width, h: r.height }, el);
    return clipped({ x: (r?.x || 0) + (r?.width || 0) / 2 - 300, y: (r?.y || 0) + (r?.height || 0) / 2 - 200, w: 600, h: 400 });
  }
  function openPanel() {
    const previous = document.activeElement;
    let region = regionFor(previous);
    const savedTrail = [...trail];
    recording = false;
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial;font:16px/1.5 system-ui;color:#111}*{box-sizing:border-box}
      .backdrop{position:absolute;inset:0;background:#0008;display:grid;place-items:center}
      [role=dialog]{background:#fff;padding:24px;border:3px solid #174b85;border-radius:10px;width:min(560px,95vw);max-height:95vh;overflow:auto}
      h1{font-size:24px;margin-top:0}textarea{width:100%;font:inherit;display:block;min-height:90px}button{font:inherit;padding:10px;margin:8px 8px 0 0}label{display:block;margin:8px 0}fieldset{margin:12px 0}input{margin-right:8px}:focus-visible{outline:3px solid #005fcc;outline-offset:3px}.status{min-height:24px}
    </style><div class="backdrop"><section role="dialog" aria-modal="true" aria-labelledby="title" aria-describedby="privacy">
    <h1 id="title">Capture an accessibility barrier</h1><p id="privacy">Page facts and a screenshot stay in this browser until you review them in BarrierRelay. Typed field values are not recorded. The screenshot may contain personal information.</p>
    <form><label for="note">What were you trying to do?</label><textarea id="note" maxlength="300"></textarea>
    <fieldset><legend>Assistive context</legend>${[['screen-reader','Screen reader'],['keyboard-only','Keyboard only'],['voice-control','Voice control'],['low-vision','Low vision'],['switch-access','Switch access']].map(([value,label]) => `<label><input type="checkbox" name="assistive" value="${value}">${label}</label>`).join('')}</fieldset>
    <label><input type="checkbox" id="replay" checked>Replay my last keys (up to 20 navigation steps; no typed text)</label>
    <button type="button" id="pick">Pick an element instead</button><button type="submit">Capture and open report</button><button type="button" id="close">Close</button>
    <p role="status" aria-live="polite" class="status"></p></form></section></div>`;
    document.documentElement.append(host);
    const panelHost = host;
    const note = shadow.querySelector('textarea')!;
    const status = shadow.querySelector('[role=status]')!;
    const close = () => {
      document.removeEventListener('focusin', keepFocus);
      panelHost.remove(); host = null; recording = true;
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== 'Tab') return;
      const stops = [...shadow.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input')];
      const first = stops[0], last = stops[stops.length - 1];
      if (event.shiftKey && shadow.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && shadow.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    shadow.addEventListener('keydown', keyboard);
    // Keep page scripts from moving focus out of the modal.
    const keepFocus = (event: FocusEvent) => { if (host === panelHost && !panelHost.hidden && event.target !== panelHost) note.focus(); };
    document.addEventListener('focusin', keepFocus);
    shadow.querySelector('#close')!.addEventListener('click', close);
    shadow.querySelector('#pick')!.addEventListener('click', () => {
      panelHost.hidden = true;
      const outline = document.createElement('div');
      outline.style.cssText = 'position:fixed;pointer-events:none;border:4px solid #005fcc;z-index:2147483646;background:#005fcc22;';
      document.documentElement.append(outline);
      const hint = document.createElement('div');
      hint.textContent = 'Click an element to capture. Press Escape to cancel.';
      hint.style.cssText = 'position:fixed;top:0;left:0;background:white;color:black;padding:12px;z-index:2147483647;pointer-events:none;font:18px system-ui';
      document.documentElement.append(hint);
      const move = (e: MouseEvent) => { const r = (e.target as Element).getBoundingClientRect(); Object.assign(outline.style, { left: r.x+'px', top:r.y+'px', width:r.width+'px', height:r.height+'px' }); };
      const finish = () => { outline.remove(); hint.remove(); document.removeEventListener('mousemove', move, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', cancel, true); panelHost.hidden = false; note.focus(); };
      const pick = (e: MouseEvent) => { e.preventDefault(); e.stopImmediatePropagation(); const r = (e.target as Element).getBoundingClientRect(); region = clipped({ x:r.x,y:r.y,w:r.width,h:r.height }); finish(); status.textContent = 'Element selected. Ready to capture.'; };
      const cancel = (e: KeyboardEvent) => { if(e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(); status.textContent = 'Element selection cancelled.'; } };
      document.addEventListener('mousemove', move, true); document.addEventListener('click', pick, true); document.addEventListener('keydown', cancel, true);
    });
    shadow.querySelector('form')!.addEventListener('submit', async event => {
      event.preventDefault();
      status.textContent = 'Collecting page facts and screenshot…';
      const button = shadow.querySelector<HTMLButtonElement>('button[type=submit]')!;
      button.disabled = true;
      const assistive = [...shadow.querySelectorAll<HTMLInputElement>('input[name=assistive]:checked')].map(el => el.value as AssistiveContext);
      const replay = shadow.querySelector<HTMLInputElement>('#replay')!.checked;
      panelHost.hidden = true;
      try {
        // Remove the entire extension UI from the light DOM while collecting.
        panelHost.remove();
        const reverse = new Map([...getElementRefs(region)].map(([ref, el]) => [el, ref]));
        const focusTrail = replay ? savedTrail.map((step,index) => ({ index, key:step.key, ref: step.target ? reverse.get(step.target) || null : null })) : [];
        const facts = await collect(region, { userNote: note.value, assistive, focusTrail });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const response = await chrome.runtime.sendMessage({ type:'capture', facts });
        if (!response?.ok) throw new Error(response?.error || 'Capture failed.');
        close();
      } catch (error) {
        document.documentElement.append(panelHost); panelHost.hidden = false;
        status.textContent = `Capture failed: ${(error as Error).message}. Try again.`;
        button.disabled = false; button.focus();
      }
    });
    note.focus();
  }
}
