# Firebase hybrid probe

Run `npm ci` and `npm run dev` in this directory, then open the printed localhost URL in a Chrome profile with Prompt API enabled. Click **Initialize and run probes**; it runs text, generated red PNG, and structured JSON sequentially. `window.probeResults` contains the results; `window.hybridExports` contains the actual runtime enums.

The app uses only a fake API key and project ID `barrierrelay-probe`. Set DevTools Network to Offline **after the page loads** to verify local inference without any network. Never use the fake configuration to send prompts to a real service.

Structured configuration supplies `inCloudParams.generationConfig.responseMimeType` and `responseSchema` built with `Schema`, and also `onDeviceParams.promptOptions.responseConstraint`. Firebase 13.4.0 does not translate cloud generationConfig into Prompt API constraints; the local constraint must be supplied separately. `window.probeFallback()` is intended for an automated test with fetch intercepted, because PREFER_ON_DEVICE falls back to cloud when local availability is not `available`.

See `../NANO_NOTES.md` for measured results and limitations.

To reproduce the unavailable-model results without a download, start Vite on port 5179, then run `node gate0/sdk-probe/verify-unavailable.mjs` from the repo root. It stubs only the native API availability and intercepts fetch; all Firebase routing and error handling use the installed SDK.
