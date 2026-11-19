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

The service worker captures the active tab and crops locally with `OffscreenCanvas`, producing a PNG with longest side **at most 768 pixels** ([implementation](../extension/src/background.ts)). The extension UI is removed during collection/screenshot. The browser-session bundle is stored under a random UUID; the app is opened at `/report?capture=<id>&ext=<extension-id>`. Only `http://127.0.0.1:5173`, `http://127.0.0.1:4173`, and `https://barrierrelay-lpun3.web.app` can call `getCapture`; the extension destination allowlist and manifest agree. Successful retrieval removes the item before returning it; unread captures become unavailable after **30 minutes**, are purged during subsequent capture cleanup, and session storage ends with the browser session ([service worker](../extension/src/background.ts)). The web app decodes the data URL into a local Blob and removes consumed query parameters.

The extension requests `activeTab`, `scripting`, and `storage`, not an explicit `host_permissions` entry. Its automatic HTTP/HTTPS content script nevertheless gives broad page access so keys can be recorded *before* the user activates capture. Chrome's site-access warning is real, not avoided by omitting `host_permissions`. See [extension README](../extension/README.md) for the rationale and unsupported page/frame cases.

### Firebase AI Logic local adapter

The app uses the Firebase JavaScript SDK **13.4.0**, resolved in [package-lock.json](../package-lock.json), with `GoogleAIBackend`. The local model declares text/image `expectedInputs`, system prompts, and **`onDeviceParams.promptOptions.responseConstraint`** containing JSON Schema. Setting only a cloud `generationConfig.responseSchema` would not constrain the on-device adapter in this SDK. Drafts are parsed and validated again in application code.

`prepareOnDevice()` calls the model instance's `initializeDeviceModel()` immediately from the caller's button handler. It must retain a user gesture. Preparation/download is not silently started during normal drafting. Readiness is checked separately and bounded so a missing Chrome model manifest does not leave the UI waiting indefinitely.

**No raw-capture cloud fallback is configured.** The actual product path uses `ONLY_ON_DEVICE`, not `PREFER_ON_DEVICE`. Gate 0 proved with a stubbed unavailable browser API and intercepted network that `ONLY_ON_DEVICE` rejects with `api-not-enabled`, while `PREFER_ON_DEVICE` would choose cloud immediately if local readiness is not `available`. This is why a preferred-mode fallback would violate our privacy boundary. See [SDK findings and test conditions](../gate0/NANO_NOTES.md#firebase-sdk-findings).

The app catches unavailable-model errors and can make a deterministic rules draft. Other generation failures remain visible errors; a rules output is never relabeled as Nano. Self-check consists of **deterministic checks + on-device consistency check** when the model is available. A deterministic-only pass is not proof that a model evaluated the draft. The final [self-check evaluation](../gate0/out/selfcheck.json) accepted **10/10 correct drafts**, rejected **10/10 corrupted drafts**, and produced **20/20 schema-valid** responses. This small synthetic combined local-evidence/model check is not an independent general-purpose semantic accuracy measurement.

Before normal draft validation, [rule reconciliation](../apps/web/src/ai/reconcile.ts) can correct only the generated `barrierType` and `targetRef` when supported rule hits identify one unambiguous type/target. Conflicting types or multiple candidate targets do not justify correction. Generated language remains unchanged. Each actual correction is logged as a local-code routing entry; an on-device inference entry still records where generation ran.

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

The cloud model uses **`ONLY_IN_CLOUD`**. Its input is a fixed repair instruction plus the serialized `SharePayload`, not the screenshot or raw facts. With grounding enabled, **`tools: [{ urlContext: {} }]`** retrieves W3C WCAG 2.2 Understanding pages selected deterministically from the draft's barrier type by [wcag.ts](../apps/web/src/ai/wcag.ts). This is retrieval from known reference URLs, not open-ended web search. The coordinator isolated a quota-exhausted search-tool request (**HTTP 429**) while URL context plus JSON response schema returned **HTTP 200**; see [the measured SDK/tool decision](../apps/web/src/ai/README.md).

The app validates the JSON plan and replaces model-authored sources using candidate-zero **`urlContextMetadata.urlMetadata[]`**. It retains only **`URL_RETRIEVAL_STATUS_SUCCESS`** entries matching the requested official W3C slug/version map, deduplicating exact returned URLs. Equivalent W3C WCAG document versions may be accepted without rewriting the returned URL. Failed retrievals, missing statuses, unknown URLs, and absent metadata cannot create citations. An empty source list stays empty and the UI asks for independent review.

The default cloud model supports URL context and structured output together in the verified smoke. Older configurable models use prompt-only JSON when URL context is enabled; application validation still applies. With grounding disabled, neither the context tool nor reference URL list is supplied. The standalone [cloud smoke artifact](../gate0/out/cloud-smoke.json) records **2900 ms**, **2 successful W3C sources**, and **schemaValid: true**; it is separate from the later completed end-to-end ticket workflow.

Transient cloud **5xx** errors retry at most **once after 1500 ms**, reserving another cloud-call budget unit. Each successful retry is explicitly logged, elapsed time includes both attempts and delay, and cloud bytes count both payloads. A validation/JSON error or **4xx/429** response does not retry; exhausted budget prevents the retry. See [bounded-retry implementation notes](../apps/web/src/ai/README.md#rule-reconciliation-and-bounded-cloud-retry-2026-11-19). No formatting-repair call is hidden behind the schema validator.

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

For a single attempt, the cloud byte count is the UTF-8 length of the redacted data object before adding the `bytes` property; a logged successful retry counts two payloads. It excludes fixed prompt instructions, SDK request envelopes, Auth/App Check traffic, TLS overhead, and subsequent ticket writes. Local entries record zero capture bytes sent to cloud. Thus the table is application-level routing evidence, **not a packet-level privacy audit**. Some UI stages log zero placeholder milliseconds; do not benchmark them as measured capture latency.

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
| `groundingEnabled` | `true` | Enables URL context and deterministic W3C reference URLs on cloud requests. |
| `maxCloudCallsPerSession` | `5` | Client-side budget per pipeline instance; failed/concurrent attempts consume reservations. Not a global security/quota boundary. |
| `ruleCardsVersion` | `"1"` | Version field exposed in config; no rule-card distribution behavior is implemented. |

The numerical defaults above come directly from the linked code/template. Remote Config cannot switch private drafting to a cloud mode.

## App Check and network services

[firebase.ts](../apps/web/src/firebase.ts) initializes reCAPTCHA Enterprise App Check, token auto-refresh, anonymous Auth, Firestore, and Remote Config. In Vite development only, it reads the local `VITE_APPCHECK_DEBUG_TOKEN`; that secret belongs in the ignored development env file, never public docs or production configuration. Public Firebase web config and reCAPTCHA site keys are not service-account credentials.

The supplied project `barrierrelay-lpun3` has **App Check enforced for Firebase AI Logic**, anonymous Auth, and deployed Firestore rules, according to [the coordinator-verified task facts](../specs/i-docs-pi.md). App Check does not replace Firestore authorization, authenticate site owners, or certify redaction. Do not infer Firestore App Check enforcement from a client `getToken()` call.

Local drafting does not require a cloud inference request, but the app shell and Firebase startup can still require a network connection. No offline service worker is installed. Offline demonstrations must use an already-loaded tab/capture and an already-prepared model; turn networking back on before cloud planning or ticket operations.

## Evidence and release gates

### Real Nano fixture evaluation

| Input mode | Type correct | Ref correct | Schema-valid | Broken types correct | Median, creation + inference |
| --- | --- | --- | --- | --- | --- |
| Text-only | 18/20 | 18/20 | 20/20 | 10/10 | 4.6 s (4624 ms rounded) |
| Text + region PNG | 20/20 | 20/20 | 20/20 | 10/10 | 4.3 s (4303 ms rounded) |

Source: [all evaluation rows and prompt snapshot](../gate0/out/eval.json), [methodology and limitations](../gate0/NANO_NOTES.md#real-nano-results--barrierrelay-draft-evaluation-2026-11-18). These are **40 real Nano inferences** over **10 synthetic broken/fixed pairs** using the direct Chrome Prompt API, with fresh single-turn sessions and a downloaded model. They do not measure Firebase SDK overhead or population-wide accuracy. The latest raw and reconciled scores match because no corrections were needed; no measured reconciliation gain is claimed. Text-only fixed-page false positives remain; the shorter image median is not proof of a general speed advantage. Earlier scores are historical checkpoints, not the latest `eval.json`.

### Integration and deployment evidence

| Claim / observation | Source and scope |
| --- | --- |
| Initial model download was refused on a metered hotspot; later a model was downloaded on an unmetered connection. | [Gate 0](../gate0/NANO_NOTES.md). Use supported Chrome desktop with Prompt API and **Prepare private on-device AI**; an unavailable-model rules fallback is not Nano inference. |
| Real SDK offline draft: `response.inferenceSource = on_device`, **0 capture bytes sent to cloud**, **0 AI network requests**. | [Real E2E runner](../tools/e2e/real.e2e.mjs) and [current result](../tools/e2e/out/real-results.json). An already-loaded capture/tab and prepared model were used. Zero AI requests does not claim zero browser network traffic. |
| Real cloud URL-context smoke: **2.9 s**, **2 W3C sources**, **schemaValid: true**. | [Cloud smoke JSON](../gate0/out/cloud-smoke.json) and [AI README](../apps/web/src/ai/README.md). This separately verified call is not a full real E2E completion claim. |
| Hosted app is deployed with production reCAPTCHA Enterprise App Check; AI Logic enforcement is enabled. | [Hosted demo](https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken); deployment verified by the coordinator for this docs refresh. |
| Extension keyboard panel/handoff; extension → actual production app with rules-only fallback and note exclusion. | [Isolated extension E2E](../tools/e2e/extension.e2e.mjs), [real-app intake integration](../tools/e2e/integration.e2e.mjs). These tests use no Nano/cloud inference. Preview origin is `http://127.0.0.1:4173`. |
| Deterministic UI repair workflow and Firebase operations. | [Web E2E](../tools/e2e/web.e2e.mjs); uses an AI substitute and must not be cited as real hybrid inference. |

### Completed real hybrid workflow

The [latest real E2E receipt](../tools/e2e/out/real-results.json) has **`completed: true`**, no page errors, no fake pipeline, and no fallback. It records:

| Stage | Latest receipt |
| --- | --- |
| Offline SDK draft | **7601 ms**, on-device (`inferenceSource: on_device`), **0 capture bytes to cloud**, **0 AI network requests** |
| On-device consistency check | **670 ms**; deterministic local check also ran |
| Cloud URL-context plan | **17001 ms**, **1632 payload bytes**, **2 W3C sources** |
| Ticket lifecycle | Real Firestore create/owner status changes and synthetic fixed-fixture check reached **verified** |

The coordinator's two post-fix reruns both exited zero: offline draft **7.6–9.9 s**, on-device check about **0.65 s**, cloud plan **9–17 s** for about **1.6–1.7 KB**. A separate worker's final batch passed **3/3**; its exact different timings are in [the final sequential-run table](../apps/web/src/ai/README.md#final-sequential-runs-after-diagnostic-merging). These ranges are observed runs, not a latency guarantee. Earlier native-model failures remain documented risks; final successes do not prove those failures impossible. Successful runs did not need to exercise correction/retry branches; their edge cases have controlled unit tests.

The coordinator additionally verified the hosted production app's no-model rules-only path and a real cloud plan in **21.1 s** with **2 W3C source links**, using reCAPTCHA Enterprise App Check. That production observation is distinct from both the early cloud smoke and local real E2E timings.

Final validation: the docs-pass local run passed **46 Vitest tests** and TypeScript; the coordinator verified that all four E2E scripts—extension, integration, web, real—passed. **Usability/video: TODO(verify)** testing with real screen-reader users, final recorded speech/captions/runtime, public evidence/video links, and Devpost submission details. Output artifacts live under ignored directories and must be retained separately for a reproducible submission.
