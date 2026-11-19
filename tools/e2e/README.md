# Extension integration test

From the repository root, run:

```sh
npm --prefix extension run build
node tools/e2e/extension.e2e.mjs
```

Requires the installed root dependencies (`puppeteer-core`) and Chrome at `/opt/google/chrome/chrome`. Default mode is new headless; set `HEADFUL=1` to display the dedicated test window. A temporary profile is removed after completion. The test starts a local fixture server and a loopback-only proxy; the proxy serves a minimal `/report` intake stub at `http://127.0.0.1:5173` without binding that port or touching a running Vite server. All non-fixture/non-report proxy requests are blocked.

Chrome 158 loads the unpacked extension through CDP `Extensions.loadUnpacked` (legacy `--load-extension` is disabled in branded Chrome). CDP `Extensions.triggerAction` uses a `tab` target ID and grants `activeTab` like a user toolbar click; synthetic shortcut events do not. The test navigates to fixture 02, Tabs to its unnamed button, checks the accessible panel's focus wrap and Escape restoration, submits a note, and verifies the new web-origin URL, target facts, last-key replay, ≤768-pixel PNG, and single-use capture retrieval. A successful run prints the captured target summary and exits zero. It requires no Firebase, Nano model, or app UI.

## Real hybrid application E2E

```sh
node tools/e2e/real.e2e.mjs
# Temporarily tolerate only the known Google Search grounding quota/429 failure:
node tools/e2e/real.e2e.mjs --allow-cloud-fail
```

Requires the downloaded Nano model in `~/.cache/barrierrelay/chrome-nano`, Chrome at `/opt/google/chrome/chrome`, the installed workspace dependencies, and the local Firebase web configuration plus App Check debug configuration. Never open, print, or copy the secret debug-token environment file. Vite loads it automatically.

This runner exclusively borrows the Nano profile and closes its Chrome process in `finally`; do not run another Nano probe or Chrome instance against that profile concurrently. It reuses `profilePath`, `features`, and `ignoreDefaultArgs: true` from `tools/nano/run.mjs`. It reuses an existing Vite server on port 5173 or starts and stops its own. Set `NANO_HEADFUL=1` for a visible run or `REAL_E2E_TIMEOUT_MS` to change the per-action timeout (default 240000).

No demo pipeline, SDK stubs, or model mocks are used. The runner prepares Nano with a trusted CDP click, disconnects the page using `Network.emulateNetworkConditions`, and requires an **On-device / Offline** draft routing row with zero cloud bytes and no AI network request. It reconnects, runs self-check, verifies that the default JSON preview excludes `userNote` and `visibleText`, requires a real grounded cloud plan with title-and-URL source links and positive cloud bytes, then creates a real `[e2e]` Firestore ticket and advances it through acknowledged → fixed → verified using the synthetic fixed fixture.

Screenshots are `tools/e2e/out/real-*.png`; `real-results.json` records inference locations, routing timings, cloud bytes, offline proof, sources, ticket ID, and any exact failure plus its application code path. `--allow-cloud-fail` exits zero **only** for a Google Search/grounding quota 429 after the offline proof succeeds; `completed: false` and `cloudFailureExpected: true` explicitly distinguish that partial result from a full repair loop. Other failures always exit nonzero. A successful run writes one real ticket; do not repeatedly run it unnecessarily.
