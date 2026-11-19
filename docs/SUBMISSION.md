# BarrierRelay — Devpost submission draft

**Tagline:** Private capture. Shared repair.

**Track:** Best Web/Chrome App, #BuildHybridAI.

**Submission deadline:** November 30, 2026, 14:00 Pacific Time, as recorded in [PROJECT.md](PROJECT.md). TODO(verify): confirm the final Devpost deadline/time zone and eligibility against the official event page before submitting.

**Live demo:** https://barrierrelay-lpun3.web.app — deployed on Firebase Hosting with production reCAPTCHA Enterprise App Check. **Judge quick-start:** [unnamed payment-button report](https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken), no extension required. Without a local model, the app labels its rules-only draft; **Prepare private on-device AI** downloads Nano on supported desktop Chrome with Prompt API and an unmetered connection. TODO(verify): insert public source-repository and final captioned-video URLs.

> Editorial note: this is submission copy grounded in the current code. Complete the evidence checklist below and remove editorial TODOs only after verification. Do not present a deterministic `demo=1` walkthrough as AI inference.

## Inspiration

An accessibility barrier is often a blocked moment, not an audit report: “I am trying to pay, but my screen reader only says ‘button.’” The person who encounters that barrier should not have to reverse-engineer the page, expose a private screenshot to a remote service, or translate their experience into a developer ticket.

This is not a rare class of problem. The [WebAIM Million 2026 report](https://webaim.org/projects/million/) found detectable WCAG failures on **95.9% of tested home pages**. **51% of home pages** had missing form input labels, and **30.6%** had empty buttons. These are automated findings on home pages—not a claim that every page was fully audited or that those percentages describe individual controls.

We built BarrierRelay to bridge the gap between experiencing a barrier and getting it repaired, while keeping the reporter in control of what leaves their device.

## What it does

BarrierRelay starts where the user is now. A keyboard shortcut or toolbar action captures the region around the focused control. An accessible in-page dialog asks what the user was trying to do and which assistive context matters. It can include a short trail of navigation key names and focus references without recording typed text.

The web app turns that local context into an editable report. Its on-device path uses Gemini Nano for a structured draft; if Nano is unavailable, a clearly labeled rules-only fallback keeps the reporting workflow usable without silently sending the raw capture to cloud AI. The user reviews the draft, runs a self-check, and inspects the redacted JSON that will be shared. The screenshot and original free-text note are not part of the cloud payload or stored ticket.

Only then does the user request a cloud fix plan: WCAG-related criteria, an explanation of the cause, illustrative repair code, a verification checklist, and any actual grounding sources returned by the API. The user can create a shareable Firestore ticket. A collaborator can acknowledge it, mark it fixed, and request a re-check. Synthetic broken/fixed examples make the whole loop easy to explore without an extension.

The prototype addresses unlabeled inputs, unnamed buttons and links, keyboard-reachability problems, and missing focus indicators. Keyboard-trap assessment also uses reporter context and navigation evidence. It does not claim to detect every barrier or certify WCAG compliance. Generated code is guidance, not an automatic patch.

## How we built it

### A hybrid capability split, not a cloud fallback

The Chrome Manifest V3 extension uses TypeScript, a shadow-DOM modal, the shared DOM collector, axe-core, and local screenshot cropping. It hands a session-only capture to the authorized web origin through one-time extension messaging. It does not upload a page to a server.

The Preact web app uses **Firebase AI Logic** with the Gemini Developer API backend. Private drafting selects **`InferenceMode.ONLY_ON_DEVICE`** and supplies facts plus the cropped image. We place the JSON Schema in **`onDeviceParams.promptOptions.responseConstraint`**, because the installed SDK's local adapter does not translate cloud `responseSchema` settings into local constraints. Application validation checks the result again.

Self-check combines **deterministic checks + an on-device consistency check** when the model is available. TODO(verify): add robustness evaluation numbers after the active self-check fix; no score is claimed yet. Preparation calls `initializeDeviceModel()` from a user gesture. When the local API is unavailable, the app can use local rules instead of changing to `PREFER_ON_DEVICE`, whose fallback would violate our raw-data boundary.

The UI shows a **Hybrid routing** table. Model entries derive their location from **`response.inferenceSource`**, not from an assumption about the requested mode. The table distinguishes On-device, Cloud, and Local code, with application elapsed time and approved-payload byte counts. Those counts are not total network-traffic measurements.

For the next capability, the app explicitly uses **`InferenceMode.ONLY_IN_CLOUD`**. The cloud fix-plan request receives only the reviewed, redacted application payload. It enables the **URL context tool (`urlContext`)** when Remote Config permits it, retrieving W3C WCAG 2.2 Understanding pages chosen deterministically from the barrier type. Source links come only from successful, recognized `urlContextMetadata` retrievals, never model-authored citation fields. This is a fixed-reference retrieval capability, not open-ended web search. The verified cloud smoke combined URL context and structured output in the same call ([SDK/tool decision](../apps/web/src/ai/README.md)).

### Firebase beyond inference

- **App Check:** reCAPTCHA Enterprise initializes in the browser; the supplied Firebase project enforces App Check for AI Logic. Development debug tokens stay in an ignored local env file.
- **Auth:** anonymous sign-in supports a low-friction reporter identity without an account form.
- **Firestore:** the approved report, fix plan, routing log, and lifecycle are persisted as a ticket. Rules restrict allowed fields, list access, content mutation, and status transitions.
- **Remote Config:** model selection, grounding toggle, a client-side cloud-call budget, and a rule-card version field are supplied with local defaults. The version field does not yet drive a rule-card distribution feature.
- **Hosting:** the app is deployed at [barrierrelay-lpun3.web.app](https://barrierrelay-lpun3.web.app), with production reCAPTCHA Enterprise App Check verified by the coordinator.

Anyone signed in anonymously who knows a ticket ID can read it and advance permitted status changes. This is a prototype sharing model, not proof of site ownership or production-grade role separation. Raw capture privacy and safe collaboration access are distinct concerns.

Source references: [pipeline](../apps/web/src/ai/pipeline.ts), [redaction](../apps/web/src/privacy/redact.ts), [UI](../apps/web/src/ui/App.tsx), [Firebase initialization](../apps/web/src/firebase.ts), [rules](../firestore.rules), [Remote Config](../apps/web/src/config.ts), and [architecture](ARCHITECTURE.md).

## Challenges we ran into

**The network, not the GPU, blocked the first Nano download.** During Gate 0 the browser's model manifest remained empty even though the machine was eligible. Debugging found that Chrome's component updater sent `updatedisabled: true` on the metered phone hotspot. We stopped download attempts rather than silently changing someone's network policy. The initial failure, diagnostic evidence, and SDK fallback tests are documented in [NANO_NOTES.md](../gate0/NANO_NOTES.md). After switching to an unmetered connection, the model downloaded and real Nano fixture evaluation completed. A later real SDK run also proved offline on-device drafting; the initial failed probe remains a separate historical result.

**Retrieval had to fit the project's quota.** The coordinator measured a search-tool request failing with **HTTP 429**, while URL context plus the response schema returned **HTTP 200**. We now retrieve deterministic W3C reference pages rather than relying on an unavailable free-tier search quota ([measured decision](../apps/web/src/ai/README.md)).

**Local and cloud structured output are configured differently.** Merely configuring a cloud JSON response schema was insufficient for the local adapter. The explicit local `responseConstraint` and result validation became part of the design rather than an optional improvement.

**Privacy needs a real boundary.** “Use the small model first” is not enough if unavailability sends the same raw image to the cloud. We chose local-only drafting, an honest rules fallback, and a separately constructed sharing payload. Pattern-based redaction still has limits, so the user sees the JSON before choosing cloud processing.

**Accessibility is the interface, not just the subject.** A pointer-only region picker would exclude the users we are trying to help. The primary flow starts from keyboard focus, with a labeled modal, visible focus, focus wrapping, Escape/Close, and live status. Automated checks help, but do not substitute for testing with disabled users.

## Accomplishments that we're proud of

- A keyboard-first capture path that preserves a user's navigation context without recording typed characters.
- A concrete, inspectable separation between raw on-device context and approved cloud data.
- Firebase AI Logic local-only structured drafting and cloud-only, tool-enabled fix planning expressed as distinct code paths, with actual inference-source reporting.
- A reproducible extension integration test and a separate UI repair-loop test that clearly labels its deterministic AI substitute.
- A report that becomes a repair conversation: editable draft, explicit sharing preview, fix guidance, ticket status, and a scoped re-check.

### Measured evidence

| Real Nano mode | Barrier type | Target ref | Schema-valid | Broken types | Median |
| --- | --- | --- | --- | --- | --- |
| Text-only | 19/20 | 19/20 | 20/20 | 10/10 | 6.0 s |
| Text + region PNG | 18/20 | 18/20 | 20/20 | 10/10 | 4.8 s |

These rounded medians come from **6002 ms** and **4759 ms** in [the evaluation artifact](../gate0/out/eval.json), with methods in [Gate 0](../gate0/NANO_NOTES.md). The small synthetic test uses the direct Prompt API and includes session creation; it is not a Firebase SDK latency benchmark or a general accessibility accuracy claim. False positives on fixed pages remain.

The [real Firebase SDK offline draft](../tools/e2e/out/real-results.json) ran on-device with **0 capture bytes to cloud** and **0 AI network requests**. Separately, the [real URL-context cloud smoke](../gate0/out/cloud-smoke.json) returned a validated plan in **2.9 s**, with **2 W3C sources** and **schemaValid: true**. The latest real E2E artifact stops at self-check, so **TODO(verify): rerun the complete real hybrid repair loop after the active fix before claiming a Firestore ticket reached `verified` in that run**.

## What we learned

Hybrid AI is most useful when it separates capabilities and trust boundaries: sensitive observation stays local, while a reviewed description can benefit from cloud tools. Readiness, model download, inference routing, and application connectivity are different states and need different UI language.

We also learned to distinguish evidence from intent. A stubbed unavailable-model test proves fallback behavior, not Nano quality. A rules-only demo proves the repair workflow, not cloud grounding. A local rule re-check can confirm that a reported issue is no longer detected, but it cannot establish WCAG conformance or prove that a site owner made the right repair.

## What's next

Run disability-led screen-reader and keyboard usability sessions, strengthen live-control matching across re-captures, add authenticated collaboration roles and abuse controls, and provide a consent-aware retention/deletion workflow. Extend the completed synthetic draft evaluation with harder cases, evaluate the active self-check robustness fix, retain reproducible artifacts, and broaden browser/device coverage. These extensions are plans, not shipped results.

## Built with

Firebase · Firebase AI Logic · Gemini Nano · Gemini · URL context · App Check · reCAPTCHA Enterprise · Firebase Authentication · Cloud Firestore · Firebase Remote Config · Firebase Hosting · Chrome Extensions / Manifest V3 · TypeScript · Preact · Vite · axe-core · dom-accessibility-api · esbuild · Vitest · Puppeteer

Dependency versions and licenses: [package-lock.json](../package-lock.json) and [NOTICE](../NOTICE).

## Submission evidence checklist

- Completed: hosted deployment and production reCAPTCHA Enterprise App Check, real Nano draft evaluation, SDK offline/on-device draft, and a separate validated URL-context cloud smoke. Sources and scope are listed in [architecture evidence](ARCHITECTURE.md#evidence-and-release-gates).
- TODO(verify): publish the source repository and captioned video links, and retain/distribute the ignored evaluation and smoke artifacts with the submission evidence.
- TODO(verify): complete the post-fix real E2E; fill final cloud latency, successful W3C retrieval count, and real Firestore `verified` ticket evidence only after the rerun. Existing later-stage screenshot filenames are not a completion artifact.
- TODO(verify): publish self-check robustness evaluation numbers. Until then describe only deterministic checks + on-device consistency check.
- TODO(verify): test the final keyboard/screen-reader flow with an actual screen reader, including the fixture's announcement; automated accessibility checks alone do not establish this.
- TODO(verify): produce and review the captioned video, verify the event's official deadline and requirements, and remove only the TODOs supported by completed evidence.
