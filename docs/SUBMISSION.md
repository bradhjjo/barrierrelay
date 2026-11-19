# BarrierRelay — Devpost submission draft

**Tagline:** Private capture. Shared repair.

**Track:** Best Web/Chrome App, #BuildHybridAI.

**Submission deadline:** November 30, 2026, 14:00 Pacific Time, as recorded in [PROJECT.md](PROJECT.md). TODO(verify): confirm the final Devpost deadline/time zone and eligibility against the official event page before submitting.

**Links:** TODO(verify): public source repository URL, deployed live-demo URL, and final captioned video URL. `barrierrelay-lpun3.web.app` is the configured Hosting target, not a deployment claim. The local judge walkthrough is in [README.md](../README.md#judge-quick-start-no-extension-required).

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

A deterministic self-check examines the draft's target and consistency; an additional constrained **on-device** check runs when the model is available. Preparation calls `initializeDeviceModel()` from a user gesture. When the local API is unavailable, the app can use local rules instead of changing to `PREFER_ON_DEVICE`, whose fallback would violate our raw-data boundary.

The UI shows a **Hybrid routing** table. Model entries derive their location from **`response.inferenceSource`**, not from an assumption about the requested mode. The table distinguishes On-device, Cloud, and Local code, with application elapsed time and approved-payload byte counts. Those counts are not total network-traffic measurements.

For the next capability, the app explicitly uses **`InferenceMode.ONLY_IN_CLOUD`**. The cloud fix-plan request receives only the reviewed, redacted application payload. It enables **Google Search grounding** when Remote Config permits it, and asks for authoritative W3C WCAG guidance. Citation links come from the API's grounding metadata, not invented source fields in model JSON. We do not implement URL-context retrieval or enforce a W3C-only search allowlist.

### Firebase beyond inference

- **App Check:** reCAPTCHA Enterprise initializes in the browser; the supplied Firebase project enforces App Check for AI Logic. Development debug tokens stay in an ignored local env file.
- **Auth:** anonymous sign-in supports a low-friction reporter identity without an account form.
- **Firestore:** the approved report, fix plan, routing log, and lifecycle are persisted as a ticket. Rules restrict allowed fields, list access, content mutation, and status transitions.
- **Remote Config:** model selection, grounding toggle, a client-side cloud-call budget, and a rule-card version field are supplied with local defaults. The version field does not yet drive a rule-card distribution feature.
- **Hosting:** a web deployment target is configured; the final hosted release remains a verification step.

Anyone signed in anonymously who knows a ticket ID can read it and advance permitted status changes. This is a prototype sharing model, not proof of site ownership or production-grade role separation. Raw capture privacy and safe collaboration access are distinct concerns.

Source references: [pipeline](../apps/web/src/ai/pipeline.ts), [redaction](../apps/web/src/privacy/redact.ts), [UI](../apps/web/src/ui/App.tsx), [Firebase initialization](../apps/web/src/firebase.ts), [rules](../firestore.rules), [Remote Config](../apps/web/src/config.ts), and [architecture](ARCHITECTURE.md).

## Challenges we ran into

**The network, not the GPU, blocked the first Nano download.** During Gate 0 the browser's model manifest remained empty even though the machine was eligible. Debugging found that Chrome's component updater sent `updatedisabled: true` on the metered phone hotspot. We stopped download attempts rather than silently changing someone's network policy. The initial failure, diagnostic evidence, and SDK fallback tests are documented in [NANO_NOTES.md](../gate0/NANO_NOTES.md). Later coordinator probes confirmed real Nano image and constrained-JSON inference; that does not retroactively turn the initial failed probe into a passing offline application test.

**Local and cloud structured output are configured differently.** Merely configuring a cloud JSON response schema was insufficient for the local adapter. The explicit local `responseConstraint` and result validation became part of the design rather than an optional improvement.

**Privacy needs a real boundary.** “Use the small model first” is not enough if unavailability sends the same raw image to the cloud. We chose local-only drafting, an honest rules fallback, and a separately constructed sharing payload. Pattern-based redaction still has limits, so the user sees the JSON before choosing cloud processing.

**Accessibility is the interface, not just the subject.** A pointer-only region picker would exclude the users we are trying to help. The primary flow starts from keyboard focus, with a labeled modal, visible focus, focus wrapping, Escape/Close, and live status. Automated checks help, but do not substitute for testing with disabled users.

## Accomplishments that we're proud of

- A keyboard-first capture path that preserves a user's navigation context without recording typed characters.
- A concrete, inspectable separation between raw on-device context and approved cloud data.
- Firebase AI Logic local-only structured drafting and cloud-only, tool-enabled fix planning expressed as distinct code paths, with actual inference-source reporting.
- A reproducible extension integration test and a separate UI repair-loop test that clearly labels its deterministic AI substitute.
- A report that becomes a repair conversation: editable draft, explicit sharing preview, fix guidance, ticket status, and a scoped re-check.

These are implemented features and test tools, not a claim that every real-model or production deployment acceptance check is complete. See the release checklist below.

## What we learned

Hybrid AI is most useful when it separates capabilities and trust boundaries: sensitive observation stays local, while a reviewed description can benefit from cloud tools. Readiness, model download, inference routing, and application connectivity are different states and need different UI language.

We also learned to distinguish evidence from intent. A stubbed unavailable-model test proves fallback behavior, not Nano quality. A rules-only demo proves the repair workflow, not cloud grounding. A local rule re-check can confirm that a reported issue is no longer detected, but it cannot establish WCAG conformance or prove that a site owner made the right repair.

## What's next

Run disability-led screen-reader and keyboard usability sessions, strengthen live-control matching across re-captures, add authenticated collaboration roles and abuse controls, and provide a consent-aware retention/deletion workflow. Evaluate real-model drafts against the synthetic ground truth, retain reproducible evaluation artifacts, and broaden browser/device coverage. These are plans, not shipped functionality.

## Built with

Firebase · Firebase AI Logic · Gemini Nano · Gemini · Google Search grounding · App Check · reCAPTCHA Enterprise · Firebase Authentication · Cloud Firestore · Firebase Remote Config · Firebase Hosting (configured target) · Chrome Extensions / Manifest V3 · TypeScript · Preact · Vite · axe-core · dom-accessibility-api · esbuild · Vitest · Puppeteer

Dependency versions and licenses: [package-lock.json](../package-lock.json) and [NOTICE](../NOTICE).

## Submission evidence checklist

- TODO(verify): publish the source repository, deploy Hosting, validate production-domain App Check, and insert final demo/source/video links.
- TODO(verify): retain raw artifacts for the coordinator's later real Nano probes; do not use individual timings as an application benchmark. The supplied observations and their scope are listed in [architecture evidence](ARCHITECTURE.md#evidence-and-release-gates).
- TODO(verify): record a real Firebase AI Logic text+image draft with constrained JSON and a displayed On-device routing entry; record the preloaded-tab offline version without `demo=1` or a rules substitute.
- TODO(verify): record a real cloud fix plan using the configured model, with actual Google Search grounding metadata and working returned sources. Do not replace missing citations with hand-written ones.
- TODO(verify): test the final keyboard/screen-reader flow with an actual screen reader, including the fixture's announcement; automated accessibility checks alone do not establish this.
- TODO(verify): produce and review the captioned video, verify the event's official deadline and requirements, and remove only the TODOs supported by completed evidence.
