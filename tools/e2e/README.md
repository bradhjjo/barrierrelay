# Extension integration test

From the repository root, run:

```sh
npm --prefix extension run build
node tools/e2e/extension.e2e.mjs
```

Requires the installed root dependencies (`puppeteer-core`) and Chrome at `/opt/google/chrome/chrome`. Default mode is new headless; set `HEADFUL=1` to display the dedicated test window. A temporary profile is removed after completion. The test starts a local fixture server and a loopback-only proxy; the proxy serves a minimal `/report` intake stub at `http://127.0.0.1:5173` without binding that port or touching a running Vite server. All non-fixture/non-report proxy requests are blocked.

Chrome 158 loads the unpacked extension through CDP `Extensions.loadUnpacked` (legacy `--load-extension` is disabled in branded Chrome). CDP `Extensions.triggerAction` uses a `tab` target ID and grants `activeTab` like a user toolbar click; synthetic shortcut events do not. The test navigates to fixture 02, Tabs to its unnamed button, checks the accessible panel's focus wrap and Escape restoration, submits a note, and verifies the new web-origin URL, target facts, last-key replay, ≤768-pixel PNG, and single-use capture retrieval. A successful run prints the captured target summary and exits zero. It requires no Firebase, Nano model, or app UI.

## Extension → real production web app

From the repository root:

```sh
node tools/e2e/integration.e2e.mjs
```

This test builds the actual web app with `npm run build --workspace=@barrierrelay/web`, builds `extension/dist`, and starts its own Vite preview at **http://127.0.0.1:4173** using `--strictPort`. It never binds or reuses ports 5173/5174. Port 4173 must be free; an existing process is never stopped or reused. The preview process group and a fresh temporary Chrome profile are removed after the run; the shared Nano profile at `~/.cache/barrierrelay/chrome-nano` is never touched.

The unpacked extension is loaded with CDP. Its real options page is used to save the preview origin into `chrome.storage.local`; both the extension destination allowlist and `externally_connectable` include this loopback preview origin. The test opens the copied fixture 02 broken checkout in that real preview server, Tabs to the unnamed payment button, invokes the real toolbar action, enters a synthetic private note, and submits the capture. **No proxy, report stub, `demo=1`, model mocks, or UI substitute is used.**

Assertions cover the real app's one-time capture intake, the unnamed-button facts in step 1, a locally rendered region PNG, the genuine **Rules-only draft** fallback in the model-free profile, `unnamed-button` as the draft barrier type, a passing local self-check, and a shared JSON preview that excludes the original user note/raw capture/image. Optional focus-trail sharing must default off. The test stops at privacy review: it never clicks **Get a fix plan** or creates a ticket. It blocks and fails on cloud-generation or Firestore requests; normal Firebase Auth, reCAPTCHA/App Check initialization, and Remote Config may still use the network. Production builds read public Firebase configuration from `.env.local`, not the secret development-only debug-token file.

Successful runs print an integration summary and save these synthetic-data screenshots:

- `tools/e2e/out/integration-capture.png`
- `tools/e2e/out/integration-rules-only.png`
- `tools/e2e/out/integration-privacy.png`

A failure after report creation also saves `integration-failure.png` when possible. Set `HEADFUL=1` to watch the dedicated Chrome window. This verifies extension-to-app compatibility and the local fallback/privacy boundary, **not real Nano inference, cloud grounding, or Firestore persistence**.

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
