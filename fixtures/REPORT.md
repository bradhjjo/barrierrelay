# Gate 0 collector and fixtures report

## Commands and checks

- `npm install` — succeeded; npm audit reports zero vulnerabilities after updating Puppeteer/esbuild.
- `node tools/fixtures/generate.mjs` — generated 10 self-contained synthetic HTML pairs and ground truth.
- `npm run typecheck --workspace=@barrierrelay/collector` — passed.
- `npm test --workspace=@barrierrelay/collector` — passed browser smoke tests for privacy (including referenced textboxes), attribute/URL filtering, digit masking, refs, hidden controls, BBox capture, 40-element and 20-step caps, focus restoration, and both own rules.
- `npm run fixtures:build` — passed repeatedly; validates every facts file and broken/fixed target assertions.
- PNG IHDR check — exactly 20 facts, 20 region PNGs (longest side <=768), and 20 full PNGs (1280x800).

## Capture summary

| Case | Variant | Elements | Rule hits | Target rule IDs |
|---|---|---:|---:|---|
| 01-signup-email-unlabeled | broken | 6 | 1 | label |
| 01-signup-email-unlabeled | fixed | 7 | 0 | — |
| 02-icon-pay-button | broken | 4 | 1 | button-name |
| 02-icon-pay-button | fixed | 4 | 0 | — |
| 03-icon-cart-link | broken | 4 | 1 | link-name |
| 03-icon-cart-link | fixed | 4 | 0 | — |
| 04-placeholder-only-search | broken | 5 | 0 | — |
| 04-placeholder-only-search | fixed | 5 | 0 | — |
| 05-div-continue-not-focusable | broken | 7 | 1 | br-click-not-focusable |
| 05-div-continue-not-focusable | fixed | 7 | 0 | — |
| 06-nav-outline-none | broken | 7 | 3 | br-focus-not-visible |
| 06-nav-outline-none | fixed | 7 | 0 | — |
| 07-modal-keyboard-trap | broken | 7 | 0 | — |
| 07-modal-keyboard-trap | fixed | 2 | 0 | — |
| 08-image-link-empty-alt | broken | 4 | 1 | link-name |
| 08-image-link-empty-alt | fixed | 4 | 0 | — |
| 09-custom-toggle-div | broken | 3 | 1 | br-click-not-focusable |
| 09-custom-toggle-div | fixed | 3 | 0 | — |
| 10-datepicker-icon-button | broken | 5 | 1 | button-name |
| 10-datepicker-icon-button | fixed | 5 | 0 | — |

## Findings

Axe does not flag the broken target for 04-placeholder-only-search, 05-div-continue-not-focusable, 06-nav-outline-none, 07-modal-keyboard-trap, or 09-custom-toggle-div. Cases 05/09 have br-click-not-focusable, case 06 has br-focus-not-visible, and cases 04/07 retain target focus-trail evidence; the broken modal cycles e6/e7/e5 and Escape leaves focus at target e5. All ten fixed pages have zero rule hits overall. Every broken target ref exists in its matching elements list and has rule or focus-trail evidence.

No AI calls, real personal data, commits, unrelated Chrome profiles, or unrelated Chrome processes were used. No failures outside owned files were encountered. No remaining implementation blockers; limitations of focus-style heuristics and capture timestamps/ports are documented in the collector and fixture READMEs.
