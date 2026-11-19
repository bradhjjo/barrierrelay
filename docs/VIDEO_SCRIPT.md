# BarrierRelay video — 2:55 planned runtime

English narration, captions, and keyboard/screen-reader demonstration. The timeline below totals **175 seconds**, below the **3-minute** limit recorded in [PROJECT.md](PROJECT.md). Timing is a production plan, not a measured inference benchmark. Keep the first problem-and-hybrid-value sequence inside the opening thirty seconds.

## Recording gates — do not fake these shots

- TODO(verify): a real Firebase AI Logic on-device text+image draft with a prepared Nano model, valid constrained output, and an On-device routing entry. The later coordinator Nano probes are not by themselves evidence of this complete app path.
- TODO(verify): that same draft with network disabled in an **already-loaded tab**. Preload the app and capture, complete Firebase initialization, and prepare the model online first. There is no offline app-shell service worker; do not imply fresh offline navigation or download works.
- TODO(verify): real cloud fix planning and actual returned grounding citations with the final model/config. Do not hand-insert sources or present the deterministic `demo=1` pipeline as AI.
- TODO(verify): actual screen-reader behavior on the fixture and the final app. Record real speech, not a fabricated accessibility-tree announcement. If any gate fails, fix/re-record or explicitly disclose the limitation; do not narrate an unobserved success.

Use synthetic [fixture 02 broken](../fixtures/pairs/02-icon-pay-button/broken.html) and its [fixed counterpart](../fixtures/pairs/02-icon-pay-button/fixed.html), not a real checkout or personal report. Enable clear captions, readable zoom, visible keyboard focus, and adequate audio separation between speech output and narration. Hide all token/config files and console debug-token output. Use the real pipeline without `demo=1` for every shot labeled on-device/cloud.

## Timestamped shot list and narration

| Time | Picture / action | English narration |
| --- | --- | --- |
| **00:00–00:10** | Fixture 02 broken checkout. Tab to the icon payment button; record the screen reader's actual unnamed-button announcement. Show keyboard focus and a short caption: “What does this button do?” | “I’m trying to pay. With a screen reader, this button has no accessible name. The page looks finished, but the task is blocked.” |
| **00:10–00:27** | Clearly labeled preview: “Same fixture · app and model already prepared.” Switch to the preloaded report, show browser network set to Offline, then generate the **real** local draft. Show the On-device routing row and local-capture cloud-bytes entry. End on the shared-JSON preview. | “BarrierRelay starts privately. In this already-loaded tab, I turn the network off and draft with Gemini Nano. The facts and image stay here. Only JSON I review may go to cloud AI.” |
| **00:27–00:45** | Return online. Caption: “How the capture starts.” On fixture 02, press Alt+Shift+B or the toolbar action. Show focus entering the modal, the goal field, Screen reader checkbox, and Replay my last keys. Type a synthetic goal. | “Back at the blocked control, a shortcut captures where I am now—no mouse selection required. I explain my goal and choose whether to include my recent navigation keys. Typed characters are not recorded.” |
| **00:45–01:05** | Submit capture. The app opens the report. Show the cropped image, unnamed element facts, and focus trail. Generate the actual draft and edit its summary briefly. Do not hide a fallback label. | “The extension passes the capture locally to the web app. I can inspect the unnamed control and keyboard trail. Local-only AI turns that evidence into a report I can edit, rather than uploading my page.” |
| **01:05–01:28** | Run self-check. Show the result and routing entries; pan through the live JSON. Leave optional path, visible-text, and focus-trail sharing off; briefly highlight the screenshot's absence. | “Self-check combines deterministic validation with an on-device check when available. Before sharing, I see the redacted payload. The screenshot and original note are excluded. Pattern-based redaction can miss things, so my review still matters.” |
| **01:28–01:50** | With network online, activate Get a fix plan. Show the real Cloud routing row, fix explanation, code suggestion, and actual returned sources. Use a truthful time cut if generation exceeds the shot window. | “Now I choose the cloud capability: a repair plan with Google Search grounding. Firebase AI Logic uses cloud-only inference for this approved payload. Sources come from returned grounding metadata, not invented citation text.” |
| **01:50–02:15** | Create shareable ticket, open owner link, show expected/actual and checklist. Acknowledge, then Mark fixed. Clearly caption “Demo collaborator; link-based prototype access.” | “I share a ticket instead of a vague complaint. A collaborator gets the reproduction steps, proposed repair, and manual checks. Anonymous Auth and Firestore support the workflow; App Check protects the AI endpoint. This prototype does not verify site ownership.” |
| **02:15–02:38** | In the owner view select the original fixture's fixed variant and Verify fix. Show the explicitly synthetic verification result and local-code row. Briefly show the fixed button's accessible name. | “For this demonstration, I re-check the paired fixed fixture. The target rule check passes and the ticket becomes verified. That is a scoped synthetic check, not proof that an entire website meets WCAG.” |
| **02:38–02:55** | Final split: local draft / approved JSON / cloud plan, with short readable labels. End card: BarrierRelay, source/demo links only after verified, and a captioned call to action. | “Private observation, deliberate sharing, actionable repair. BarrierRelay keeps sensitive capture local and uses cloud tools only after review. Start with the no-extension fixture demo, or capture the barrier where you are.” |

## Edit and honesty checklist

- The opening preview intentionally jumps ahead to the prepared offline result, then returns to capture. Label that transition; do not imply a new app tab or model download loaded offline.
- Show the actual **Hybrid routing** table. Its location derives from `response.inferenceSource`; its bytes are application payload size, not all browser network traffic ([architecture](ARCHITECTURE.md#routing-visibility)).
- If the local path produces **Rules-only draft**, it is local code, not Gemini Nano. Rehearse with the model available; do not crop away the label and narrate Nano.
- If grounding returns no sources, show the app's disclosure and do not claim the shot demonstrates grounded citations. A successful Search result is a recording gate above.
- `web.e2e.mjs` deliberately uses deterministic demo AI. Its screenshots are useful for shot planning, not substitutes for the real-model evidence shots.
- Synthetic verification does not show a live website changing. No code is patched automatically. Keep “fixed fixture” visible.
- TODO(verify): insert real deployed demo/source/video links, review captions and screen-reader audio with users, then check the exported runtime remains at or below the event limit.
