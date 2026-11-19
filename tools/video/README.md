# Real demo video pipeline

Run from the repository root. Requires Node, `ego-browser` (supported Linux runtime), `/opt/google/chrome/chrome`, `ffmpeg`/`ffprobe` with libx264/libass, `fc-match` and a sans font (Liberation Sans used here), `uvx`, installed npm dependencies, built `extension/dist`, the configured ignored development environment, and a downloaded Nano model in `~/.cache/barrierrelay/chrome-nano`.

```sh
# Only if extension/dist is absent or extension source changed:
npm --prefix extension run build
# Full reproduction, including real cloud request and Firestore ticket:
node tools/video/produce.mjs
```

Do not run another Chrome/Nano tool against the Nano profile during production. Chrome's own profile lock is retained; never remove Singleton locks. `produce.mjs` starts Vite only if port 5173 is not already serving; it terminates only the server it starts. Vite loads App Check development configuration itself. The pipeline never opens or logs the env file, browser console, Firebase console, credentials, or account details.

Individual stages for editing:

```sh
node tools/video/narrate.mjs
node tools/video/record.mjs capture
node tools/video/record.mjs nano
node tools/video/record.mjs sources
node tools/video/record.mjs closing
node tools/video/render.mjs
```

Run recording stages **sequentially**. Recording uses `ego-browser nodejs` stdin scripts and its `page.screencast` CDP frame recorder. `chrome.mjs` is the managed engine wrapper, not an independently launched automation browser. It adds the existing Nano E2E feature arguments only for the exclusive Nano profile and extension-debugging support only for temporary profiles. Viewports are 1920×1080 at device scale 1. No AI stubs or app source changes are used.

The extension stage reuses integration E2E's real `Extensions.loadUnpacked`, options UI, focus capture, `Extensions.triggerAction`, and one-time local handoff. The Nano stage reuses real E2E's prepared app/fixture, explicit offline draft, real self-check, approved JSON, cloud plan, real ticket lifecycle, and synthetic fixed-fixture verification. A `[demo]` summary prefix identifies the ticket. These are separate profiles, not one continuous capture.

The owner-desk shot begins only after the real ticket-status element has loaded, avoiding an empty service-loading desk. The current edited take trims its six-second loading lead-in; narration-derived duration remains unchanged.

The extension-created report target is outside the default task-space tab list. Its genuine one-time handoff target is attached through ego's raw CDP API, without reopening the consumed URL; real `Page.startScreencast` frames are acknowledged and encoded at 10 fps before final 30-fps delivery. The other scenes use ego's frame recorder. Headless-only `Page.bringToFront` enables compositor frames without focusing a desktop window. Each recording phase closes its own managed browser.

The `sources` stage records a separately labeled close-up of the same ticket's actual retrieved W3C links, using `tools/video/.work/hybrid-receipt.json` written by the successful Nano stage. It is appended to the cloud scene; it does not insert citations or run another cloud request.

`scenes.mjs` is the narration source. `narrate.mjs` sends only that public script to `uvx edge-tts` (`en-US-AriaNeural`, +8%) and saves actual subtitle boundaries. `render.mjs` offsets those boundaries into the separate SRT and burns them into the MP4. Scene durations follow audio plus a reading pause. Footage is proportionally shortened when necessary or holds its last real frame; it is labeled edited for time. The renderer rejects narration >175 seconds and final output >178 seconds, wrong dimensions/frame rate/codecs, or missing AAC audio.

## Outputs

- `docs/video/barrierrelay-demo.mp4`: H.264/AAC, 1920×1080, 30 fps, faststart, burned captions.
- `docs/video/barrierrelay-demo.srt`: separate English captions.
- `docs/video/thumbnail.png`: 1280×720 genuine video frame.
- `docs/video/timeline.json`, `ffprobe.json`: timing and delivery metadata.
- `tools/video/.work/`: raw WebMs, TTS audio/subtitles, intermediates, hybrid receipt, isolated browser state; reproducible production cache, not submission assets.

## Recorder-only additions and limitations

- Announcement overlay: **Screen reader announcement SIMULATION: “button”**. This is not actual assistive-technology audio or a usability study.
- CDP network badge: **Network: offline (DevTools emulation)**; app/model are loaded beforehand. Fresh offline navigation/download is not claimed.
- Routing highlight and 2.5% zoom affect presentation only; routing data is never edited.
- Synthetic contact paragraphs and local capture previews are blurred for the recording; a footer discloses the blur. Raw facts, AI results, and stored app state are never replaced.
- Closing is an authored architecture card, not an app feature. It shows the hosted app and source-repository URLs; the coordinator publishes the repository for submission.
- Verification is the paired synthetic fixed fixture, not a patched live website or WCAG certification. Ticket access is link-based prototype collaboration, not authenticated site ownership.
- No copyrighted music. TTS duration, model output/timing, cloud retrieval, and ticket IDs can vary on regeneration. Exact binary reproduction is not promised; the actions and output contract are reproducible.

The root `.gitignore` and MP4 tracking policy are untouched. `tools/video/.gitignore` excludes only `.work/`. The coordinator decides whether to commit/upload final video files.
