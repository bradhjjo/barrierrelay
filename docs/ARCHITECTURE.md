# BarrierRelay architecture and trust boundaries

This document describes the current implementation, not an intended production architecture. Source-of-truth contracts are [schema.ts](../packages/shared/src/schema.ts) and [contracts.ts](../apps/web/src/contracts.ts). Component ownership and product intent are in [PROJECT.md](PROJECT.md).

## Data flow and inference policy

| Stage | Input → output | Execution / `InferenceMode` | Implementation |
| --- | --- | --- | --- |
| Capture | Focused region + optional goal/context → `CaptureFacts` and region PNG | Local code / `n/a` | [content script](../extension/src/content.ts), [collector](../packages/collector/src/index.ts) |
| Handoff | Session bundle → app `CaptureBundle` | Local extension messaging / `n/a` | [service worker](../extension/src/background.ts), [intake](../apps/web/src/capture/intake.ts) |
| Readiness / preparation | Browser availability + user action → model readiness | Browser API probe; Firebase model `initializeDeviceModel()` | [pipeline](../apps/web/src/ai/pipeline.ts) |
| Draft | Raw facts as JSON + optional PNG → `BarrierDraft` | Firebase AI Logic / **`ONLY_ON_DEVICE`** | [pipeline](../apps/web/src/ai/pipeline.ts), [prompt/schema](../apps/web/src/ai/draft-prompt.json) |
| Unavailable fallback | Facts/rule hits → editable low-confidence draft | Local rules / `n/a` | [rules](../apps/web/src/ai/rules.ts) |
| Self-check | Draft + facts → issues and routing logs | Local deterministic checks; **`ONLY_ON_DEVICE`** additional check when available | [pipeline](../apps/web/src/ai/pipeline.ts), [validation](../apps/web/src/ai/validation.ts) |
| Review / redact | Edited draft + approvals → `SharePayload` | Local code / `n/a` | [redaction](../apps/web/src/privacy/redact.ts), [UI](../apps/web/src/ui/App.tsx) |
| Repair plan | Approved payload only → `FixPlan` | Firebase AI Logic / **`ONLY_IN_CLOUD`** | [pipeline](../apps/web/src/ai/pipeline.ts), [prompts](../apps/web/src/ai/prompts.ts) |
| Share / collaborate | Approved fields + plan + logs → `Ticket` | Firebase Auth + Firestore; no inference | [ticket store](../apps/web/src/store/tickets.ts), [rules](../firestore.rules) |
| Verify | Fixed fixture or new capture → target rule hits / pass or fail | Local rule results / `n/a`; outcome stored in Firestore | [UI verification](../apps/web/src/ui/App.tsx), [ticket store](../apps/web/src/store/tickets.ts) |

### Capture and one-time intake

The keyboard shortcut or toolbar action captures around the current focus without requiring a pointer. A nearest containing landmark/form/dialog is preferred; otherwise a focus-centered box is used. The panel asks for the reporter's goal and assistive context. Local navigation-key recording is limited to named navigation/activation keys, with DOM focus handles mapped to virtual refs only during capture. It is not a screen-reader speech recording or a typed-character log.

The collector computes accessible names without reading live form values, records allowlisted attributes, normalizes the page URL to origin plus pathname, masks digits in short visible text, and attaches deterministic axe/custom rule hits. `CaptureFacts` is bounded to **40 elements**, **20 focus steps**, and a **300-character note**, per [shared schema](../packages/shared/src/schema.ts) and [collector](../packages/collector/src/index.ts). It is not a full-page DOM serialization.

The service worker captures the active tab and crops locally with `OffscreenCanvas`, producing a PNG with longest side **at most 768 pixels** ([implementation](../extension/src/background.ts)). The extension UI is removed during collection/screenshot. The browser-session bundle is stored under a random UUID; the app is opened at `/report?capture=<id>&ext=<extension-id>`. Only the two configured web origins can call `getCapture`. Successful retrieval removes the item before returning it; unread captures become unavailable after **30 minutes**, are purged during subsequent capture cleanup, and session storage ends with the browser session ([service worker](../extension/src/background.ts)). The web app decodes the data URL into a local Blob and removes consumed query parameters.

The extension requests `activeTab`, `scripting`, and `storage`, not an explicit `host_permissions` entry. Its automatic HTTP/HTTPS content script nevertheless gives broad page access so keys can be recorded *before* the user activates capture. Chrome's site-access warning is real, not avoided by omitting `host_permissions`. See [extension README](../extension/README.md) for the rationale and unsupported page/frame cases.

### Firebase AI Logic local adapter

The app uses the Firebase JavaScript SDK **13.4.0**, resolved in [package-lock.json](../package-lock.json), with `GoogleAIBackend`. The local model declares text/image `expectedInputs`, system prompts, and **`onDeviceParams.promptOptions.responseConstraint`** containing JSON Schema. Setting only a cloud `generationConfig.responseSchema` would not constrain the on-device adapter in this SDK. Drafts are parsed and validated again in application code.

`prepareOnDevice()` calls the model instance's `initializeDeviceModel()` immediately from the caller's button handler. It must retain a user gesture. Preparation/download is not silently started during normal drafting. Readiness is checked separately and bounded so a missing Chrome model manifest does not leave the UI waiting indefinitely.

**No raw-capture cloud fallback is configured.** The actual product path uses `ONLY_ON_DEVICE`, not `PREFER_ON_DEVICE`. Gate 0 proved with a stubbed unavailable browser API and intercepted network that `ONLY_ON_DEVICE` rejects with `api-not-enabled`, while `PREFER_ON_DEVICE` would choose cloud immediately if local readiness is not `available`. This is why a preferred-mode fallback would violate our privacy boundary. See [SDK findings and test conditions](../gate0/NANO_NOTES.md#firebase-sdk-findings).

The app catches unavailable-model errors and can make a deterministic rules draft. Other generation failures remain visible errors; a rules output is never relabeled as Nano. Self-check always runs deterministic checks and adds local-model validation only when available. A deterministic-only pass is not proof that a model evaluated the draft.

### Human approval and redaction

`redact()` reconstructs a new payload instead of serializing `CaptureFacts`. It always excludes the raw region image, original user note, page title, raw capture object, and query/fragment. It applies email/phone/long-number pattern scrubbing to the draft, accessible names, allowed ARIA attributes, rule details, and approved optional text.

The always-included application data is:

- `site.origin`, and `/` in place of the path unless the path is approved;
- the edited, scrubbed draft;
- scrubbed element facts, rule hits, and assistive context;
- optional page path, visible text, and focus trail, each disabled initially;
- an application payload byte count.

The reporter can inspect the live JSON before choosing **Get a fix plan**. Scrubbing is heuristic, not a comprehensive PII detector; uncommon personal data can remain in control names or an edited draft. The preview, rather than a blanket “fully anonymous” claim, is the final application-level sharing boundary.

### Cloud fix plan and grounding

The cloud model uses **`ONLY_IN_CLOUD`**. Its input is a fixed repair instruction plus the serialized `SharePayload`, not the screenshot or raw facts. Google Search is enabled through `tools: [{ googleSearch: {} }]` when configured. The prompt asks for official W3C WCAG understanding/techniques pages; there is **no enforced W3C-only search allowlist** and **no URL-context tool** implemented.

The app validates the JSON plan and replaces its `sources` with deduplicated HTTP(S) web citations returned in the API's grounding metadata. It does not trust model-authored citation strings as evidence. An empty grounding response stays empty, and the UI tells the user to review guidance independently. Structured cloud output is configured where the selected model/tool combination is supported by the code; older configurable models use prompt-only JSON when Search is enabled. Actual model access and grounding behavior still need an end-to-end deployment check.

## Routing visibility

Every processing result can append a `RoutingLogEntry` from [the shared schema](../packages/shared/src/schema.ts):

```ts
{
  step,                 // collect, draft, self-check, redact, fix-plan, verify, ...
  mode,                 // ONLY_ON_DEVICE, ONLY_IN_CLOUD, or n/a in current paths
  ranOn,                // on-device | in-cloud | local-code
  ms,                   // application elapsed processing time
  bytesSentToCloud,     // approved application-data bytes, not transport accounting
  note?                 // e.g. rules-only or synthetic-fixture disclosure
}
```

For model calls, `ranOn` comes from **`result.response.inferenceSource`** (`on_device` or `in_cloud`); unknown/missing values are rejected, rather than guessed. The UI converts that source to the **On-device / Cloud** badge in its Hybrid routing table. Local/deterministic results are labeled **Local code**.

The cloud byte count is the UTF-8 length of the redacted data object before adding the `bytes` property. It excludes fixed prompt instructions, SDK request envelopes, Auth/App Check traffic, TLS overhead, and subsequent ticket writes. Local entries record zero capture bytes sent to cloud. Thus the table is application-level routing evidence, **not a packet-level privacy audit**. Some UI stages log zero placeholder milliseconds; do not benchmark them as measured capture latency.

## Firestore data model and authorization

Collection: **`tickets/{ticketId}`**. [Ticket schema](../packages/shared/src/schema.ts), [store code](../apps/web/src/store/tickets.ts), [deployed-rule source](../firestore.rules):

| Field | Meaning |
| --- | --- |
| `id`, `reporterUid`, `createdAt` | Firestore auto ID, anonymous Auth UID, client ISO timestamp |
| `status` | `open`, `acknowledged`, `fixed`, or `verified` |
| `site` | Approved origin and optional path |
| `draft` | Edited, redacted barrier report |
| `fixPlan` | Validated plan and returned sources, or null |
| `sharedFacts` | Approved elements, focus trail, rule hits, assistive context |
| `routing` | Captured application routing entries |
| `verification` (optional) | Re-check time, pass/fail, remaining target rule hits |

No screenshot, raw `CaptureFacts`, or original note is stored by the ticket writer. Creation waits for anonymous Auth and obtains an App Check token. The server rules require signed-in creation under the caller's UID, initial `open` status, allowed top-level keys, and bounded fields/lists; unknown top-level raw-image fields are rejected. These are schema/size protections, not complete recursive validation or server-side PII removal.

- A **get** is allowed for any signed-in user who knows the ID.
- A **list** is limited to documents with that user's `reporterUid`; the client queries accordingly.
- Any signed-in user with the ID can advance allowed status changes; this is an intentional prototype sharing model, **not verified site ownership**.
- Content cannot be rewritten through an update; only status/verification changes are allowed.
- Allowed lifecycle: `open → acknowledged → fixed → verified` on a passing verification, or `fixed → open` on a failed verification.
- A passing stored verification must contain no remaining target rule hits. Delete is denied.

The fixed-fixture path checks the original fixture association and explicitly discloses synthetic verification. Live re-capture checks site origin, target-ref presence, and rule hits. Virtual refs are capture-local: semantic matching of a repaired live control is not robust yet. A `verified` state means this scoped check passed, not WCAG conformance.

Anonymous Auth identity can be lost with browser storage. Status actions are not cryptographically attributable to a site owner. There is no implemented deletion path or production moderation/rate-limiting service. These are release limitations, not hidden guarantees.

## Remote Config

Source: [config.ts](../apps/web/src/config.ts) and [template](../remoteconfig.template.json). Values are loaded asynchronously, with in-code defaults if fetching fails.

| Key | Default | Effect |
| --- | --- | --- |
| `cloudModel` | `gemini-3.5-flash-lite` | Cloud fix-plan model; the default name does not establish provider availability. |
| `groundingEnabled` | `true` | Enables Google Search tools on cloud requests. |
| `maxCloudCallsPerSession` | `5` | Client-side budget per pipeline instance; failed/concurrent attempts consume reservations. Not a global security/quota boundary. |
| `ruleCardsVersion` | `"1"` | Version field exposed in config; no rule-card distribution behavior is implemented. |

The numerical defaults above come directly from the linked code/template. Remote Config cannot switch private drafting to a cloud mode.

## App Check and network services

[firebase.ts](../apps/web/src/firebase.ts) initializes reCAPTCHA Enterprise App Check, token auto-refresh, anonymous Auth, Firestore, and Remote Config. In Vite development only, it reads the local `VITE_APPCHECK_DEBUG_TOKEN`; that secret belongs in the ignored development env file, never public docs or production configuration. Public Firebase web config and reCAPTCHA site keys are not service-account credentials.

The supplied project `barrierrelay-lpun3` has **App Check enforced for Firebase AI Logic**, anonymous Auth, and deployed Firestore rules, according to [the coordinator-verified task facts](../specs/i-docs-pi.md). App Check does not replace Firestore authorization, authenticate site owners, or certify redaction. Do not infer Firestore App Check enforcement from a client `getToken()` call.

Local drafting does not require a cloud inference request, but the app shell and Firebase startup can still require a network connection. No offline service worker is installed. Offline demonstrations must use an already-loaded tab/capture and an already-prepared model; turn networking back on before cloud planning or ticket operations.

## Evidence and release gates

| Claim / observation | Source and scope |
| --- | --- |
| Initial Nano download was blocked by a metered hotspot; unavailable/fallback SDK behavior was tested with stubs and intercepted fetch. | [Gate 0 report](../gate0/NANO_NOTES.md); historical initial state, **not** a claim that Nano is still absent. |
| Later real Nano image prompt: **6.1 s**; schema JSON: **4.1 s**, including session creation; model size: **4.0 GB**; Chrome **158**. | Coordinator-measured facts supplied in [docs task spec](../specs/i-docs-pi.md). These are individual environment probes, **not app latency distributions, accuracy metrics, or a successful offline Firebase-app test**. TODO(verify): archive/link the raw later-probe artifacts before publishing these as benchmark evidence. |
| Firebase project/services and enforced AI Logic App Check; Hosting target configured but not deployed. | [Coordinator-verified setup facts](../specs/i-docs-pi.md); TODO(verify): final hosted deployment and production-domain behavior. |
| Real local constraints / inference-source handling / cloud-only repair path. | [Pipeline](../apps/web/src/ai/pipeline.ts), [SDK probe](../gate0/sdk-probe/main.js), [tests](../apps/web/src/ai/pipeline.test.ts). Source and mocked tests do not prove a successful real cloud request. |
| Extension handoff and keyboard panel integration. | [Isolated Chrome E2E](../tools/e2e/extension.e2e.mjs); no Nano or cloud inference involved. |
| UI workflow and accessibility checkpoints. | [Web E2E](../tools/e2e/web.e2e.mjs); uses a deterministic AI substitute and real Firebase ticket operations, so it must not be presented as real AI evidence. |

TODO(verify): exercise the complete **real Firebase AI Logic** text+image draft with constrained output and displayed inference source, an already-loaded-tab **offline draft**, and the configured **cloud model with actual Search grounding citations**. Record the exact browser/profile/model/config and retain outputs. TODO(verify): disability-led screen-reader testing and final production-domain App Check behavior. Neither intended video shots nor unit-test mocks close these evidence gates.
