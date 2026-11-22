# BarrierRelay UI accessibility audit

Run: `node tools/e2e/a11y-audit.mjs`. Builds the web workspace, uses strict preview port 4174 and a fresh temporary headless Chrome profile, then removes it. No app code is changed. Exit code: **0** (serious/critical axe violations gate the exit).

## Scope and results

Real rules-only pipeline without Nano; no fix-plan request or ticket creation. Auth/App Check/Remote Config may initialize over the network; cloud generation and Firestore requests are intercepted and aborted using the integration E2E guard. Blocked attempts: **1**.

| State | Axe critical / serious / moderate / minor | Unique Tab stops / expected | Unnamed AX controls | Missing focus indicators | Keyboard trap |
|---|---|---|---|---|---|
| home | 0 / 0 / 0 / 0 | 16/16 | 0 | 0 | none observed |
| report-loaded | 0 / 0 / 0 / 0 | 7/7 | 0 | 0 | none observed |
| private-draft | 0 / 0 / 0 / 0 | 20/20 | 0 | 0 | none observed |
| self-check | 0 / 0 / 0 / 0 | 21/21 | 0 | 0 | none observed |
| share-review-expanded | 0 / 0 / 0 / 0 | 22/22 | 0 | 0 | none observed |
| mine | 0 / 0 / 0 / 0 | 5/5 | 0 | 0 | none observed |

Self-check and share review are the same UI render; the latter additionally opens “View approved shared JSON” using Enter. Every state includes a full forward and reverse Tab traversal, computed outline/box-shadow checks, and a Puppeteer accessibility-tree snapshot of buttons, inputs, links and disclosure controls. Disabled/hidden controls are excluded from Tab expectations; accessible-name checks include disabled controls. Readiness and self-check messages were also checked for live-region ancestry (see raw statusCheck); other status/alert regions are inventoried. Full focus order (role and accessible name), reverse order, live-region text and axe incomplete checks are in [raw evidence](evidence/a11y-audit.json).

## Findings for coordinator

No WCAG-tagged axe violations found in the tested states.

## Limits

- Automated checks find only a subset of accessibility issues; **no real screen-reader user was tested**, and no screen-reader speech or announcement timing was verified. This is not a user study or WCAG conformance claim.
- Focus visibility is a computed-style heuristic, not a visual contrast/occlusion assessment. A complete forward/reverse cycle found no trap only in these static states; controls were not all activated.
- Status/alert/live-region semantics are recorded in JSON; dynamic announcement behavior remains untested. Axe incomplete results need manual review.
- Not covered: demo=1 replaces AI only; owner tickets still require Firestore (apps/web/src/services.ts and ui/App.tsx).
- Mine is the empty/error-safe view with Firestore blocked, not a populated authenticated ticket list. Transient busy/error states, mobile layouts, extension UI, fixture pages themselves, cloud fix plans and populated owner desks are outside scope.
- No local profile paths, authentication tokens, screenshots or environment files are included in evidence.
