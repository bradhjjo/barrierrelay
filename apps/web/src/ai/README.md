# AI and privacy boundary

`createAiPipeline({app, getConfig})` implements the coordinator-owned `AiPipeline` contract. Import `OnDeviceUnavailableError` from this module or `contracts.ts`: both exports reference the same class.

Raw facts and optional PNG use Firebase AI Logic **ONLY_ON_DEVICE**, never a prefer mode. The local Prompt API response constraint is the JSON schema in `draft-prompt.json`. `prompts.ts` imports that same source; Gate 0 reads it directly, so the text and schema cannot drift. Responses are parsed and checked for supported types, existing refs, length limits, step count and contact/card patterns. Routing uses `response.inferenceSource`; absent/unknown inference locations are rejected rather than guessed. `api-not-enabled` becomes the shared unavailable error. `prepareOnDevice` must be invoked directly from a user gesture; progress is delegated to `initializeDeviceModel`. Readiness probes time out after five seconds and never start downloads.

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

The default model combines URL context and responseSchema in one call. Older configurable models use prompt-only JSON instructions when URL context is enabled; all outputs still pass the same validator. No silent retry or second model call is used. Firebase optional schema fields use the containing object's `optionalProperties`. Calls including errors reserve the session budget before awaiting, so concurrent clicks cannot bypass it; this per-instance budget is not a billing/security control.

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

After the coordinator downloaded Nano on an unmetered network, the final shared prompt completed all 40 requested inferences. Text-only: type **19/20**, ref **19/20**, schema **20/20**, broken type **10/10**, fixed none **9/10**, median **6002 ms**. Text+region PNG: type **18/20**, ref **18/20**, schema **20/20**, broken type **10/10**, fixed none **8/10**, median **4759 ms**. See `gate0/NANO_NOTES.md` for methodology and limitations; `gate0/out/eval.json` contains every draft and the exact prompt snapshot. Current unit validation: **23 tests pass**, TypeScript passes.

## Self-check consistency judge and readiness guard

The on-device judge now returns `{consistent:boolean, problems:string[]}` through a shared `responseConstraint` with at most three short problems. It answers whether the **draft describes the facts**, explicitly treating the page's accessibility barrier as expected evidence, not a report defect. `selfcheck-prompt.json` contains the shared system/schema/sampling settings. `selfcheck-input.ts` builds identical app/evaluator input: target-specific evidence rendered in plain language, the report summary/actual/type/ref, a normalized observation from the local rule engine, and trusted exact comparisons for target existence and rule-type consistency. The judge does not receive desired behavior/confidence as observed facts; structural limits and PII scanning of all draft fields still run deterministically. This prevents Nano from inventing a missing ref while scanning a long element array. Local contradictions are supplied as evidence before semantic judging; no generated problem text is filtered, matched or silently dismissed afterward. Deterministic validation still runs before invoking the model in the application.

Sampling preferences are forwarded in SDK `onDeviceParams.createOptions`: `topK:1`, `temperature:0`, `samplingMode:'most-predictable'`. Firebase 13.4.0's type does not declare these native creation options, but its adapter forwards the creation-options object unchanged; the preferences are spread into that object without changing SDK types. The dedicated Chrome 158 evaluation profile with the existing legacy-params feature flag reported actual session values **topK 1, temperature 0**; it did not expose `samplingMode`. [Chrome's current Prompt API documentation](https://developer.chrome.com/docs/ai/prompt-api#sampling_parameters) says the web uses the sampling-mode origin trial and extensions retain numeric parameters. Unsupported browser fields can be ignored, so deterministic sampling cannot be guaranteed for every judge browser or model version. The semantic prompt and local checks do not depend on sampling support.

Drafting first checks availability with the same text/image expected inputs and rejects every state except `available` with `OnDeviceUnavailableError`, before calling the SDK's generator. A `downloadable` or `downloading` model therefore immediately follows the UI's rules fallback and cannot start a download from the draft action. Only the explicit Prepare action calls `initializeDeviceModel`. Optional model self-check likewise probes readiness first and skips inference when unavailable, recording that only local checks ran. Both on-device generation calls have a **45-second timeout** (`ON_DEVICE_TIMEOUT_MS`) that throws the shared unavailable error. The timeout releases the UI; it does not assert that the SDK has cancelled underlying native inference. Readiness probes themselves remain bounded at five seconds.

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
