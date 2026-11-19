# BarrierRelay — project brief (coordinator-owned)

Hackathon: #BuildHybridAI 2026 (Devpost). Deadline 2026-11-30 14:00 PT. Submission = working app, public repo (Apache-2.0),
real use of Firebase AI Logic hybrid inference, App Check, English 3-min video and description. Target prize: Best Web/Chrome App.

## Product (one line)
A disabled user who gets blocked on a website selects the blocked area; the page facts and screenshot are analysed **on-device**
(private, works offline), the user approves a redacted draft, and the **cloud** produces a WCAG-grounded fix plan.
The site owner receives a reproducible ticket and can mark it fixed; the user re-checks the fix.

## Why hybrid (capability split, not just quality)
- On-device (Gemini Nano via Firebase AI Logic `ONLY_ON_DEVICE` / `PREFER_ON_DEVICE`): raw page facts + region screenshot may contain
  personal data -> never leave the device. Single-turn, text+image -> structured JSON (BarrierDraft). Self-check pass on device.
- Cloud (`ONLY_IN_CLOUD`): only the reporter-approved, redacted draft goes up. Uses tools that on-device cannot use
  (Google Search grounding / URL context on W3C WCAG docs) -> FixPlan with sources.
- Local code (no AI): DOM collection, axe-core rules, redaction, before/after verification.

## Components
- `packages/shared` — TypeScript contracts (`src/schema.ts`). Coordinator-owned.
- `packages/collector` — deterministic in-page collector: (region, userNote) -> CaptureFacts. Runs in the extension content script and in fixture tooling.
- `extension/` — Chrome MV3 extension: region select, focus-trail recording, region screenshot, hands capture to the web app.
- `apps/web/` — Vite + TypeScript web app on Firebase Hosting: reporter flow (on-device draft, review/redact, cloud fix plan, share),
  site-owner ticket view, verification. Firebase AI Logic (firebase JS SDK, `firebase/ai`), App Check (reCAPTCHA Enterprise + debug token), Auth, Firestore, Remote Config.
- `fixtures/` — synthetic broken/fixed HTML pairs with ground truth. All personal data in fixtures is fake.
- `tools/` — dev tooling (Nano runner, fixture capture). `gate0/` — feasibility evaluation.

## Environment facts (verified 2026-11-18 by coordinator)
- Linux (Hyprland), Google Chrome 158.0.8127.36 at /opt/google/chrome/chrome, RTX 4070 Laptop 8 GB, 155 GB free on /home.
- Gemini Nano model NOT yet downloaded in any Chrome profile. node 26, npm available, network available.
- Other Chrome processes are running for unrelated tools (e.g. user-data-dir ~/.local/share/webchat-bridge/test-profile). Never kill, reuse or touch them;
  only manage Chrome processes you launched with this project's own profile directory.
- No Android device, no Xcode -> web/Chrome only.

## Rules for all workers
- Do not commit; the coordinator reviews and commits. Do not push anything anywhere.
- No secrets in files. Firebase web config is supplied by the coordinator later via `apps/web/.env.local` (gitignored).
- License: Apache-2.0 compatible dependencies only (MIT, BSD, Apache, ISC, MPL-2.0 for axe-core OK).
- English for code, comments, UI text and docs inside the repo.
