Target: BarrierRelay 3-minute English demo video for the #BuildHybridAI Devpost submission (YouTube upload is done by the coordinator).
Read: /home/hero/work/scratchpad/buildhybridai/barrierrelay/docs/VIDEO_SCRIPT.md (current script + shot list), README.md, docs/SUBMISSION.md, tools/e2e/real.e2e.mjs and tools/e2e/integration.e2e.mjs (reuse their launch logic), tools/e2e/out/real-results.json.
Facts: Gemini Nano works in the dedicated profile ~/.cache/barrierrelay/chrome-nano (you are the ONLY user of it during this task; never run two Chrome instances on it). Deployed app: https://barrierrelay-lpun3.web.app. Local dev server gives the real pipeline with the App Check debug token (do not read/print .env.development.local). ffmpeg 9 is installed. TTS: use `uvx edge-tts` (neural English voice such as en-US-AriaNeural or en-US-GuyNeural; script text only — no personal data).
Change: tools/video/ pipeline (node scripts + README) that produces, reproducibly:
1. Real screen recordings (no mockups) at 1920x1080 (deviceScaleFactor 1, browser window/viewport sized for 1080p; use CDP Page.startScreencast frames or puppeteer page.screencast → ffmpeg) of these scenes, following VIDEO_SCRIPT.md (adjust the script if needed to fit <= 2:55 and to match what the app really shows):
   a) Problem: fixture 02 checkout page; a screen-reader-like announcement overlay of what the user hears ("button") when Tab reaches the unnamed pay button (overlay must be labelled as a simulation).
   b) Capture with the real extension (temp profile like integration e2e): Tab to the button, trigger capture, type the note, hand-off to the web app.
   c) Hybrid proof in the Nano profile with the real pipeline: network switched OFF via CDP (show an on-screen "Network: offline (DevTools emulation)" badge you inject in the recorder layer, honest wording), Create private draft → routing panel shows On-device, 0 bytes; self-check on-device.
   d) Privacy step: approvals + live JSON preview + byte count (no note text, no image).
   e) Network on → Get a fix plan (cloud, URL-context W3C sources) → routing row Cloud with bytes.
   f) Share → site-owner view → Mark fixed → Verify → verified.
   g) Closing: architecture card (on-device vs cloud vs local code), Firebase products used (AI Logic hybrid, App Check, Auth, Firestore, Remote Config, Hosting), repo/app URL card.
   Slow down interactions enough to read (typing ~60 ms/char, 1-2 s pauses), add subtle zoom/highlight on the routing panel rows.
2. Narration: per-scene TTS audio from the script; align scene durations to audio; light background silence is fine (no copyrighted music).
3. Burned-in English captions (accessibility product — captions are mandatory) + separate .srt.
4. Output: docs/video/barrierrelay-demo.mp4 (H.264 + AAC, 1920x1080, 30 fps, duration <= 2:58 verified with ffprobe), docs/video/barrierrelay-demo.srt, docs/video/thumbnail.png (1280x720), and docs/video/README.md with how to regenerate. Keep the final MP4 under ~200 MB. Add docs/video/*.mp4 to .gitignore? NO — the coordinator decides; just tell the size.
Constraints: every claim in narration must be true for the app (check code/artifacts); do not show secrets, tokens, emails or the Firebase console. Real Firestore tickets created during recording are fine (prefix summary with "[demo]").
Ownership: tools/video/**, docs/video/**, docs/VIDEO_SCRIPT.md. Do not edit app code; if the UI needs a change for the video, send an orca ask.
Assigned: omp 18.22.2 gpt-6.1-sol/medium — built the UI and real E2E harness this video reuses (results code-change 3/3 met); quota omp 10%/9%.
Acceptance (coordinator will check): ffprobe duration <= 178 s, 1920x1080, audio stream present; captions visible; I will watch sampled frames at each scene.
worker_done summary: duration, size, scene timestamps, any shortcuts or simulations used and how they are labelled.
