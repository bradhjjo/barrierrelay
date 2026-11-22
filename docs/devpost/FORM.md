# BarrierRelay — Devpost paste-ready package

## Verification scope and sources

Checked **2026-11-19**, using `curl -L` with a desktop browser User-Agent:

- **[R] [Official rules](https://firebasehybridaihackathon.devpost.com/rules)**, especially §§3–7, 8–10, 12–16, 22–23.
- **[H] [Event overview / Requirements / What to Submit](https://firebasehybridaihackathon.devpost.com/)**. Requirements are embedded on this page; `/requirements` returns a not-found page.
- **[D] [Devpost: Know Your Submission Steps](https://help.devpost.com/article/126-know-your-submission-steps)**: field inventory, maximum 25 Built with tags, thumbnail JPG/PNG/GIF ≤5 MB and recommended **3:2** ratio. The recommendation explicitly concerns the gallery thumbnail; this package also uses it for all supporting images.
- **[S] [Devpost: How to enter a submission](https://help.devpost.com/article/122-how-to-enter-a-submission)**: team, overview, details, additional details, final submission and confirmation.
- Implementation and claim sources: [README](../../README.md), [architecture](../ARCHITECTURE.md), [submission draft](../SUBMISSION.md), [AI pipeline](../../apps/web/src/ai/pipeline.ts), [Firebase initialization](../../apps/web/src/firebase.ts), [third-party notices](../../NOTICE).

**Important verification boundary:** the authenticated event submission form was not accessible. Devpost redirects `/software/new` to login. Public rules establish the required content, but do not expose the event's exact custom-question labels/options or a numeric project-tagline limit. The **34-character tagline below is deliberately short**; the representative must verify its acceptance/character counter in the live form before submitting. Do not claim a guessed 140/200-character limit is verified. Extra/custom-field responses below are prepared answers, not a claim that those exact questions appear. Personal eligibility/team fields must be completed privately by the representative, not invented in this document.

**Deadline verified:** November 30, 2026, **2:00 PM PST / 22:00 UTC**. Keep the working app available free of charge through **December 16, 2026, 2:00 PM PST**, when judging ends. [R §§4,6]

## 1. Manage team

Add every actual eligible contributor as a Devpost project member. Submitter type: select the actual **Individual / Team / Organization** status; a team/organization must appoint an authorized representative. Residence, eligibility, names, and invitations are representative-owned private form entries. Do not paste personal details into this public package.

## 2. Project overview — exact copy

### Project name

BarrierRelay

### Project tagline / elevator pitch

Report it privately. See it fixed.

### Thumbnail / cover

Upload [`cover.png`](cover.png), **1500 × 1000 PNG**, 3:2. It shows the real hybrid routing panel rather than an invented UI. Check the live form's crop preview. Source screenshot provenance is in [gallery/README.md](gallery/README.md).

## 3. Project details

### About the project / Project story — paste the following Markdown

```markdown
## Inspiration

An accessibility barrier is often a blocked moment, not an audit report: “I am trying to pay, but my screen reader only says ‘button.’” The person encountering that barrier should not have to reverse-engineer the page, expose a private screenshot to cloud AI, or translate their experience into a developer ticket.

We built BarrierRelay to bridge the gap between experiencing a barrier and getting it repaired, while keeping the reporter in control of what leaves their device.

## What it does

BarrierRelay is a keyboard-first Chrome extension and web app. Focus a blocked control and use the extension shortcut or toolbar action to capture its region. An in-page dialog asks what you were trying to do and which assistive context matters. An optional navigation trail records navigation key names and focus references, not typed characters.

The web app turns this local context into an editable report. Gemini Nano drafts on-device through Firebase AI Logic. If Nano is unavailable, a clearly labeled rules-only path keeps reporting usable without sending the raw capture to cloud AI. Review the draft, run self-check, and inspect the redacted JSON before requesting cloud work. The screenshot and original free-text note are not included in the cloud payload or stored ticket.

Cloud Gemini then produces a WCAG-informed fix plan: related criteria, a cause explanation, illustrative repair code, a verification checklist, and sources actually returned by the URL context tool. Create a shareable Firestore ticket, acknowledge it, mark it fixed, and request a scoped re-check. Synthetic broken/fixed examples let judges explore the workflow without installing the extension.

This prototype covers selected labeling, naming, keyboard-reachability, and focus problems. It is not a WCAG compliance certifier. Generated code is guidance, not an automatic patch. A fixed-fixture verification is synthetic, not proof that a live website was repaired.

## How we built it

The Manifest V3 extension uses TypeScript, a shadow-DOM dialog, a shared DOM collector, axe-core, and local screenshot cropping. A one-time browser-local message hands the capture to an authorized web origin; the extension does not upload it to a server.

The Preact/Vite web app uses Firebase AI Logic with the Gemini Developer API backend. Private drafting explicitly selects `InferenceMode.ONLY_ON_DEVICE`, with text/image input and JSON Schema in `onDeviceParams.promptOptions.responseConstraint`. Application validation checks the result again. Self-check combines deterministic checks with an on-device consistency check when Nano is available. Preparing the model calls `initializeDeviceModel()` from an explicit user gesture.

For a different capability, fix planning explicitly selects `InferenceMode.ONLY_IN_CLOUD`. It receives only the reporter-reviewed, redacted payload. When enabled by Remote Config, URL context retrieves W3C WCAG Understanding pages selected deterministically from the barrier type. We retain sources only from successful, recognized URL-context retrieval metadata, not model-authored citation fields. This is fixed-reference retrieval, not open-ended web search.

The Hybrid routing table derives model location from `response.inferenceSource`, showing On-device, Cloud, or Local code, elapsed time, and approved-payload bytes. Those bytes are application-data accounting, not total network traffic. Private drafting does not silently fall back to cloud: unavailable Nano uses labeled local rules instead.

Firebase also supplies reCAPTCHA Enterprise App Check, anonymous Authentication, Firestore ticket storage and lifecycle rules, Remote Config, and Hosting. App Check is enforced for AI Logic in the supplied project. The prototype's sharing links are bearer-like: any anonymously signed-in user who knows a ticket ID can read it and advance permitted status changes. This is not verified site ownership or production-grade role separation.

Verification pass/fail is computed in the browser and written by the client. For verification, Firestore rules constrain status transitions and the submitted result shape, including no remaining target rule hits for `pass`; they do not independently run the check. Anyone signed in anonymously with the ticket link can change status through allowed transitions. `verified` is a client-reported, scoped check, not tamper-proof proof of a fix or WCAG conformance. Capture-local virtual refs also limit matching across live re-captures.

## Challenges we ran into

The network, not the GPU, blocked the first model download: Chrome refused to download Nano on a metered connection. Switching to an unmetered connection enabled real on-device evaluation; we kept preparation explicit rather than silently changing network policy.

Local and cloud structured-output configuration differed. Cloud response-schema settings alone did not constrain the installed SDK's local adapter, so we added an explicit local response constraint and application validation.

Cloud retrieval had to fit the project's quota. A search-tool request failed with HTTP 429, while URL context plus structured output succeeded. We chose deterministic W3C references rather than claiming unavailable open-ended search.

Privacy required an actual boundary. We construct a separate sharing payload and show it before cloud processing. Pattern-based redaction is not a guarantee that every personal detail is removed, so reporter review remains essential.

## Accomplishments that we're proud of

We completed real Firebase AI Logic on-device drafting and a separate cloud URL-context fix plan, with execution-source reporting. A real SDK test drafted offline in an already-loaded tab with a prepared model, recording zero capture bytes to cloud and zero AI network requests. That does not mean the whole app or browser is network-free.

We also completed a real Firestore repair loop through a synthetic fixed-fixture verification, and an extension-to-app integration test with an honestly labeled rules-only draft. The gallery shows actual test screenshots, including On-device zero-cloud-byte entries alongside a Cloud payload-byte entry.

Most importantly, a report becomes a repair conversation: editable draft, explicit sharing preview, fix guidance, ticket status, and a scoped re-check. Automated tests and synthetic examples are not a substitute for disability-led usability testing.

## What we learned

Hybrid AI is useful when it separates capabilities and trust boundaries: sensitive observation stays local, while a reviewed description can benefit from cloud tools. Model readiness, model download, inference routing, and application connectivity are different states and need different UI language.

We learned to distinguish evidence from intent. A rules-only walkthrough proves the workflow, not Nano inference. A local rule re-check can show that a selected issue is no longer detected, but cannot establish accessibility or WCAG conformance.

## What's next

Run disability-led screen-reader and keyboard usability sessions, strengthen live-control matching across captures, add authenticated collaboration roles and abuse controls, and implement consent-aware retention/deletion. Expand the synthetic evaluations and browser/device coverage. These are plans, not shipped features.
```

### Built with tags — enter these separately (20; maximum 25 [D])

`Firebase`, `Firebase AI Logic`, `Gemini Nano`, `Gemini`, `App Check`, `reCAPTCHA Enterprise`, `Firebase Authentication`, `Cloud Firestore`, `Firebase Remote Config`, `Firebase Hosting`, `Chrome Extensions`, `TypeScript`, `Preact`, `Vite`, `axe-core`, `dom-accessibility-api`, `esbuild`, `Vitest`, `Puppeteer`, `URL context`

Use the closest existing autocomplete spelling if Devpost normalizes a tag. Tags do not claim Android/iOS support.

### Try it out links

- **Live app:** https://barrierrelay-lpun3.web.app
- **Judge quick-start:** https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken
- **Source code:** https://github.com/bradhjjo/barrierrelay
- **Testing instructions (after repository publication):** https://github.com/bradhjjo/barrierrelay/blob/main/docs/devpost/JUDGES.md

**Publication gate:** the repository must be **public before submission**, with its Apache-2.0 license detected in GitHub's About section. An unauthenticated GitHub API check on 2026-11-19 returned 404; that does not distinguish a private repository from a missing repository. Confirm the URL, default branch, required tracked assets, and judge access after publication. Do not submit a dead instructions link if the default branch is not `main`.

### Video demo URL

`https://www.youtube.com/watch?v=we2QRjlxMmM` (uploaded 2026-11-19 as Unlisted; switch to Public together with the GitHub repository before pressing Submit)

Upload to **YouTube**, publicly visible, showing the working Web/Chrome app, **≤3:00**, in English or with English subtitles. Devpost generally embeds Vimeo too, but this event specifically requires YouTube. A placeholder is not a completed submission. See [VIDEO_SCRIPT.md](../VIDEO_SCRIPT.md).

### Image gallery — upload in this order

| File | Suggested Devpost caption / alt description |
| --- | --- |
| [01-capture.png](gallery/01-capture.png) | Extension capture of a synthetic checkout's unnamed payment control; navigation context stays local. |
| [02-private-draft.png](gallery/02-private-draft.png) | Real on-device Nano draft, editable before sharing; generated wording requires human review. |
| [03-sharing-preview.png](gallery/03-sharing-preview.png) | Inspect the approved JSON and optional sharing fields before requesting cloud work. |
| [04-cloud-plan.png](gallery/04-cloud-plan.png) | Real cloud repair plan with illustrative code, verification checks, and returned W3C sources. |
| [05-hybrid-routing.png](gallery/05-hybrid-routing.png) | Real routing panel: on-device 0 cloud bytes; cloud 1892 approved-payload bytes, not total traffic. |
| [06-verification.png](gallery/06-verification.png) | Real ticket lifecycle ends with a synthetic fixed-fixture check, not a WCAG certification. |

All are 1500 × 1000 PNGs. Their historical screenshot run is not the same as the latest `real-results.json`; do not relabel the visible 1892 bytes/10991 ms as the latest receipt's 1632 bytes/7601 ms.

## 4. Additional details / hackathon-specific answers

**Representative action:** compare every live question against this answer bank; exact field labels, required flags, and any additional questions remain pending authenticated-form review. [D] explicitly says these vary by event.

### Platform / category

Web (Chrome)

### Prize category / categories

Best Web/Chrome App. Also eligible for the overall Grand Prize, 1st Runner Up, and 2nd Runner Up consideration; no Android or iOS entry is claimed. The rules allow one grand prize and up to one “Best of” category prize. Do not select unsupported platforms simply to seek multiple prizes. [R §§8–9]

### How does the project use Firebase AI Logic / hybrid inference?

BarrierRelay calls Firebase AI Logic at runtime for local-only Gemini Nano drafting and consistency checking (`ONLY_ON_DEVICE`) and a separate cloud-only repair-planning capability (`ONLY_IN_CLOUD`). The cloud path uses URL context on deterministic W3C reference pages when enabled. The reporter approves a redacted payload first; raw captures never silently fall back to cloud. Unsupported browsers receive an explicitly labeled local rules draft, not a claimed Nano result. Routing badges use the returned `response.inferenceSource`. See `apps/web/src/ai/pipeline.ts` and `docs/ARCHITECTURE.md`.

**Interpretation to confirm:** [H]'s introduction describes automatic cloud fallback, but [R §6] does not explicitly require a particular `InferenceMode` or automatic raw-prompt fallback. This project deliberately splits local/cloud capabilities for privacy. If the live form requires automatic fallback, do not falsely answer yes: ask the organizer whether the capability split qualifies.

### App Check enabled? / Firebase products used

Yes. The hosted web app initializes reCAPTCHA Enterprise App Check and the supplied Firebase project enforces it for Firebase AI Logic. We also use anonymous Authentication, Cloud Firestore, Remote Config, and Hosting. No debug token or secret is required from judges, and none belongs in the form. Firestore App Check enforcement is not claimed.

### Code repository URL / license / public availability

https://github.com/bradhjjo/barrierrelay

Apache License 2.0 (`LICENSE`), with third-party notices in `NOTICE`. Public availability: **pending representative publication and unauthenticated verification**; only select “Yes” after checking.

### Testing instructions

Open https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken — no login form or extension is required. Click Create private draft; without Nano, the result is labeled rules-only. Review/edit the draft, run self-check, inspect the shared JSON, choose Get a fix plan, then Create shareable ticket. Follow the owner link, Acknowledge, Mark fixed, and Verify fix using the paired synthetic fixture. Cloud planning and ticket storage require connectivity and available project quota. With supported desktop Chrome, prepare Nano using Prepare private on-device AI on an unmetered connection to exercise real on-device drafting. Full browser, flags, extension, and demo-mode instructions are in docs/devpost/JUDGES.md. Do not submit sensitive information; links allow any signed-in holder to read/update permitted status.

### New or existing project / work completed during the submission period

**Pending representative verification against project history.** Do not assert new-project status or dates from file contents alone. After confirming the history, use the applicable version below and remove the other:

- **New project:** “New project created during the submission period. We built the keyboard-first extension capture/handoff, Firebase AI Logic local drafting and cloud fix planning, payload review/redaction, routing display, Firestore repair-ticket workflow, synthetic fixtures, evaluation tools, and hosted demo.”
- **Existing project:** “Existing project significantly updated during the submission period. [REPLACE with a verified dated list of new work and disclose the pre-existing base.] [If previously publicly used, describe its prior core value and how it contributes to this submission; usage figures are optional.]”

### Pre-existing work / third-party integrations / AI coding tools

We use third-party libraries and developer services, including Firebase, Preact, Vite, axe-core and dom-accessibility-api. Resolved dependencies are recorded in package-lock.json, and licenses/attributions in NOTICE. The synthetic checkout fixtures are demonstration data, not customer reports. [Representative: add any other pre-existing code/assets and the actual AI coding assistants/tools used; verify authorization and provenance before submitting.]

### Eligibility, submitter identity, residence, declarations, developer account ID

**Representative completes privately with accurate information.** Do not reuse project IDs as a developer account ID or infer eligibility from this repository. Check all members, employer consent if applicable, and the event's legal terms. No private account identifiers are included in this package.

## 5. Complete rule-to-evidence checklist

“Met” refers to this package/current implementation unless a narrower scope is stated. Pending items name the responsible role. This is an entry-compliance checklist, not a legal eligibility certification.

| Requirement / rule source | Status and evidence / owner |
| --- | --- |
| Agree to official rules and incorporated Devpost terms; register a Devpost account; complete all required fields and final Submit (§§1,5,22) | **Pending — representative:** authenticate, review terms, complete actual form, click Submit and retain Submitted confirmation [S]. |
| Age of majority (Taiwan ≥20), permitted residence, no export/sanctions restrictions; Internet access as of Nov 11 (§3) | **Pending — each entrant / representative:** verify privately; exclusions include Brazil, Quebec, Crimea, Russia, Italy, Syria, Sudan, Belarus, Cuba, Iran, North Korea, and other applicable sanctioned locations. |
| No disallowed employee/contractor/family/household/government/conflict status (§3) | **Pending — each entrant / representative:** verify the complete eligibility clause, not just country/age. |
| Employer/organization knowledge, consent, internal-policy/work-for-hire compliance (§3) | **Pending — representative:** confirm if applicable; mark inapplicable only after checking. |
| All team members eligible and added; authorized representative (§6 Project Team) | **Pending — representative:** finalize actual Devpost team. |
| Submit during Nov 11 1:30 PM PT–Nov 30 2 PM PT; respect deadline and post-deadline modification limits (§§4,7) | **Pending — representative:** final submission by verified deadline; freeze judged revision, obtain written permission for exceptional changes. |
| Gen-AI app uses Firebase AI Logic and supported Firebase products (§6 What to Create) | **Met:** runtime model calls in pipeline.ts; Auth, App Check, Firestore, Remote Config and Hosting documented in architecture. |
| At least one supported platform selected: Web/Chrome with local Nano through Firebase AI Logic (§6) | **Met (implementation):** Web app + MV3 extension and real Nano receipts; **pending — representative:** select Web (Chrome) in form. Rules call the model “Gemini Nano 4”; do not claim independently measured model-generation identity beyond Chrome/Firebase's exposed runtime. |
| App Check required; debug tokens permitted (§6) | **Met:** production reCAPTCHA Enterprise initialization and coordinator-verified AI Logic enforcement; no token published. |
| Successful installation and consistent running matching text/video (§6 Functionality) | **Met (documented test runs):** README and architecture evidence ledger; **pending — representative:** final public build/video consistency check, supported browser coverage and uptime. Earlier transient native failures remain disclosed. |
| New or significantly updated after start; disclosure of pre-existing work; summary of period work (§6 New & Existing Projects) | **Pending — representative:** verify dates/history and finish the applicable answer above. Dependencies disclosed in NOTICE. |
| Existing publicly used app: explain prior core value; usage optional (§6 Submission Requirements) | **Pending — representative:** determine applicability and supply truthful prior-value text if needed. |
| Authorized third-party tools, data, SDKs and license compliance; original work/ownership/IP rights (§6 Third-Party Integrations, Submission ownership, Intellectual Property; §§12,15) | **Met (dependency inventory):** LICENSE, NOTICE, lockfile; **pending — representative:** attest actual ownership/permissions, asset provenance, required licenses and grants. |
| No prohibited financial/preferential sponsor/admin support or conflict (§6 Financial or Preferential Support) | **Pending — representative:** attest actual circumstances; optional event quota is not proof of eligibility. |
| Working project access, no charges/restrictions through judging end; private-site credentials if needed (§6 Testing) | **Met (access path):** hosted demo and no-login fixture instructions; **pending — operator:** keep app/project/quota usable through Dec 16 2 PM PST. No private-site password needed. |
| Nonstandard proprietary hardware access if requested (§6 Testing) | **Met (not applicable to current scope):** ordinary supported desktop Chrome, no special wearable/proprietary hardware. |
| English app and English materials or translations (§6 Language) | **Met (text/images):** English app/docs/gallery; **pending — video owner:** English narration/subtitles. |
| Multiple submissions unique and substantially different (§6 Multiple Submissions) | **Pending — representative:** attest against any other actual entries. |
| Description includes value proposition, functionality and how Firebase AI Logic is used (§6 Submission Requirements) | **Met:** paste-ready project story and hybrid answer above. |
| GitHub/GitLab URL, public repository, all needed code/assets/instructions and actual runtime Firebase AI Logic use (§6) | **Met (local implementation/instructions):** README and pipeline; **pending — repository owner:** publish correct URL and required tracked assets, then verify anonymously (API currently 404). |
| Open-source license file detectable/visible on repository page; Apache preferred (§6) | **Met (file):** Apache-2.0 LICENSE; **pending — repository owner:** verify GitHub license detection after publication. |
| Working-platform demonstration video, public YouTube URL, ≤3 minutes evaluated, English/subtitles (§6) | **Pending — video owner / representative:** record/review/upload public YouTube video and replace placeholder. |
| No production API keys, live project secrets, confidential data or PII in repo/form/instructions (§6 Testing) | **Met (new package):** no credentials or private identifiers; screenshots cropped to synthetic UI/routing; **pending — repository owner:** audit complete public history/assets before publication. |
| No offensive, illegal, infringing, privacy-violating or prohibited third-party endorsement/advertising content (§6 final prohibitions) | **Met (new copy/gallery):** neutral project UI, no claimed third-party endorsement; **pending — representative / video owner:** final full submission and footage rights review. |
| Sponsor evaluation/promotional license, privacy/publicity, warranties, indemnities and accurate information (§§12–16,22–23) | **Pending — representative / all entrants:** read and accept actual legal terms; no automatic acceptance asserted by this package. |
| Optional quota, if used: application windows, one account per entrant/project/sprint, four-day limit and fees (§5) | **Pending — project operator:** confirm applicability and actual account/billing arrangements; no quota/account claim or credential is included here. |
| Winner notification response within 3 business days; required verification within 10 business days; tax/forms/banking obligations (§§8–10) | **Pending — representative if selected:** monitor registered contact and comply privately; do not publish tax/identity documents. |
| Optional hosted URL, Google IDE, Firebase agent skills; multi-platform preferred (not mandatory) (§6; H) | **Met (hosted URL):** included; remaining items are recommendations, not claimed deliverables or eligibility blockers. |
| Actual live custom fields and numeric tagline limit (D/S; authenticated form) | **Pending — representative:** verify every live field, accepted 34-character tagline, platform options, consent and confirmation; capture no private form data in this public repo. |

### Final handoff

Do not submit until publication, video, eligibility/provenance, live custom-field review, and actual Submit confirmation are complete. Use the checklist as a truthful handoff, not as evidence that pending declarations have been satisfied.
