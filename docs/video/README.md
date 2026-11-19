# BarrierRelay English demo

- **Video:** [`barrierrelay-demo.mp4`](barrierrelay-demo.mp4), **172.482 seconds (2:52.482)**, **8,636,730 bytes (8.24 MiB)**.
- **Format:** 1920×1080, 30 fps, H.264 video + AAC stereo narration, faststart.
- **Captions:** burned-in English captions and separate [`barrierrelay-demo.srt`](barrierrelay-demo.srt), using actual TTS boundary timestamps.
- **Thumbnail:** [`thumbnail.png`](thumbnail.png), 1280×720, extracted from the recorded video.
- **Metadata:** [`ffprobe.json`](ffprobe.json); exact audio-derived scene boundaries: [`timeline.json`](timeline.json).
- **Review stills:** `review-*.png`, extracted from the final captioned MP4, one per major surface including the extension handoff.

## Scenes

| Start | Scene |
| --- | --- |
| 00:00.000 | Broken checkout; simulated screen-reader announcement |
| 00:13.130 | Real extension capture, typed note, local web-app handoff |
| 00:38.072 | Prepared Nano profile; offline real draft and self-check |
| 01:04.954 | Approvals, live shared JSON, byte count |
| 01:27.948 | Network restored; real cloud plan and retrieved W3C sources |
| 01:55.166 | Real shareable ticket, collaborator status changes, synthetic verification |
| 02:28.864 | Architecture, Firebase products, app/source URLs |

## Regenerate

From the repository root, with installed project dependencies, built `extension/dist`, configured local development App Check, and the prepared Nano profile **not in use by another Chrome**:

```sh
node tools/video/produce.mjs
```

Prerequisites and individual-stage commands are in [`tools/video/README.md`](../../tools/video/README.md). `uvx edge-tts` generates per-scene `en-US-AriaNeural` narration (+8%); the pipeline records actual pages through ego-browser/CDP, aligns durations, burns captions, and verifies the output contract. No music. No env file, debug token, email, user account, or Firebase console is shown. Only the public script is sent to TTS.

## Evidence and editorial disclosures

- Fresh screen recordings, not prior E2E screenshots or mockups. No `demo=1` or substituted AI. The extension capture uses a temporary profile; the subsequent real Nano pipeline uses the same synthetic fixture loaded separately in the exclusive Nano profile. The transition is labeled.
- The extension is activated by Chrome's real toolbar-equivalent `Extensions.triggerAction`, rather than a synthetic shortcut event.
- The announcement overlay explicitly says **SIMULATION**. It is not actual screen-reader audio, an assistive-technology test, or a disability-led usability result.
- Offline badge: **Network: offline (DevTools emulation)**. The app/capture/model were prepared online first; fresh offline navigation/download is not promised.
- Recorder-only labels, routing highlight/2.5% zoom, and blur of synthetic contact paragraphs/local image previews do not alter application data or results. Workflow footage carries **EDITED FOR TIME** and **CONTACT DETAILS BLURRED** labels. Long scenes are proportionally shortened; short scenes hold the final real frame.
- The W3C-source close-up comes from the **same real ticket**, recorded separately after creation; its badge explicitly says **same real ticket, separate close-up**. It shows the actual retained cloud plan, not inserted citations.
- Coordinator revision: the closing card now shows only the repository URL, without the pending-publication line. The owner-desk scene drops its first six seconds of source footage to omit service loading; future captures start that shot only after the real ticket-status element exists. Narration and scene boundaries are unchanged.
- Successful recorded run: Nano draft **10,792 ms / 0 bytes**, on-device consistency check **997 ms / 0 bytes**, real cloud plan **22,019 ms / 1,804 payload bytes**, **2 retrieved W3C links**, and real Firestore ticket **MTKHV3Yawg1v150alRVI** reaching **verified**. Byte counts are application payload sizes, not total browser traffic. The edited summary starts `[demo]`.
- An earlier recording take hit a real cloud 500 high-demand error after the app's built-in retry. It was discarded and a later real take succeeded; the video does not assert guaranteed availability or latency.
- Verification uses the paired synthetic fixed fixture, not a live website patch or WCAG certification. Site-owner collaboration is link-based prototype access, not verified ownership. Generated code is illustrative and never automatically applied.
- Closing is an authored architecture card showing `https://github.com/bradhjjo/barrierrelay` and the deployed app URL `https://barrierrelay-lpun3.web.app`; the coordinator publishes the repository for submission.

## Verification performed

The renderer's final ffprobe assertion passed: duration ≤178 seconds, 1920×1080, 30 fps, H.264 and AAC present. Final MP4 scene frames were extracted for visual review. Audio analysis found mean **−24.8 dB**, peak **−4.9 dB** (non-silent, no full-scale clipping).

The root `.gitignore` and MP4 tracking policy were not changed. Only the reproducible `tools/video/.work/` production cache is ignored locally under `tools/video/.gitignore`. YouTube upload and public repository publication belong to the coordinator.
