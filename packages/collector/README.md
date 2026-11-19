# @barrierrelay/collector

Deterministic browser-only capture, shared by extension content scripts and Puppeteer. No AI, storage, network requests, HTML serialization, or live form-value reads in collector code.

```sh
npm run build --workspace=@barrierrelay/collector
npm run typecheck --workspace=@barrierrelay/collector
npm test --workspace=@barrierrelay/collector
```

`dist/collector.js` is an esbuild IIFE exposing `window.BarrierRelayCollector` (load in the page or the extension content script's isolated world):

```js
const region = document.querySelector('main');
const refs = window.BarrierRelayCollector.getElementRefs(region); // Map<string, Element>, ephemeral
const reverse = new Map([...refs].map(([ref, element]) => [element, ref]));
// Record keyboard steps outside the collector using reverse.get(document.activeElement).
const facts = await window.BarrierRelayCollector.collect(region, {
  userNote: "I can't tell what the last button does.",
  assistive: ['screen-reader'],
  focusTrail: [],
});
```

Both functions accept either an Element or a viewport-relative `{x,y,w,h}` region. Element refs are DOM-ordered, limited to 40, and stable while the DOM/region stays unchanged. Handles are never attached to facts. Axe runs on the supplied Element; for a bounding box it runs on the body and retains only mapped elements intersecting the box.

Privacy rules: allowlisted attributes only; HTTP(S) URLs reduced to origin + pathname; digit-masked visible text; no control values or axe HTML/selector/failure-summary strings. Accessible names use MIT `dom-accessibility-api` against an inert, value-cleared DOM snapshot with styles from the original page, preventing embedded/referenced textbox values from entering names. No snapshot is serialized. Axe's dependencies may internally inspect controls; only its static rule ID/help text and virtual refs are emitted.

`br-click-not-focusable` detects pointer + click-handler hints without Tab reachability. `br-focus-not-visible` compares focused/unfocused computed outline, box-shadow, and border. These are heuristics, not complete WCAG judgments. Focus probes can fire page focus/blur listeners; the collector restores the previously active element and viewport scroll. Focus styles implemented with backgrounds, transforms, or delayed transitions may need manual review. Keyboard traps are demonstrated by externally recorded real keypresses, not inferred by axe.

Dependencies: `dom-accessibility-api` (MIT), `axe-core` (MPL-2.0). The browser bundle retains upstream license notices.
