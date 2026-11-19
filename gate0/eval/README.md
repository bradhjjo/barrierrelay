# Gate 0 paired fixture evaluation

From the repository root, run `node gate0/eval/run-eval.mjs`. It uses the dedicated `tools/nano/run.mjs` browser session and must not run concurrently with another process using `~/.cache/barrierrelay/chrome-nano`. No cloud APIs are called.

The runner checks that Nano is already `available` (eight-second readiness limit). If absent, downloadable, downloading or unavailable, it exits nonzero with **Nano unavailable**, writes the reason to `gate0/out/eval.json`, and does not start a download. A missing browser/profile startup failure also exits nonzero with a clear startup reason. A ready model evaluates all 20 synthetic fixture variants sequentially in both text-only and text+region-image modes: 40 separate single-turn model sessions. Per-case inference/parse failures count as incorrect rows and do not stop the remaining evaluation.

The exact application system prompt and JSON schema are loaded from `apps/web/src/ai/draft-prompt.json`, also imported by `prompts.ts`. Facts are `JSON.stringify` output without indentation in both paths. `pipeline.test.ts` asserts the shared prompt/schema identity. The schema-valid metric checks field types, lengths, count bounds, enum values, unknown keys, valid target refs and the `none`/null relationship; this is separate from correctness against fixture truth. Type and ref accuracy each use all 20 variants as denominator, with broken-type score and fixed-none count reported separately. Latency includes model creation and inference; the median is computed over successful inference rows.

Outputs are local ignored artifacts: `gate0/out/eval.json` holds prompt snapshot, summary and all raw model drafts; stdout prints the per-mode table. `gate0/out/eval-initial.json` preserves the first prompt run for comparison. These are synthetic fixture results, not validation on real user pages. The direct Prompt API evaluation does not prove end-to-end Firebase SDK routing; mocked SDK tests cover contract and routing behavior separately.

## Self-check evaluation

Run `node gate0/eval/selfcheck-eval.mjs` separately from all other Nano/E2E runners. It uses the app's shared `selfcheck-prompt.json`, `selfcheck-input.ts` and deterministic rule draft builder. For each broken fixture it aligns the correct draft's type/ref with truth, then makes one single-field corruption: nonexistent `e999` on odd fixtures, or a different barrier type on even fixtures. All 20 cases invoke Nano with a constrained consistency judgment and local comparison evidence. Thresholds: 9/10 correct accepted, 8/10 corrupted rejected. Outputs: `gate0/out/selfcheck.json` and a printed table. This is a small combined deterministic-evidence/model benchmark, not a standalone LLM reasoning score; see the app AI README for sampling limitations and E2E results.


## Raw and reconciled draft scores

The draft evaluator now applies the application's shared `reconcileDraft` as a post-step to each raw Nano output. `rows[].draft` and the existing `summary` retain raw model results; `rows[].correctedDraft`, correction note, corrected correctness/schema flags and `correctedSummary` retain the separate reconciled results. The console table compares both. Language is preserved, and this post-step cannot repair fixed-page false positives without rule evidence. No extra inference or cloud call is used for reconciliation.

Each draft case now has a 45-second runner deadline, matching the application's inference limit. A failed case remains a failed raw/corrected row. The evaluator then closes its own dedicated browser and checks readiness in a fresh session before continuing; this prevents a native prompt that is still pending after a deadline from blocking every subsequent case. It never changes or kills unrelated Chrome profiles. `sessionRestarted` marks such rows. A manually stopped initial session is preserved separately as `gate0/out/eval-aborted-session.json`; use the completed `eval.json` for the final comparison.
