# Synthetic BarrierRelay fixtures

Ten self-contained e-commerce/SaaS broken/fixed pairs. All names, emails, addresses, and payment details are fake; no real accounts or transactions are involved.

```sh
npm install
npm run fixtures:build
```

Requires Chrome at `/opt/google/chrome/chrome`. The capture command builds the collector, starts a loopback-only HTTP server, and launches its own headless Chrome with a throwaway `barrierrelay-fixtures-*` profile under `os.tmpdir()`. It closes only its own browser and removes that profile in `finally`.

Each variant has source HTML, contract-shaped ground truth, captured facts, a viewport PNG (1280×800), and a padded region PNG (16 CSS px padding; longest output side at most 768 px). `index.json` lists the relative artifact paths. `build-summary.json` contains the printed capture summary. Facts contain wall-clock timestamps and loopback server ports; otherwise collection and fixture definitions are deterministic for a given Chrome version.

Capture sends 12 actual Tab keys and, for case 07, one Escape key. DOM handles are retained locally during keypresses and mapped to the final capture's refs. This matters when Escape closes the fixed dialog: focus on the now-hidden controls becomes null/outside-region, rather than being incorrectly assigned another element's ref. The broken modal repeats three focus stops and ignores Escape; the fixed modal permits departure and closes with Escape.

Every run validates required CaptureFacts fields, sizes, allowlisted attributes, URL/text privacy, ref consistency, broken-target evidence, and absence of rule hits at each fixed target. Ground-truth target refs are resolved from the fixture-only `data-target` marker, which never appears in facts; fixed truth always has `barrierType: 'none'` and `targetRef: null`.

Axe does not detect every barrier: placeholder-only search (04), custom clickable controls (05/09), missing focus indication (06), and the keyboard trap (07) rely on their accessible names, own `br-*` rules, and/or focus-trail evidence. This is intentional, not a claim that a passing axe run implies accessibility.

To regenerate source fixture definitions explicitly:

```sh
node tools/fixtures/generate.mjs
npm run fixtures:build
```

The generator resets truth refs, so always follow it with capture. The fixed pages change only the relevant label, semantics, focus CSS, or keyboard behavior; case 07's fixed screenshot shows the page after Escape dismisses the offer.
