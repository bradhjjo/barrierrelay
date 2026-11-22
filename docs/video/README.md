# BarrierRelay English demo

[Watch the demo](barrierrelay-demo.mp4) or open the [separate English subtitles](barrierrelay-demo.srt). The 145.842-second 1920×1080 video includes burned-in English captions, 30 fps H.264 video, and AAC stereo narration. Playback metadata is in [ffprobe.json](ffprobe.json). The [thumbnail](thumbnail.png) and the review stills come from the captioned recording.

## Scenes

| Start | Scene |
| --- | --- |
| 00:00.000 | The blocked moment |
| 00:13.202 | Capture at keyboard focus |
| 00:32.336 | Real Gemini Nano, offline |
| 00:58.402 | Review what is shared |
| 01:19.500 | Request a cloud fix plan |
| 01:37.550 | Apply the suggested fix and re-capture |
| 02:07.888 | Report it privately. See it fixed. |

## What the recording shows

- The reporter captures the unnamed payment button on a working demo checkout using the real extension. The screen-reader announcement shown on the checkout is a labeled simulation.
- The same capture feeds the real on-device Gemini Nano draft during DevTools offline emulation. Local rules detect the unnamed button, and Nano drafts the report. The byte count measures the approved application payload.
- The reporter reviews the sharing controls and JSON, requests a real cloud Gemini plan, and shares a Firestore ticket. The video shows the actual W3C links retrieved for that plan.
- The scripted owner acknowledges the ticket and applies the suggested code to the working checkout. The source diff shows the addition of `aria-label="Place your order"` to the existing payment button. The owner marks it fixed and arms the extension’s reporter re-capture. The reporter reloads the patched checkout and captures the same payment button. The repair desk verifies the ticket using that second capture.
- Verification checks the recorded control’s target rule hits. The matching virtual reference depends on the same region and stable candidate order in this demo. The check does not establish WCAG conformance. Ticket collaboration uses prototype link access.
- Recorder overlays identify the simulation and offline emulation. The video blurs the demo checkout’s email and address, local capture images, and the owner link field. The offline badge indicates the shortened Nano wait. Edited footage can run faster or hold its final frame.

The English SRT contains 41 cues with zero overlapping boundaries. See the [sanitized production receipt](receipt.json) for the actual code suggestion and applied diff, AI routing, the two captures, and the final ticket status.

## Regenerate

From the repository root, with installed dependencies, built extension, local App Check configuration, and the prepared Nano profile exclusively available:

```sh
node tools/video/produce.mjs
```

This makes a real cloud request and creates a real Firestore ticket. See the [pipeline README](../../tools/video/README.md) for the stage commands and prerequisites. The [scene timeline](timeline.json) uses the TTS audio and caption boundaries. TTS receives the public English script.
