# Extension integration test

From the repository root, run:

```sh
npm --prefix extension run build
node tools/e2e/extension.e2e.mjs
```

Requires the installed root dependencies (`puppeteer-core`) and Chrome at `/opt/google/chrome/chrome`. Default mode is new headless; set `HEADFUL=1` to display the dedicated test window. A temporary profile is removed after completion. The test starts a local fixture server and a loopback-only proxy; the proxy serves a minimal `/report` intake stub at `http://127.0.0.1:5173` without binding that port or touching a running Vite server. All non-fixture/non-report proxy requests are blocked.

Chrome 158 loads the unpacked extension through CDP `Extensions.loadUnpacked` (legacy `--load-extension` is disabled in branded Chrome). CDP `Extensions.triggerAction` uses a `tab` target ID and grants `activeTab` like a user toolbar click; synthetic shortcut events do not. The test navigates to fixture 02, Tabs to its unnamed button, checks the accessible panel's focus wrap and Escape restoration, submits a note, and verifies the new web-origin URL, target facts, last-key replay, ≤768-pixel PNG, and single-use capture retrieval. A successful run prints the captured target summary and exits zero. It requires no Firebase, Nano model, or app UI.
