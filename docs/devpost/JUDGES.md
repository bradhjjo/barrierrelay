# BarrierRelay — judge testing instructions

**Start here:** https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken

No extension installation, login form, payment, or private credentials are needed for this hosted fixture. Firebase signs in anonymously. Use synthetic data only: this prototype is not a secure place for personal reports. Cloud planning and ticket operations need Internet access and available project quota.

These instructions match the [README](../../README.md), [UI labels](../../apps/web/src/ui/App.tsx), and [extension guide](../../extension/README.md). Source: https://github.com/bradhjjo/barrierrelay — the representative must make this repository public before submission.

## A. Fast path without Gemini Nano

1. Open the start link above. The synthetic payment control has no accessible name. The fixture is a demonstration, not a real checkout.
2. Choose **Create private draft**. If the local model is unavailable, the report is labeled **Rules-only draft (no on-device AI available)**. In **Hybrid routing**, this is **Local code**, not On-device AI. Raw capture is not silently sent to cloud as a fallback.
3. Review/edit **Barrier type**, **Target element**, **Summary**, **Expected**, **Actual**, and **Steps to reproduce**. Expected type: `unnamed-button`. AI wording can be wrong; review is part of the product.
4. Select **Run self-check**. With no model, deterministic checks still run; do not interpret this as an AI consistency check. If you edit the draft, re-run self-check.
5. Under **3. What leaves your device**, inspect **Live shared JSON preview**. Optional page path, visible text, and keyboard focus trail are off by default. The raw PNG and original free-text note are not part of the sharing payload. Pattern-based scrubbing cannot guarantee that every personal detail is removed.
6. Select **Get a fix plan**. This makes a **real cloud Firebase AI Logic** request unless you deliberately use `demo=1`. Expect repair guidance, illustrative before/after code, a verification checklist, and returned sources when URL context succeeds. Missing sources are not invented. Latency varies; quota/network/model errors remain visible.
7. Inspect **Hybrid routing**: local rules show **Local code**, fix planning shows **Cloud** with nonzero approved-payload bytes. The counts exclude request envelopes, fixed prompt instructions, Auth/App Check, transport overhead and ticket writes; they are **not total network bytes**.
8. Choose **Create shareable ticket**, then **Open owner ticket**. This writes a real Firestore ticket. The link is bearer-like, not proof of site ownership: anyone anonymously signed in with the ID can read it and advance allowed status transitions.
9. In **Site owner repair desk**, choose **Acknowledge**, then **Mark fixed**. Select **02-icon-pay-button** under **Verification source**, then **Verify fix**. The paired synthetic fixed-fixture check should report **Verification pass: 0 remaining target rule hits** and `verified` status. This is not a live-site repair or WCAG certification. A failed check returns the ticket to `open`.

Verification pass/fail is computed in the browser and written by the client. For verification, Firestore rules constrain status transitions and the submitted result shape, including no remaining target rule hits for `pass`; they do not independently run the check. Anyone signed in anonymously with the ticket link can change status through allowed transitions. `verified` is a client-reported, scoped check, not tamper-proof proof of a fix or WCAG conformance.

If Nano is already available, this same URL will use the real local AI path instead. To observe the no-model path, use an unsupported browser or a separate temporary Chrome profile without Nano; do not remove a user's installed model. Unsupported browsers retain the rules-only workflow, not a promise that every browser feature is supported.

## B. Real on-device path with Gemini Nano

1. Use supported **desktop Chrome**, HTTPS/loopback, eligible hardware/disk, and Prompt API support for text/image/structured output. Chrome feature availability depends on browser build and profile. Consult [Chrome requirements](https://developer.chrome.com/docs/ai/get-started) and [Firebase hybrid inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference?platform=web).
2. Use an **unmetered connection**. From the [home page](https://barrierrelay-lpun3.web.app/) or report page, click **Prepare private on-device AI**. This explicit button gesture calls Firebase AI Logic's `initializeDeviceModel()`; merely opening a page does not download the model. Do not force a large download over someone else's hotspot.
3. Wait for **Status: available**, then open the start fixture and choose **Create private draft**. Check the **On-device draft** label and the **On-device** routing entry with **0 Cloud bytes**. A rules-only badge or an error is not proof of Nano inference.
4. Choose **Run self-check**. With a working model, routing includes deterministic local checks and an additional on-device consistency check. Continue with payload review, cloud planning, and ticket sharing as in A.
5. Optional offline test: first prepare the model and load the app/capture online. Disable networking in that **already-open tab**, then draft. Restore networking before cloud planning or ticket writes. There is no offline app-shell service worker: fresh offline navigation, model downloads, Firebase startup, and Firestore are not promised offline. Zero AI requests does not mean zero browser traffic.

### Experimental Chrome profile / flags

The project's recorded development environment used Chrome 158. If your build exposes them, enable **Prompt API** and **Prompt API Multimodal Input** at `chrome://flags`. Names/availability can change. The project's tested development arguments are below, copied from the README; these do not guarantee model/hardware eligibility.

With a **dedicated experimental profile closed**, this Linux example opens the hosted app:

```sh
/opt/google/chrome/chrome \
  --user-data-dir="$HOME/.cache/barrierrelay/chrome-nano" \
  --enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,OptimizationGuideManifestBroker,OptimizationGuideModelExecution,OptimizationGuideModelDownloading,OptimizationHints,AIPromptAPI,AIPromptAPIMultimodalInput,AIPromptAPIStructuredOutput,AIPromptAPILegacyParams,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput \
  --no-first-run --no-default-browser-check \
  https://barrierrelay-lpun3.web.app/
```

Use your own Chrome executable path on other systems. Do not kill/reuse an unrelated Chrome profile, and do not run the standalone Nano runner concurrently against this profile. Experimental flags are optional troubleshooting, not required for the rules-only route. See [Gate 0 notes](../../gate0/NANO_NOTES.md#reusable-runner).

## C. Optional: install and test the real Chrome extension

Once the repository is public, clone it and run these commands from its root with Node.js/npm installed:

```sh
git clone https://github.com/bradhjjo/barrierrelay.git
cd barrierrelay
npm install
npm --prefix extension run build
```

1. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist/`.
2. In the extension's options, select **https://barrierrelay-lpun3.web.app** as the destination. Authorized local alternatives are `http://127.0.0.1:5173` (development) and `http://127.0.0.1:4173` (preview). No other origins can retrieve captures. The stable unpacked extension ID is `ehiihcegnfekjkifcjmebdgiijpepdkp`.
3. Open the [broken checkout page](https://barrierrelay-lpun3.web.app/fixtures/pairs/02-icon-pay-button/broken.html) and **reload it after installing** so navigation-key recording starts. This page uses synthetic demonstration data, not real payment details.
4. Use Tab to reach the unnamed arrow/payment button. Press **Alt+Shift+B**, or use the extension toolbar action if the shortcut conflicts. In the dialog, enter a non-sensitive goal such as “Complete the sample checkout” and choose the relevant assistive context. Submit the capture.
5. The web app opens with a one-time capture handoff. Confirm that the captured control/focus context arrived, then follow A or B. The extension itself does not upload the page. A screenshot could visibly contain sensitive data, so use only synthetic pages.
6. For a live repair re-check, open the ticket at `/t/<id>` and choose **Start reporter re-capture**. Wait for **Armed for 30 minutes**, return to the repaired page, focus the **same control**, and submit an extension capture within that window. The next capture opens `/t/<id>?capture=…&ext=…`; select **Reporter re-capture** under **Verification source**, then **Verify fix** after the ticket is marked `fixed`. The return target is single-use; later captures open a new report unless armed again. Live matching is limited by capture-local refs and rules; the synthetic fixture path is more reproducible for this demonstration and is explicitly labeled synthetic.

Browser UI/restricted pages and cross-origin frames are not covered. The HTTP/HTTPS content script has broad page access for pre-capture navigation recording; Chrome's site-access warning is meaningful. Read [permissions and limitations](../../extension/README.md).

## D. Fixture links and deterministic walkthrough

| Purpose | Link |
| --- | --- |
| Standard hybrid/rules path — unnamed payment button | https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken |
| Paired fixed capture for comparison | https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=fixed |
| Unlabeled signup email | https://barrierrelay-lpun3.web.app/report?fixture=01-signup-email-unlabeled&variant=broken |
| Empty-name cart link | https://barrierrelay-lpun3.web.app/report?fixture=03-icon-cart-link&variant=broken |
| Keyboard-unreachable Continue control | https://barrierrelay-lpun3.web.app/report?fixture=05-div-continue-not-focusable&variant=broken |
| All available synthetic cases | https://barrierrelay-lpun3.web.app/ |
| Deterministic UI walkthrough | https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken&demo=1 |

**`demo=1` uses no AI at all, including no cloud AI.** It still initializes Firebase and writes **real Firestore tickets** if you choose to share. It is a workflow demonstration, not evidence of Nano, URL context, or hybrid inference. Standard fixture links above do not enable this substitute.

## E. Troubleshooting / source verification

- **Nano unavailable:** use the clearly labeled rules path; supported Chrome, model preparation, hardware/disk, and unmetered connectivity are separate checks. Native-model generation can also fail despite earlier availability; errors are not a hidden cloud fallback.
- **Cloud error or missing plan:** restore networking and inspect the visible error. Cloud 5xx retries at most once; validation/4xx/quota errors do not retry. The client budget defaults to five cloud calls per browser tab session (`sessionStorage`); not a global quota guarantee. If storage is unavailable, an in-memory budget remains. A synthetic `demo=1` plan must not be represented as a successful real call.
- **App Check:** hosted production uses reCAPTCHA Enterprise; judges should not receive or enter debug tokens. Do not disable enforcement for judging. Local development configuration is in the README; never copy a developer's ignored token file.
- **Ticket status:** Acknowledge is enabled only for `open`; Mark fixed for `acknowledged`; Verify fix for `fixed`. Fixed-fixture verification requires the associated case. Anonymous identity depends on browser storage; existing links remain bearer-like and are not owner-authenticated.
- **Keyboard/screen reader:** use Tab/Shift+Tab, Enter/Space, Escape/Close, labels and status messages. Automated tests are not evidence of a completed disability-led usability study; that study remains future work.
- **Reproduce evidence:** README documents `tools/e2e/extension.e2e.mjs` (isolated extension), `integration.e2e.mjs` (real app, no model), `web.e2e.mjs` (AI substitute, real tickets), and `real.e2e.mjs` (real local/cloud calls and tickets). Run only with your own local configuration and exclusive use of a model profile. Publicly retained outputs may differ from ignored local artifacts.

The gallery contains cropped **real test screenshots**, with actual routing values. The hybrid-routing crops `gallery/05-hybrid-routing.png` and `cover.png`, sourced from `real-10-owner-verified.png` as listed in the [gallery provenance](gallery/README.md), and the published [receipt](../evidence/real-results.json) show the same values — 10,991 ms on-device draft, 704 ms on-device check, 10,176 ms / 1,892 cloud payload bytes — so those routing screenshots describe that recorded run, not a latency guarantee. This does not cover the whole gallery: `01-capture.png` comes from a separate model-free integration run. Bytes are approved application payload accounting, not total network traffic. For a sourced summary of these measurements, see [the impact note](../IMPACT.md).
