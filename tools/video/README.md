# Real demo video pipeline

Run from the repository root. The pipeline needs installed project dependencies, built `extension/dist`, a configured Vite development environment with App Check, the prepared Nano profile at `~/.cache/barrierrelay/chrome-nano`, Node, Ego Browser, Google Chrome, `uvx`, FFmpeg with libx264 and libass, and a sans-serif font. Keep the Nano profile exclusive during recording and retain Chrome’s Singleton locks.

```sh
# Build the extension when its output is missing or its source changed.
npm --prefix extension run build
node tools/video/produce.mjs
```

Production makes a real cloud fix-plan request and creates a real Firestore ticket. It reuses Vite on port 5173 when available and stops only a Vite process it started. Vite handles its development configuration without the recorder reading credentials. The checkout is a fresh working copy of the broken fixture, served by a loopback-only server on the fixture’s loopback port when available, with an ephemeral fallback. Both captures use the same checkout URL.

## Individual stages

Use these stages to avoid repeating real service calls when editing.

```sh
node tools/video/narrate.mjs
node tools/video/produce.mjs story
node tools/video/record.mjs closing
node tools/video/render.mjs
```

The story stage starts Vite if needed. It uses the real extension and the prepared Nano profile. It activates the extension at keyboard focus and attaches to the genuine report tab through Ego’s CDP API. The same capture feeds the offline draft, self-check, approval review, cloud plan, and ticket. The recorder leaves optional environment sharing off in the approval UI, so the ticket fits the currently deployed Firestore rules. If the self-check requests review, the scripted reporter corrects the draft against the captured facts and runs the check again before requesting a cloud plan. After acknowledging the ticket, the scripted owner takes the actual stored `fix.codeAfter` and applies its accessible name or literal button text to the checkout’s single payment button. The patcher preserves the button’s existing SVG and activation behavior. Unsupported snippets stop recording with an error. The recording shows the source diff written from that edit.

The owner marks the ticket fixed and chooses **Start reporter re-capture**. The reporter reloads the patched checkout and captures the same keyboard-focused control. Before Verify fix consumes the one-use handoff, the recorder checks that the patched capture has the same URL, exactly one button, the original virtual reference, the suggested name, and zero target rule hits. The owner desk’s **Reporter re-capture** source must reach **verified** before the recorder writes the sanitized receipt. The stable reference in this run depends on capturing the same control and keeping the candidate order stable. The result is a scoped rule check.

## Narration and output

`scenes.mjs` contains the English narration. `narrate.mjs` passes that public script to Edge TTS (`en-US-AriaNeural`, +8%). Pass scene IDs to `narrate.mjs` to replace individual narration tracks. `render.mjs` offsets caption boundaries, clamps each cue to the next cue’s start, aligns the Nano routing row and repair footage with the narration, burns in the SRT, and checks duration and codecs. The edited footage can shorten the Nano wait, run faster, or hold the last frame. The announcement is a labeled simulation and offline status is DevTools emulation. The recording blurs the demo checkout’s email and address, the captured screenshot, and the owner link field. The routing byte count measures the approved application payload, with the app counting an additional attempt if it retries.

Deliverables appear in `docs/video/`. The ignored `tools/video/.work/` directory contains intermediate audio, browser state, footage, the working checkout copy, and the sanitized receipt. The receipt is also copied into the deliverables. Regenerating the story can produce different model wording, timing, and retrieved sources.
