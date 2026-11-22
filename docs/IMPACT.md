# Impact — measured, not estimated

WAI reporting guidance: 8 of 10 items covered; 2 omitted by privacy design. Coverage includes 5 partial/conditional items; see [comparison](REPORTING-COMPARISON.md).

Every figure below is measured in this repository or sourced from a cited document. “Payload bytes” are approved application-data accounting, not total network traffic; no dollar cost is claimed.

| Measure | Value | Source |
| --- | --- | --- |
| Region PNG, demo fixture (not in cloud payload) | 51,342 bytes | `stat -c %s apps/web/public/fixtures/pairs/02-icon-pay-button/broken.region.png` |
| Region PNGs, 10 synthetic pairs (min / median / max) | 20,457 / 25,595 / 51,342 bytes | same command over `pairs/*/broken.region.png` |
| Approved cloud payload, fix plan | 1,892 bytes | [docs/evidence/real-results.json](evidence/real-results.json) |
| On-device draft, offline | 10,991 ms, 0 cloud bytes, 0 AI network requests | same receipt |
| On-device consistency check | 704 ms | same receipt |
| Cloud fix plan | 10,176 ms | same receipt |
| Separate cloud URL-context smoke | 2,900 ms, 1,395 bytes | [docs/evidence/cloud-smoke.json](evidence/cloud-smoke.json) |

**Privacy and cost.** The published receipt sends 1,892 bytes to the cloud for a fix plan, while the 51,342-byte region image it describes stays on the device — the payload is 3.7% of that image. These are single-run measurements, not a bandwidth or dollar-cost benchmark.

**Latency.** The receipt’s 10,991 ms draft, 704 ms check, and 10,176 ms plan are single-run values from one recorded run, not a benchmark; the separate 2,900 ms cloud smoke is a single call. A separate retained **3-run batch** passed **3/3**: draft **7.5–10.3 s**, on-device check **0.65–0.72 s**, cloud plan **8.9–9.3 s**, **1,597–1,766 payload bytes** ([run 1](evidence/real-e2e-readiness-1.json), [run 2](evidence/real-e2e-readiness-2.json), [run 3](evidence/real-e2e-readiness-3.json), [AI run table](../apps/web/src/ai/README.md#final-sequential-runs-after-diagnostic-merging)). This batch excludes the published single run above; these observed ranges are not latency guarantees.

**Reach.** The [WebAIM Million 2026 report](https://webaim.org/projects/million/) found detectable WCAG failures on **95.9% of tested home pages**, missing form input labels on **51% of home pages**, and empty buttons on **30.6%**. These are automated home-page findings, not a measure of every barrier or individual control.

**What this replaces.** Instead of manual issue writing, a separate audit report, or an email chain, one flow produces capture → private draft → reviewed payload → cloud plan → shareable ticket → scoped re-check. Time saved is **not yet measured with real users**; no productivity gain is claimed.

Sizes above were measured with `stat -c %s`; the median is the mean of the fifth and sixth sorted values across the 10 pairs.
