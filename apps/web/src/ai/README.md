# AI and privacy boundary

`createAiPipeline({app, getConfig})` implements the coordinator-owned `AiPipeline` contract. Import `OnDeviceUnavailableError` from this module or `contracts.ts`: both exports reference the same class.

Raw facts and optional PNG use Firebase AI Logic **ONLY_ON_DEVICE**, never a prefer mode. The local Prompt API response constraint is the JSON schema in `draft-prompt.json`. `prompts.ts` imports that same source; Gate 0 reads it directly, so the text and schema cannot drift. Responses are parsed and checked for supported types, existing refs, length limits, step count and contact/card patterns. Routing uses `response.inferenceSource`; absent/unknown inference locations are rejected rather than guessed. `api-not-enabled` becomes the shared unavailable error. `prepareOnDevice` must be invoked directly from a user gesture; progress is delegated to `initializeDeviceModel`. Inference readiness probes time out after five seconds as unknown; display readiness re-probes once with a 15-second deadline. Probing never starts downloads.

The rules fallback is local code, confidence low, and does not copy the user's note into its output. It maps collector rule IDs, examines unnamed inputs, and uses Escape/Tab evidence plus the note for suspected traps. The unit suite scores **10/10 broken fixtures**, no failures. Self-check always runs deterministic validation first, then asks a local structured yes/no question when Nano is available. If Nano is absent the log explicitly says only deterministic checks ran and manual review is needed.

`redact` constructs a new allowlisted payload; it never serializes the capture or userNote. Visible text, focus trail and path require individual approvals. It strips nonallowlisted attributes and re-scans every retained text value for email/phone/card patterns. The exact URL origin (scheme, hostname, port) is retained to identify the site, including localhost/IP hosts. Numeric geometry is retained. `bytes` measures UTF-8 JSON without the `bytes` field itself, as required by the contract. Pattern filtering cannot identify arbitrary names in approved page text: the reporter still reviews every retained field; userNote itself is never shared.

## URL context and structured output decision

The existing `groundingEnabled` config switch now enables **URL context only**, never Google Search. The coordinator verified these real REST requests through Firebase AI Logic + App Check on `barrierrelay-lpun3` on 2026-11-18:

| Gemini 3.5 Flash-Lite configuration | Observed HTTP result |
| --- | --- |
| No tools | 200 |
| Google Search tool | 429 RESOURCE_EXHAUSTED; no free-tier Search grounding quota |
| URL context + application/json + responseSchema | 200; valid JSON and successful URL retrieval metadata |

Billing is not an option for this project. The implementation therefore supplies one to three known W3C Understanding URLs and `tools: [{urlContext: {}}]` with the JSON response schema for the default Gemini 3.5 Flash-Lite model. There is no Search tool and no Search suggestion rendering integration to implement. This is retrieval from a fixed set of WCAG references, not a web search.

Official references checked:

- [Firebase URL context](https://firebase.google.com/docs/ai-logic/url-context) lists Gemini 3.5 Flash-Lite and documents supplying URLs in the prompt with the URL context tool.
- [Firebase structured output](https://firebase.google.com/docs/ai-logic/generate-structured-output) documents JSON MIME type and responseSchema.
- [Gemini structured output with tools](https://ai.google.dev/gemini-api/docs/structured-output#tools) supports built-in tools including URL context with Gemini 3/4 series (preview).
- [Firebase hybrid structured output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output) documents the separate local response constraint.

`wcag.ts` maps barrier types to SC and official Understanding URLs. The eight mapped WCAG 2.2 slugs (`name-role-value`, `info-and-relationships`, `link-purpose-in-context`, `keyboard`, `no-keyboard-trap`, `focus-visible`, `labels-or-instructions`, `label-in-name`) all returned **HTTP 200** with curl; the check is saved at `gate0/out/wcag-url-check.json`. Reference candidates do not imply every mapped SC is violated. The prompt asks the model to retrieve these documents, base the fix on them, and cite only applicable SC. With the switch off, no URL context tool or reference URL list is supplied.

`FixPlan.sources` comes only from candidate-zero `urlContextMetadata.urlMetadata[]` entries with `urlRetrievalStatus === 'URL_RETRIEVAL_STATUS_SUCCESS'`. Titles come from the deterministic map and URLs remain the exact `retrievedUrl`. The API can return a WCAG 2.1 equivalent for a supplied 2.2 document (observed for Name, Role, Value); matching official W3C 2.0/2.1/2.2 versions of the requested slug are accepted without rewriting the returned URL. Unknown URLs, retrieval failures, missing statuses and duplicates are discarded. Model-authored sources are always ignored. Missing metadata yields zero sources, not an invented citation.

The default model combines URL context and responseSchema in one call. Older configurable models use prompt-only JSON instructions when URL context is enabled; all outputs still pass the same validator. No second model call is used for formatting or schema repair. A transient server failure can trigger one explicitly logged retry as described below. Firebase optional schema fields use the containing object's `optionalProperties`. Calls including errors reserve the session budget before awaiting, so concurrent clicks cannot bypass it; this per-instance budget is not a billing/security control.

## Manual cloud smoke

From `apps/web`, run:

```sh
npx vite --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/scripts/cloud-smoke.html` and activate **Send one fixture report** with the keyboard or pointer. This uses fixture 02, a rules draft and all sharing approvals off. The module imports the existing Firebase initializer, so Vite loads the existing local App Check debug-token configuration automatically. Never display/copy that token or the environment file. The button disables after one attempt, and results/status are accessible with a live region and visible keyboard focus. Avoid source edits while the request is pending because Vite HMR reloads the page.

### Actual real API smoke (2026-11-18)

The initial Search-based implementation made three attempts: one result lost to HMR, one HTTP 400 schema-field error (fixed with `optionalProperties`), and one HTTP 429 quota error. Those historical failures are superseded by the successful URL-context implementation below. No App Check rejection occurred.

This follow-up made **two additional real requests**, within the three-request allowance:

| URL context smoke | Outcome | End-to-end latency | Schema-valid | Sources retained |
| --- | --- | --- | --- | --- |
| First | Success | 2738 ms | Yes | 1 (strict original-URL matching) |
| Final, matching equivalent W3C versions | Success | **2900 ms** | **Yes** | **2** |

The successful final fixture 02 fix plan is saved as direct JSON at **`gate0/out/cloud-smoke.json`**, including `ok`, `ms`, `schemaValid`, source count, response field names, routing, and the complete validated `fixPlan`. The response top-level fields were `candidates`, `usageMetadata`, `modelVersion`, `responseId`; candidate fields were `content`, `finishReason`, `index`, `urlContextMetadata`. Both retrieval entries were SUCCESS:

- `https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html` — Name, Role, Value
- `https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html` — Label in Name

The plan cited WCAG 4.1.2, identified the unnamed button, provided minimal HTML before/after, and included accessibility-inspector/screen-reader checks. Routing was `ONLY_IN_CLOUD`, `in-cloud`, **1395 payload bytes**. `schemaValid: true` means the returned JSON was successfully parsed and passed the application's FixPlan validator after the API response-schema constraint; source links were then attached from retrieval metadata. The smoke script reads neither tokens nor request headers and captures no App Check response. No third follow-up request was needed.

## Verification

```sh
cd apps/web
npx vitest run src/ai src/privacy
# From the repository root:
npx tsc --noEmit -p apps/web
node gate0/eval/run-eval.mjs
```

Gate 0 requires an already-available Nano model, fails fast without one, never attempts a download, and writes all 40 inference rows plus per-mode metrics to `gate0/out/eval.json`. Run only one process against the dedicated Nano profile. Its latency includes model creation plus inference, as reported by `tools/nano/run.mjs`. It tests the direct Prompt API prompt/schema; Firebase SDK routing is verified separately with mocks.

### Real Nano fixture results

After the coordinator downloaded Nano on an unmetered network, the final shared prompt completed all 40 requested inferences. Text-only: type **19/20**, ref **19/20**, schema **20/20**, broken type **10/10**, fixed none **9/10**, median **6002 ms**. Text+region PNG: type **18/20**, ref **18/20**, schema **20/20**, broken type **10/10**, fixed none **8/10**, median **4759 ms**. See `gate0/NANO_NOTES.md` for methodology and limitations; `gate0/out/eval.json` contains every draft and the exact prompt snapshot. Current unit validation: **29 tests pass**, TypeScript passes.

## Self-check consistency judge and readiness guard

The on-device judge now returns `{consistent:boolean, problems:string[]}` through a shared `responseConstraint` with at most three short problems. It answers whether the **draft describes the facts**, explicitly treating the page's accessibility barrier as expected evidence, not a report defect. `selfcheck-prompt.json` contains the shared system/schema/sampling settings. `selfcheck-input.ts` builds identical app/evaluator input: target-specific evidence rendered in plain language, the report summary/actual/type/ref, a normalized observation from the local rule engine, and trusted exact comparisons for target existence and rule-type consistency. The judge does not receive desired behavior/confidence as observed facts; structural limits and PII scanning of all draft fields still run deterministically. This prevents Nano from inventing a missing ref while scanning a long element array. Local contradictions are supplied as evidence before semantic judging; no generated problem text is filtered, matched or silently dismissed afterward. Deterministic validation still runs before invoking the model in the application.

Sampling preferences are forwarded in SDK `onDeviceParams.createOptions`: `topK:1`, `temperature:0`, `samplingMode:'most-predictable'`. Firebase 13.4.0's type does not declare these native creation options, but its adapter forwards the creation-options object unchanged; the preferences are spread into that object without changing SDK types. The dedicated Chrome 158 evaluation profile with the existing legacy-params feature flag reported actual session values **topK 1, temperature 0**; it did not expose `samplingMode`. [Chrome's current Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api#sampling_parameters) says the web uses the sampling-mode origin trial and extensions retain numeric parameters. Unsupported browser fields can be ignored, so deterministic sampling cannot be guaranteed for every judge browser or model version. The semantic prompt and local checks do not depend on sampling support.

Drafting and model self-check first probe availability with the same text/image expected inputs. Internal readiness distinguishes a **five-second timeout (`unknown`)** from a reported `unavailable`. Generation proceeds for `available` **or `unknown`**, with the **45-second SDK generation timeout** still enforced. Explicit `downloadable`, `downloading` and `unavailable` states immediately throw `OnDeviceUnavailableError` before generation, so they cannot initiate a download. Only Prepare calls `initializeDeviceModel`. Display state re-probes an unknown result once for up to 15 seconds, then maps a second unknown to unavailable within the existing public contract. The generation timeout releases the UI; it does not assert that the SDK cancelled native inference.

`node gate0/eval/selfcheck-eval.mjs` runs 10 correct truth-aligned broken-fixture drafts and 10 single-field corruptions (alternating nonexistent target refs and wrong types) on real Nano, without the application's early deterministic rejection. Every row invokes the same model prompt/schema/input builder, including local comparison evidence. Thus this measures the combined local-evidence-plus-model judgment, not independent model string comparison or arbitrary hallucination detection. The script fails below 9/10 correct accepted or 8/10 corrupted rejected and saves all rows, settings and observed sampling to `gate0/out/selfcheck.json`.

### Final self-check and real E2E measurements (2026-11-18)

Final `selfcheck-eval.mjs`: **10/10 correct accepted, 10/10 corrupted rejected, 20/20 schema-valid**, exit **0**. Median session creation + inference was **974 ms** (range 615–5479 ms). Actual sampling reported `topK:1`, `temperature:0`, `samplingMode:null`. The exact final prompt/schema, drafts, responses, observations and per-row timings are in `gate0/out/selfcheck.json`; the console table is in `gate0/out/selfcheck-console.txt`. Earlier prompt iterations and failed E2E checks are preserved separately as local ignored outputs. These numbers meet the requested target on this small synthetic combined local-evidence/model evaluation; they do not prove independent semantic judgment or eliminate model errors on new pages.

The initial judge treated raw JSON input fields as if they were output-schema violations, confused empty accessible names with absence of evidence, and sometimes hallucinated target-ref mismatches. The final input is readable evidence plus an explicitly labeled **report to check**, separate from the JSON output shape. The prompt states that a page barrier is expected, uses local evidence for exact comparisons, and evaluates reported observations. No output-string heuristic removes or approves generated problems.

After the final evaluation browser closed, ran **`node tools/e2e/real.e2e.mjs` twice sequentially**, with no concurrent profile use:

| Final run | Exit | Observation |
| --- | --- | --- |
| 1 | **1** | Offline SDK draft completed on-device with 0 AI network requests, then deterministic self-check correctly rejected a generated barrier type inconsistent with target rule hits; the model self-check was not invoked. |
| 2 | **1** | Offline SDK draft completed on-device with 0 AI network requests; the actual on-device self-check **passed** in 657 ms; cloud then returned **HTTP 500**, model temporarily experiencing high demand. |

Full final receipts are in `gate0/out/real-e2e-selfcheck-1.json` and `gate0/out/real-e2e-selfcheck-2.json`, with corresponding `.log` and `.exit` files. These runs do **not** establish a fully successful end-to-end ticket flow: stochastic draft classification and external cloud availability remain open risks. Do not weaken consistency checks to accept an incorrect draft. The cloud error did not involve App Check or URL-context schema support. The AI/privacy suite passes **23 tests**, including downloadable readiness without generation/download and fake-timer hung-generation timeouts for both drafting and self-check; TypeScript passes.

## Rule reconciliation and bounded cloud retry (2026-11-19)

After parsing a Nano draft, `reconcileDraft` corrects only `barrierType` and `targetRef` before normal validation. If the target has known rule hits mapping to exactly one supported type, that type wins. If the ref is missing/unknown/null, correction is allowed only when exactly one captured element has supported rule hits and those hits map to one type. Duplicate hits for the same type are not ambiguity; conflicting types or multiple candidate targets prevent correction. Unrecognized rule IDs and nonexistent rule-hit refs are ignored. No rule evidence means no correction, including fixed-page false positives.

All generated language remains unchanged, including a summary that may still contradict the corrected metadata. The reporter and semantic self-check must catch such wording. Every actual correction appends a `self-check`/`local-code` routing entry with `Draft corrected by rules: <from> -> <to>` and zero cloud bytes. The inference entry still records the actual on-device run; correction never substitutes a rules-only language draft. `reconcile.ts` is shared directly by the app and the Gate 0 post-step.

Cloud HTTP 5xx errors, including overload/high-demand service errors, retry **once after 1500 ms**. Explicit 4xx/429 errors never retry. Each attempt reserves its own session-budget unit before awaiting; no retry is sent if the remaining budget cannot cover it. Validation/JSON parsing failures do not trigger retries. A successful retry records the delay and two-attempt count in the routing note; elapsed time includes the first attempt, delay and retry, and `bytesSentToCloud` counts **two payloads**. This per-instance accounting remains a client-side guard, not a server billing control. Failed retries are returned as errors without further attempts.

The AI/privacy unit suite now passes **29 tests**, including metadata-only correction, missing refs, conflicting rules, multiple targets, delayed server-error retry, no retries for 400/429, retry budget exhaustion and the one-retry maximum. TypeScript passes.

### Reconciliation benchmark and three sequential E2E runs

Completed the draft benchmark again on **2026-11-19** with raw and reconciled rows retained together in `gate0/out/eval.json`:

| Mode | Raw type / ref | Reconciled type / ref | Raw / reconciled schema-valid | Broken type | Fixed none | Corrections | Median inference session |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Text only | 18/20 / 18/20 | 18/20 / 18/20 | 20/20 / 20/20 | 10/10 | 8/10 | 0 | 4624 ms |
| Text + region PNG | 20/20 / 20/20 | 20/20 / 20/20 | 20/20 / 20/20 | 10/10 | 10/10 | 0 | 4303 ms |

No correction was needed in this particular run, so there is **no measured accuracy improvement** to claim. Text-only fixed fixtures 02 and 07 were false positives without supporting rule hits and correctly remained unchanged. Correction behavior is covered by unit tests. The completed run had no inference/parse failures. An earlier benchmark session was manually closed after a stalled native prompt; its aborted rows are preserved in `eval-aborted-session.json`, not included in this table. The evaluator now closes/reopens only its own browser after a failed case while counting that case as incorrect; the final complete run needed no such restarts. The prior raw comparison remains in `eval-before-reconcile.json`.

After the evaluator closed, ran the requested real E2E script **three times sequentially**:

| Run | Exit | Draft ms | Local / on-device self-check ms | Redact ms | Cloud fix ms / bytes | Verify ms | Outcome |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **1** | Not retained by harness | Not reached | Not reached | Not reached | Not reached | Draft action used the safe local rules fallback; the harness requires actual on-device inference and failed its routing assertion. |
| 2 | **0** | 8693 | 0 / 711 | 0 | 2271 / 1584 | 509 | Completed ticket creation, owner status updates and synthetic fixed-fixture verification; 2 W3C sources. |
| 3 | **0** | 8763 | 0 / 715 | 0 | 4641 / 1799 | 370 | Completed the same full flow; 2 W3C sources. |

**Result: 2/3 passed; the requested 3/3 target was not met.** The first failure was an unavailable/timeout fallback path, not a rule-type rejection; the current UI/E2E receipt does not retain the original `OnDeviceUnavailableError`, so its exact cause and duration are unknown. Do not infer that it was a 45-second timeout rather than a readiness probe. The fallback keeps the app usable but does not prove real Nano inference for that run. Both successful runs drafted offline with **0 AI network requests**, passed the real on-device consistency judge, and completed cloud/owner/verification work. Neither successful run needed a cloud retry or metadata correction; those new branches are verified with mocks. Verification is against the synthetic fixed fixture, not the external reported site.

Receipts: `gate0/out/real-e2e-reconciled-{1,2,3}.json`, corresponding `.log`/`.exit` files. The profile was never used concurrently. Final validation: **29 AI/privacy tests pass**, TypeScript passes. Remaining risk: intermittent native-model readiness/inference can enter the fallback, so a full 3/3 real-Nano E2E success is still unproven.


## Cold-start readiness distinction and diagnostic E2E (2026-11-19)

A readiness timeout is lack of an answer, not proof that the model is unavailable. `readiness()` now returns available/downloadable/downloading/unavailable/**unknown**. Inference uses a single 5-second probe and attempts bounded generation after unknown; display state makes one additional 15-second probe before showing unavailable. Known negative states still fail immediately without generator/download calls. Tests cover unknown draft/self-check execution, the independent 45-second generation deadline, display re-probing and exact negative-state diagnostics.

The pipeline emits local `barrierrelay:device-diagnostic` events containing only readiness state, duration, deadline and controlled unavailable-error message/operation. No page facts, prompt content, screenshot, token or headers are emitted. These events do not change the shared contract or normal UI and are not transmitted by the pipeline.

**Diagnostics-only harness changes in `tools/e2e/real.e2e.mjs`:** install an event listener before page scripts execute; record `deviceDiagnostics` with per-document timing/URL; capture `draftDiagnostic` (routing and wall time) and `fallbackReason` before the strict routing assertion; preserve and deduplicate observations across navigation to the owner page. It does not wrap availability/generation APIs, intercept network traffic or weaken assertions. The existing finalizer now also retrieves diagnostics for failed runs.

The initial diagnostic batch exited **1, 0, 0**. Its first failure was **native `kErrorUnknown` during draft**, while readiness had returned available in **1826 ms** and subsequent probes completed in 1–3 ms. This is a different failure from an availability timeout, and no OnDeviceUnavailableError/fallback occurred in that trial. The initial batch receipts are preserved as `gate0/out/real-e2e-readiness-initial-{1,2,3}.json`. During this batch we found successful owner navigation was replacing report-page diagnostics; after fixing diagnostic merging, reran all three tests sequentially.

### Final sequential runs after diagnostic merging

| Run | Exit | Draft ms | On-device check ms | Cloud ms / bytes | Verify ms | Sources | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **0** | 10322 | 718 | 9290 / 1766 | 376 | 2 | None |
| 2 | **0** | 7840 | 650 | 9200 / 1674 | 348 | 2 | None |
| 3 | **0** | 7457 | 671 | 8890 / 1597 | 381 | 2 | None |

All three completed the real offline on-device draft (0 AI network requests), real on-device self-check, real cloud fix plan, ticket/owner updates and synthetic fixed-fixture verification. Local self-check/redact steps were 0 ms in the rendered timing table. All final readiness observations were **available**: initial page probes 1848/1819/1819 ms, draft probes 14/13/14 ms, check probes 14/10/6 ms (rounded). No final real run exercised unknown; that path is verified with controlled fake timers. The earlier native error remains an observed risk despite this **3/3** final batch.

Full final receipts are `gate0/out/real-e2e-readiness-{1,2,3}.json`, corresponding logs/exit files, and `real-e2e-readiness-summary.json`. The dedicated Nano profile was used sequentially throughout. **33 unit tests pass**, TypeScript and harness syntax checks pass. This supersedes the earlier 2/3 E2E checkpoint, while preserving its historical receipts and limitations.
