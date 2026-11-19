# Gate 0: Gemini Nano and Firebase AI Logic probe

Verified 2026-11-18 (America/Chicago), Chrome **158.0.8127.36**, Linux x86_64, Node 26.12.0. **Gate 0 did not pass:** no model was downloaded and no real Nano inference completed. The coordinator instructed this worker to stop download attempts after the metered hotspot cause was established. No other Chrome profile or process was changed; no credentials or real Firebase project were used.

## Reusable runner

`tools/nano/run.mjs` exports `runNano(input)`, `createNanoSession(options)`, `profilePath`, and `features`. A session's `run(inputOrArray)` serializes requests in one Chrome process and creates/destroys a fresh LanguageModel session per prompt. `close()` closes only that browser. CLI examples and imports are in `tools/nano/README.md`. Images use text+image expectedInputs and an image Blob; schemas use `prompt(..., {responseConstraint: schema})`. Results include text, optional parsed json, elapsed ms (creation + inference, including initial download), and availability.

Install dependencies from the repo root:

```sh
npm ci --prefix tools/nano
npm ci --prefix gate0/sdk-probe
```

Profile: `~/.cache/barrierrelay/chrome-nano`, outside Git. It was created by launching Chrome with that explicit user-data-dir. Chrome must be closed for this profile before another runner starts; do not run these commands concurrently against it.

The runner uses these **tested launch arguments**, which expose the API and eligible hardware but have **not** produced an available model on this network:

```text
/opt/google/chrome/chrome
--user-data-dir=/home/hero/.cache/barrierrelay/chrome-nano
--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,OptimizationGuideManifestBroker,OptimizationGuideModelExecution,OptimizationGuideModelDownloading,OptimizationHints,AIPromptAPI,AIPromptAPIMultimodalInput,AIPromptAPIStructuredOutput,AIPromptAPILegacyParams,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput
--no-first-run
--no-default-browser-check
--remote-debugging-port=0
```

Headless adds `--headless=new`; set `NANO_HEADFUL=1` for headful. Puppeteer **25.18.1** uses `ignoreDefaultArgs: true`, and the user-data-dir is also passed explicitly because ignoring all defaults removes Puppeteer's generated profile argument. This avoids defaults disabling OptimizationHints, background networking, extensions and component updates. `chrome://version` confirmed there was no `--disable-background-networking`, `--disable-component-update`, `--disable-field-trial-config`, or `--disable-sync`. Chrome also appended `--ozone-platform=wayland` and `--render-node-override=/dev/dri/renderD129` on headful launches.

Chrome 158 renamed the visible flags to **Prompt API** (`prompt-api@1`) and **Prompt API Multimodal Input** (`prompt-api-multimodal-input@1`). The older `prompt-api-for-gemini-nano` names migrate to these in Local State. `optimization-guide-on-device-model@2` was written while Chrome was stopped, but Chrome pruned it: that flag is absent from its supported flags list. Therefore the old “Enabled BypassPerfRequirement” lab value is not an effective setting on this build. Two subsequent profile launches were tried. Legacy feature names alone were insufficient; the modern `AIPromptAPI*` flags and enabled OptimizationHints removed the initial service-not-running condition.

The page uses a real Puppeteer/CDP mouse click on a button; `navigator.userActivation.isActive` was true. `LanguageModel.create` was called with a download monitor, also in a separate attempt without first awaiting availability. No downloadprogress event was observed. Numeric topK/temperature are legacy extension parameters in current Chrome documentation; the runner requests the legacy params feature when those options are used, but actual sampling behavior remains unverified.

## Blocking state and download diagnosis

| Check | Observed result |
|---|---|
| Headless with initial feature/default-argument attempt | LanguageModel exists; availability `unavailable`; `NotSupportedError: Unable to create a text session because the service is not running.` |
| Headful with Local State flags | Same initial failure |
| Headful with all Puppeteer defaults dropped and modern features | Availability promise remained pending; no download began |
| Disable ManifestBroker experiment | Still reported ManifestBrokerState; no model |
| Download time | **0 minutes of model download observed**; setup/diagnosis began around 22:56 local, verbose checks continued past 23:03; stopped on coordinator instruction |
| Availability `downloadable`, `downloading`, `available` | **미확인**: none returned during these attempts |
| Trivial text latency | **미확인**: no real model inference |
| Text + 64×64 red PNG latency | **미확인**: no real model inference; test asset is `gate0/sdk-probe/sample.png` |
| Schema-constrained real result | **미확인**: model unavailable |

Enable Chrome internal debugging pages by opening `chrome://chrome-urls` and clicking **Enable internal debugging pages**. This switch affects only this profile. The UI uses shadow DOM and `cr-button`, so reading only document.body.innerText misses most diagnostic content.

`chrome://on-device-internals`, Broker State:

```text
Broker Type: ManifestBrokerState
Performance Class: VeryHigh
Possible Capabilities: Image, Audio
Manifest Path: N/A
Manifest Loaded: false
Model crash count: 0/3
Enabled by feature flag / enterprise policy / user setting: true / true / true
Enough VRAM: true (8188 MiB actual, 3000 MiB required)
Device Capable: true
Enough disk space to install: true (~157536 MiB available, 20480 MiB required)
Assets / Use Cases / Models: empty
```

Verbose GPU logs selected **NVIDIA GeForce RTX 4070 Laptop GPU, Vulkan, discrete GPU** for the performance service. Actual inference GPU/CPU backend is **미확인** because Models is empty. Image capability is reported, but real image inference is **미확인**, not proven unsupported.

`chrome://components` contained **Optimization Guide On DeviceModels Manifest**, app ID **ceofaddefefcbblgcgnibnonglccbfja**, version **0.0.0.0**, status **Up-to-date**. The legacy **Optimization Guide On Device Model** (`fklghjjljmnfjoepjmlobpekiapffcja`) was absent. Repeated on-demand Check for update clicks and subsequent checks across more than two minutes did not install the manifest.

Diagnostic launch added:

```text
--enable-logging=stderr --v=2
--vmodule=*update*=2,*on_device_model*=2,*optimization_guide*=2
```

The originally requested `--v=0 --vmodule=*component_updater*=2,*update_client*=2,*on_device_model*=2,*optimization_guide*=2` showed task completion but omitted request_sender details; broadening to `*update*=2` captured this decisive exchange:

```json
{"appid":"ceofaddefefcbblgcgnibnonglccbfja","enabled":true,"version":"0.0.0.0","installsource":"ondemand","updatecheck":{"updatedisabled":true}}
{"appid":"ceofaddefefcbblgcgnibnonglccbfja","status":"ok","updatecheck":{"status":"noupdate","info":"disabled by client"}}
```

The server **was contacted successfully**. NetworkManager reports `wlo1` (Wi-Fi): **metered yes (guessed)**; the coordinator confirmed it is a phone hotspot. Chrome's exact revision `14d6f648e8cd7ad750a4044200ce94d3321be260`, `components/update_client/update_checker.cc:231`, sets updatedisabled when the component disallows metered connections and IsConnectionMetered() is true. `chrome/browser/component_updater/optimization_guide_on_device_model_installer.cc:390` disallows manifest updates on metered connections. This explains why ordinary components downloaded while this manifest did not.

No network settings were changed. If the user explicitly wants to allow a multi-GB download over this hotspot, the following **user-run** one-liner makes the active Wi-Fi connection unmetered and reapplies it (not executed here):

```sh
nmcli connection modify "$(nmcli -g GENERAL.CONNECTION device show wlo1)" connection.metered no && nmcli device reapply wlo1
```

Prefer switching to an actually unmetered connection, then retry the runner. Reset that connection to `connection.metered auto` afterward if appropriate. No working inference flags or timing can be claimed until that retry succeeds.

Local raw diagnostic evidence is under `~/.cache/barrierrelay/`: `headless.log`, `headful.log`, `headful-profile.log`, `tabs.txt`, `update-debug.log`, `update-debug2.log`, `flags3.txt`, `sdk-unavailable.txt`, `smoke-results.txt`. Logs contain only this dedicated profile's test activity. They are not required by the runner.

## Firebase SDK findings

Installed npm **firebase 13.4.0**, `@firebase/ai 3.1.0` (see package-lock for exact resolved dependencies), Vite **8.3.8**. The probe builds successfully with `npm run build --prefix gate0/sdk-probe`.

The actual browser imports `initializeApp`, `getAI`, `GoogleAIBackend`, `getGenerativeModel`, `InferenceMode`, `InferenceSource`, and `Schema`. It uses projectId `barrierrelay-probe`, apiKey `fake-api-key`, no real credentials, and calls `initializeDeviceModel` from its button event before generateContent. Text, text+PNG, and structured tests are implemented in `gate0/sdk-probe/main.js`.

All references below are relative to `gate0/sdk-probe/node_modules/@firebase/ai/dist/`:

| API / behavior | Exact evidence |
|---|---|
| `InferenceMode.PREFER_ON_DEVICE` | `ai-public.d.ts:1650`, value `prefer_on_device` |
| `ONLY_ON_DEVICE` | `ai-public.d.ts:1651`, value `only_on_device` |
| `ONLY_IN_CLOUD` | `ai-public.d.ts:1652`, value `only_in_cloud` |
| `PREFER_IN_CLOUD` | `ai-public.d.ts:1653`, value `prefer_in_cloud` |
| Hybrid options `mode`, `onDeviceParams`, `inCloudParams` | `ai-public.d.ts:1553`, fields at 1558, 1562, 1566 |
| `OnDeviceParams.createOptions`, `.promptOptions` | `ai-public.d.ts:2349` |
| `initializeDeviceModel(onDownloadProgress?)` | GenerativeModel method, `ai-public.d.ts:1118`; not a standalone named export |
| User gesture and readiness/fallback behavior | `ai-public.d.ts:1092`–1118 |
| Local structured constraint | `LanguageModelPromptOptions.responseConstraint`, `ai-public.d.ts:1816` |
| **Inference location exposed** | **`result.response.inferenceSource`**, `ai-public.d.ts:613` |
| Location values | `InferenceSource.ON_DEVICE = 'on_device'`, `.IN_CLOUD = 'in_cloud'`, `ai-public.d.ts:1668` |
| Schema builder used | `Schema.object` and `Schema.string`, `ai-public.d.ts:2612`, 2618 |

`inCloudParams.generationConfig.responseMimeType = 'application/json'` and `responseSchema = Schema.object(...)` configure the cloud side. For the local path the probe additionally sets `onDeviceParams.promptOptions.responseConstraint` to JSON Schema. SDK 13.4.0's local adapter does **not** translate the cloud generationConfig into a local response constraint: `esm/index.esm.js:1019`–1023 only forwards onDeviceParams.promptOptions. Treat setting only the cloud responseSchema as insufficient for constrained on-device output.

**Without a real project / without network: 미확인 for successful inference.** The source path suggests it should work once a model is available: `esm/index.esm.js:2558` selects only the local callback, `:1019` calls LanguageModel directly, and `:2691` creates the response locally. The real offline attempt stalled at initialization due to missing manifest; no successful local output was produced. This is a source-derived inference, not an end-to-end proof.

**Unavailable-model behavior was proven using the real SDK in headless Chrome with LanguageModel.availability stubbed to `unavailable`, and fetch intercepted before any cloud transmission.** Reproducible results are saved in `sdk-probe/unavailable-results.json`:

- All three ONLY_ON_DEVICE cases reject with `code: 'api-not-enabled'`, message `AI: Local LanguageModel API not available in this environment. (AI/api-not-enabled)`; no cloud request is attempted.
- PREFER_ON_DEVICE checks readiness; when it is not `available`, it immediately chooses cloud, not an awaited model download. The intercepted URL was `https://firebasevertexai.googleapis.com/v1beta/projects/barrierrelay-probe/models/gemini-2.5-flash:generateContent`. The intentional intercepted fetch rejection produced `code: 'error'` / `(AI/error)`. This is fallback proof, not a successful cloud response.
- Typings explicitly say to await initializeDeviceModel if the caller wants local readiness before generation. ONLY_ON_DEVICE never intentionally falls back to cloud.

## Validation and remaining work

Passed: runner syntax check; SDK production build; runtime SDK enum imports; unavailable/error/fallback behavior with interception; headless mocked runner text/image/schema batch with three fresh model sessions created and three destroyed. Mock runner output is **not Nano inference** and mock elapsed times are intentionally not reported as model latency.

Remaining: use unmetered network, complete the actual model download, rerun the three real Nano acceptance commands and all three offline SDK tests, measure text/image latencies, and record actual inference backend. No files outside worker ownership were fixed; other concurrent workers' root package/app/fixture changes were left alone. No commit was made.

Official references checked: [Firebase hybrid inference](https://firebase.google.com/docs/ai-logic/hybrid-on-device-inference?platform=web), [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api), [Chrome getting started](https://developer.chrome.com/docs/ai/get-started), and [Chromium update checker at the installed revision](https://chromium.googlesource.com/chromium/src/+/14d6f648e8cd7ad750a4044200ce94d3321be260/components/update_client/update_checker.cc).

## Real Nano results — BarrierRelay draft evaluation (2026-11-18)

The coordinator switched to an unmetered network, downloaded the model (about 4.0 GB) into the dedicated profile, and verified real text, image and schema-constrained inference before this evaluation worker began. This supersedes the earlier unavailable-model state; the metered-network diagnosis above remains historical evidence. Only one evaluator used the dedicated profile at a time.

`node gate0/eval/run-eval.mjs` completed **40 real Nano inferences**: all 10 broken/fixed fixture pairs in text-only and text+region-PNG modes. The application and evaluator share `apps/web/src/ai/draft-prompt.json`, imported by `prompts.ts`. The evaluator uses the direct Chrome Prompt API through `tools/nano/run.mjs`; it does not exercise the Firebase SDK transport. Availability was `available`. Each prompt used a new single-turn model session, destroyed by the runner afterward. No cloud calls were used for evaluation.

| Mode | Barrier type accuracy | Target ref accuracy | Schema-valid | Broken type | Fixed classified none | Median creation + inference |
| --- | --- | --- | --- | --- | --- | --- |
| Text only | 19/20 (95%) | 19/20 (95%) | 20/20 (100%) | 10/10 | 9/10 | 6002 ms |
| Text + region PNG | 18/20 (90%) | 18/20 (90%) | 20/20 (100%) | 10/10 | 8/10 | 4759 ms |

The first shorter prompt got broken types 10/10 in each mode but only 3/10 and 1/10 fixed pages correct. The final prompt explicitly prioritizes rule IDs and their exact refs, treats nonempty computed accessibleName as a valid name, distinguishes ordinary page Tab cycles from dialog traps, and gives a concrete `none` example. The initial output is preserved at `gate0/out/eval-initial.json`; final full drafts, prompt snapshot and metrics are in `gate0/out/eval.json`, with the printed table in `gate0/out/eval-console.txt`. All outputs contain synthetic fixture data only and are gitignored.

These figures meet the requested broken-type target but are a small synthetic evaluation. Some fixed pages still produce unsupported barrier claims; do not auto-submit a model draft. Deterministic and on-device self-check plus reporter review remain required. Timing is one sequential run with an already-downloaded model, includes session creation, and does not isolate model inference or hardware backend. The shorter image median does not establish a general performance advantage. Firebase on-device routing and unavailable/error cases are covered with mocks; successful real SDK Nano inference is still a separate integration check.

The local rules fallback scores **10/10 broken fixtures**, no failed cases, without AI. The AI/privacy unit suite passes **15 tests** and `npx tsc --noEmit -p apps/web` passes at this checkpoint. Real cloud smoke reached the API but ended with HTTP 429 quota exhaustion (349 ms, no candidates/grounding, zero sources); see `apps/web/src/ai/README.md` for its three-attempt record and grounding/schema decision. App Check did not block that final request.

### Cloud follow-up: URL context succeeds

The coordinator isolated the earlier 429 to Google Search free-tier grounding quota: the same model without tools returned 200, and URL context plus the JSON response schema also returned 200. The pipeline now uses URL context only against a deterministic map of W3C Understanding documents. Two real follow-up SDK smoke calls succeeded; the final validated plan took **2900 ms**, shared **1395 payload bytes**, and retained **2 SUCCESS retrieval sources** from URL context metadata. Its full JSON is in `gate0/out/cloud-smoke.json`; see `apps/web/src/ai/README.md` for the measured response shape and decision. This supersedes the earlier cloud-quota blocker for the current implementation; the Nano evaluation and its prompt are unchanged. The updated AI/privacy suite passes **17 tests** and TypeScript passes.
