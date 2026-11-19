# Gallery provenance and rebuild

Six **1500 × 1000 PNGs**, plus [`../cover.png`](../cover.png), all **3:2** and below 5 MB. Devpost's [submission-step guide](https://help.devpost.com/article/126-know-your-submission-steps) recommends 3:2 for the project-gallery thumbnail (JPG/PNG/GIF, 5 MB maximum). Using the same ratio for supporting gallery images is a package design choice, not a separately verified gallery-image mandate.

## Real screenshot sources

Paths below are relative to the repository root. Source files may contain JPEG bytes despite a `.png` suffix; ffmpeg decodes them and outputs genuine PNGs. These local artifacts are ignored by Git, so retain them separately if future rebuilds are needed. The rendered submission PNGs themselves are included in this package.

| Deliverable | Original screenshot | Source crop x, y, width, height |
| --- | --- | --- |
| 01-capture.png | tools/e2e/out/integration-rules-only.png | 58, 695, 940, 740 |
| 02-private-draft.png | tools/e2e/out/real-06-cloud-plan.png | 58, 1740, 940, 1020 |
| 03-sharing-preview.png | tools/e2e/out/real-06-cloud-plan.png | 58, 2810, 940, 850 |
| 04-cloud-plan.png | tools/e2e/out/real-06-cloud-plan.png | 58, 3680, 940, 920 |
| 05-hybrid-routing.png | tools/e2e/out/real-10-owner-verified.png | 1040, 1340, 345, 615 |
| 06-verification.png | tools/e2e/out/real-10-owner-verified.png | 58, 1780, 940, 470 |
| ../cover.png | tools/e2e/out/real-10-owner-verified.png | 1040, 1340, 345, 615 |

Source SHA-256 at generation time:

```text
2e603f2029c58c3bba4b78671e6cb1d1921f7481f8a6aaab3f57659fcb0321e6  integration-rules-only.png
5e51ad7607f36460b1fdbbe7ccf1aa004e5f9402700003a0997fab4259338923  real-06-cloud-plan.png
369e992fa9d6cf7748ca1c1375967447a9f6b651b9f18f80c76dc8cabc93600a  real-10-owner-verified.png
```

## Editing policy and evidence scope

Only cropping, proportional scaling, padding and English caption bands were applied. No routing values, reports, plan text, badges or sources were fabricated/retyped. The extension screenshot uses a model-free real-app integration; the other sources show real local/cloud inference. All scenarios use synthetic fixture pages.

The historical screenshots show **10991 ms / 0 Cloud bytes** for the offline on-device draft, **704 ms / 0 Cloud bytes** for the model consistency check, and **10176 ms / 1892 Cloud bytes** for the cloud plan. They are not the latest `real-results.json` run; do not overwrite their values to match a different receipt. Bytes are approved application payload accounting, not total network traffic.

The generated draft contains imperfect wording, including `[e2e]` and a reproduction step mentioning another control. This is deliberately preserved real model output, not polished into a stronger accuracy claim; reporter review remains necessary. The verification image explicitly discloses a synthetic fixed-fixture check, not live repair or WCAG compliance. Crops omit fixture contact/payment-profile fields, credentials, browser account data and ticket IDs.

## Rebuild

Requires Python 3, ffmpeg with `drawtext`, and DejaVu Sans. No browser/profile, cloud calls or secrets are used:

```sh
python docs/devpost/gallery/build.py
```

The script resolves paths relative to itself. Retain the original screenshot hashes above if the E2E output directory is regenerated. Human-review every output before upload; source layout changes can invalidate fixed crops.
