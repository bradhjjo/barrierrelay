# BarrierRelay — recorded English demo

The reproducible source of narration is [`tools/video/scenes.mjs`](../tools/video/scenes.mjs). Scene timings are derived from the actual neural TTS audio, with a short reading pause; [`video/timeline.json`](video/timeline.json) contains exact boundaries. The renderer refuses narration longer than 175 seconds and verifies a final runtime no longer than 178 seconds.

## Recording sequence

| Scene | Real surface / action | Narration focus |
| --- | --- | --- |
| 1 · Problem | Fixture 02 broken checkout; Tab to its unnamed payment button | A blocked task; the “button” announcement is explicitly a **screen reader simulation**, not recorded assistive technology |
| 2 · Capture | Real unpacked extension in a temporary model-free profile; keyboard focus, actual extension action, note typed at approximately 60 ms/character, assistive context, local handoff | No mouse selection required; navigation keys rather than typed characters; no screenshot upload |
| 3 · Offline | Same synthetic fixture loaded separately in the exclusive Nano profile; model prepared online, network disabled through CDP, actual SDK draft and self-check | Recorder badge: **Network: offline (DevTools emulation) · app + model already prepared**; actual On-device routing, zero payload bytes; edit summary with `[demo]` prefix |
| 4 · Privacy | Optional approvals, live JSON preview, real byte count; optional focus-trail approval toggled on and back off | Original note and image excluded; redacted report/control facts remain; human review still needed |
| 5 · Cloud | Network restored; actual fix-plan request, Cloud routing and payload bytes, returned W3C sources | URL context is a distinct cloud capability, not a silent draft fallback; bytes are application payload size |
| 6 · Repair | Real Firestore ticket, site-owner repair desk, acknowledge, mark fixed, synthetic fixed-fixture verification, verified status | Link-based prototype access is not verified ownership; scoped fixture check is not live repair or WCAG certification |
| 7 · Closing | Authored architecture card, Firebase products, hosted app and source address | Local code vs Nano vs cloud; Firebase AI Logic hybrid, App Check, Auth, Firestore, Remote Config, Hosting |

## Honesty and privacy

- All workflow footage is new CDP screencast recording of the real app/extension. No `demo=1`, replacement AI, replayed old E2E images, fabricated routing entries, or DOM-written app state.
- Extension capture and Nano inference are **separate profiles/captures**, using the same synthetic fixture. The transition is labeled; the extension profile does not claim Nano.
- The extension action uses the real Chrome `Extensions.triggerAction` toolbar-equivalent command, not a fabricated keyboard shortcut event.
- The browser screen-reader-like announcement is the sole simulated interaction, visibly labeled **SIMULATION** and identified in narration.
- Recorder-only privacy blur covers synthetic checkout contact details and the local capture preview; it does not alter stored app data. The footer labels contact details blurred.
- Editing fits footage to narration: long scenes are proportionally time-compressed, short ones hold their final genuine frame. Workflow footage is labeled **EDITED FOR TIME**. Displayed routing timings remain the app's own observed values, not narration runtime.
- Routing highlighting/zoom and network badges belong to the recorder layer, not the shipped app. No control is added and no result is changed.
- The architecture end card is explicitly labeled as a card and shows the hosted app and GitHub URLs; the coordinator publishes the repository for submission.
- Captions are burned in and supplied separately as SRT using actual per-scene TTS boundary timestamps. Narration uses `en-US-AriaNeural`, with no personal data sent to TTS and no music.
- The original E2E receipt remains a separate evidence artifact. No historical latency or general accuracy claim is narrated.

See [`video/README.md`](video/README.md) and [`tools/video/README.md`](../tools/video/README.md) for regeneration and final delivery facts.
