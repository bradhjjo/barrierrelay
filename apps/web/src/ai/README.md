# AI and privacy boundary

`createAiPipeline({app, getConfig})` implements the coordinator-owned `AiPipeline` contract. Import `OnDeviceUnavailableError` from this module or `contracts.ts`: both exports reference the same class.

Raw facts and optional PNG use Firebase AI Logic **ONLY_ON_DEVICE**, never a prefer mode. The local Prompt API response constraint is the JSON schema in `draft-prompt.json`. `prompts.ts` imports that same source; Gate 0 reads it directly, so the text and schema cannot drift. Responses are parsed and checked for supported types, existing refs, length limits, step count and contact/card patterns. Routing uses `response.inferenceSource`; absent/unknown inference locations are rejected rather than guessed. `api-not-enabled` becomes the shared unavailable error. `prepareOnDevice` must be invoked directly from a user gesture; progress is delegated to `initializeDeviceModel`. Readiness probes time out after five seconds and never start downloads.

The rules fallback is local code, confidence low, and does not copy the user's note into its output. It maps collector rule IDs, examines unnamed inputs, and uses Escape/Tab evidence plus the note for suspected traps. The unit suite scores **10/10 broken fixtures**, no failures. Self-check always runs deterministic validation first, then asks a local structured yes/no question when Nano is available. If Nano is absent the log explicitly says only deterministic checks ran and manual review is needed.

`redact` constructs a new allowlisted payload; it never serializes the capture or userNote. Visible text, focus trail and path require individual approvals. It strips nonallowlisted attributes and re-scans every retained text value for email/phone/card patterns. The exact URL origin (scheme, hostname, port) is retained to identify the site, including localhost/IP hosts. Numeric geometry is retained. `bytes` measures UTF-8 JSON without the `bytes` field itself, as required by the contract. Pattern filtering cannot identify arbitrary names in approved page text: the reporter still reviews every retained field; userNote itself is never shared.

## Grounding and structured output decision

Checked official docs on 2026-11-18:

- [Firebase Google Search grounding](https://firebase.google.com/docs/ai-logic/grounding-google-search) lists `gemini-3.5-flash-lite`, describes tools and candidate `groundingMetadata.groundingChunks[].web` sources.
- [Firebase structured output](https://firebase.google.com/docs/ai-logic/generate-structured-output) documents `generationConfig.responseMimeType` and `responseSchema`.
- [Gemini structured output with tools](https://ai.google.dev/gemini-api/docs/structured-output#tools) (redirects to Google AI Studio) explicitly supports built-in tools plus structured output for Gemini 3 and 4 series; the feature is preview.
- [Firebase hybrid structured output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output) documents the separate on-device `promptOptions.responseConstraint`.

The default Gemini 3.5 Flash-Lite request therefore combines Google Search with JSON responseSchema in one call. If Remote Config chooses an older model with grounding enabled, use prompt-only JSON instructions in that single call and the same output validator; do not retry silently or consume a second quota unit. With grounding disabled all models use responseSchema. Firebase Schema optional fields must use the containing object's `optionalProperties`; adding `optional:true` to a string schema passes SDK typings but is sent as an invalid backend field.

Only actual candidate-zero grounding chunks become `FixPlan.sources`. Any model-authored sources are discarded; absent grounding yields an empty array. URLs are limited to HTTP(S) and deduplicated. Enabling the tool does not guarantee that the model searches. Calls, including failed attempts, reserve the configured session budget before awaiting, preventing concurrent clicks from bypassing it. The budget is per pipeline instance, not a billing/security control; production quota enforcement belongs on the backend.

**Integration limitation:** the current `FixPlan` contract exposes source links but has no field for `groundingMetadata.searchEntryPoint.renderedContent` or inline grounding supports. Official Firebase docs require rendering returned Google Search suggestions. The coordinator must extend the contract/UI before shipping grounded responses that include a search entry point; do not treat the current source list alone as that complete rendering integration.

## Manual cloud smoke

From `apps/web`, run:

```sh
npx vite --host 127.0.0.1 --port 5174 --strictPort
```

Open `http://127.0.0.1:5174/scripts/cloud-smoke.html` and activate **Send one fixture report** with the keyboard or pointer. This uses fixture 02, a rules draft and all sharing approvals off. The module imports the existing Firebase initializer, so Vite loads the existing local App Check debug-token configuration automatically. Never display/copy that token or the environment file. The button disables after one attempt, and results/status are accessible with a live region and visible keyboard focus. Avoid source edits while the request is pending because Vite HMR reloads the page.

### Actual real API smoke (2026-11-18)

Three attempts total; no further real API requests were made:

1. First click occurred while prompt development continued; Vite HMR reloaded the page before a result was captured. Counted conservatively as one API attempt.
2. Captured **HTTP 400**, 52 ms, SDK `AI/fetch-error`: `Invalid JSON payload received. Unknown name "optional"` in the fix schema. Corrected to `optionalProperties` before the last attempt.
3. Corrected request reached Firebase AI Logic and returned **HTTP 429**, **349 ms**, SDK `AI/fetch-error`: `You exceeded your current quota, please check your plan and billing details.` Error details had `@type: type.googleapis.com/google.rpc.Help` and links to Gemini API quota documentation. No successful candidates, no grounding metadata; **0 sources**. The error was quota-related, not an App Check rejection. Raw field-name capture remained null because there was no successful response.

The final error receipt is stored locally at `gate0/out/cloud-smoke.json` (ignored output). Mock tests verify a successful SDK response shape: `response.text()`, `response.inferenceSource: 'in_cloud'`, and `response.candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}`. Successful real cloud inference and actual grounding source count remain unverified until project quota/billing is available. No token, request headers or App Check responses were inspected or logged by this script.

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

After the coordinator downloaded Nano on an unmetered network, the final shared prompt completed all 40 requested inferences. Text-only: type **19/20**, ref **19/20**, schema **20/20**, broken type **10/10**, fixed none **9/10**, median **6002 ms**. Text+region PNG: type **18/20**, ref **18/20**, schema **20/20**, broken type **10/10**, fixed none **8/10**, median **4759 ms**. See `gate0/NANO_NOTES.md` for methodology and limitations; `gate0/out/eval.json` contains every draft and the exact prompt snapshot. Current unit validation: **15 tests pass**, TypeScript passes.
