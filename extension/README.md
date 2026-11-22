# BarrierRelay Chrome extension

## Install and use

From the repository root:

```sh
npm --prefix extension run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist/` (not `extension/`). Reload existing pages after installation so key recording begins. No Nano download or Firebase connection is needed by the extension. The deployed web app is [barrierrelay-lpun3.web.app](https://barrierrelay-lpun3.web.app); choose that destination in options for hosted reports. To try the app without installing the extension, open [the synthetic payment-button report](https://barrierrelay-lpun3.web.app/report?fixture=02-icon-pay-button&variant=broken). The app uses a labeled rules-only draft when Nano is absent; its **Prepare private on-device AI** action requires supported desktop Chrome with Prompt API and an unmetered network for the model download ([Gate 0 finding](../gate0/NANO_NOTES.md)).

Stable extension ID: **`ehiihcegnfekjkifcjmebdgiijpepdkp`**. Set `VITE_EXTENSION_ID` to override the web intake's matching default. The manifest's public RSA key comes from `extension/key.json`; the private key is outside the repository at `~/.cache/barrierrelay/extension-key.pem`. Keep `key.json` to preserve this ID across builds and machines. The private key is not required for unpacked builds and must never be committed.

1. Navigate with the keyboard to the blocked control.
2. Press **Alt+Shift+B**, or activate the toolbar action. If your desktop intercepts the shortcut, assign another at `chrome://extensions/shortcuts`.
3. The region is the nearest containing form, dialog, navigation, main section, or other landmark. It is capped at 1000×700 CSS pixels and the viewport, centered toward the focused element when necessary. Without a landmark, a 600×400 viewport-clipped box surrounds the focused element.
4. Enter **What were you trying to do?** (maximum 300 characters), choose assistive context, and optionally include **Replay my last keys**.
5. **Capture and open report** collects the facts and a region-only PNG (longest side ≤768 physical pixels), then opens the report app.

The panel is a labeled modal dialog with visible keyboard focus, a Tab/Shift+Tab focus trap, Escape, Close, focus restoration, and polite live status/error announcements. **Pick an element instead** is a secondary pointer selection mode with a hover outline; click selects, Escape cancels and returns to the keyboard-accessible panel. The primary flow needs no pointer.

Use **Extension options → Report app** to choose `http://127.0.0.1:5173` (default development server), `http://127.0.0.1:4173` (production preview), or `https://barrierrelay-lpun3.web.app`. Arbitrary destinations are intentionally not accepted: the external-message allowlist must agree with the destination.

For a live repair re-check, open the existing `/t/<id>` ticket in the web app and choose **Start reporter re-capture**. After the armed confirmation, return to the repaired page, focus the same control, and use **Capture and open report** within 30 minutes. The next capture opens that ticket at `/t/<id>?capture=…&ext=…`; select **Reporter re-capture** under **Verification source**, then **Verify fix** with the ticket marked `fixed`. The return target is single-use; subsequent captures open a new report unless armed again. Virtual `eN` refs are capture-local, so matching a repaired live control across captures is not robust.

## Permissions and privacy

- `activeTab`: screenshot access only following the user's shortcut/toolbar action. It does not permit background screenshots of arbitrary tabs.
- `scripting`: reinject the bundled content script on an already-open page after an extension reload, if needed.
- `storage`: local report-origin preference; session-only capture handoff.
- **No `host_permissions`, network API, analytics, or external scripts.** The HTTP/HTTPS `content_scripts.matches` grants page access for automatic local key recording. This necessarily causes Chrome's site-access warning and is the strictly needed broad page access: `activeTab` injection alone cannot reconstruct keys pressed *before* activation. A page's last 20 navigation key names and ephemeral DOM focus handles are kept in memory only, never persisted until the user explicitly requests a capture. Chrome's site-access controls can restrict automatic recording; in that case the trail begins when the extension is activated on that site.

Only Tab, Shift+Tab, Enter, Space, and Escape are recorded, never character keys or field values. Recording pauses while the capture UI is open. At capture time the DOM handles are mapped to virtual `eN` refs; handles outside the region become null. The collector supplies sanitized facts, not HTML or selectors. **Screenshots can still contain personal data**, as the panel warns: review before sharing in the web app.

The extension never uploads capture contents. On the user's submit it stores the facts and region PNG in `chrome.storage.session` with a cryptographically random capture UUID and, by default, opens `/report?capture=<uuid>&ext=<extension-id>`. After **Start reporter re-capture** on a ticket page, the next capture instead opens that `/t/<id>` page with capture parameters; this return is single-use and expires after 30 minutes. Only the three allowlisted web origins can pull a capture; retrieval deletes it before responding, parallel duplicate requests are rejected, and unread captures expire after 30 minutes (purged on a later capture, or on browser-session end). `ping` returns the extension version only. The app's subsequent review/cloud-sharing behavior is separate from the extension: raw-context drafting is local-only, while approved JSON can request a cloud plan using URL context over deterministically selected W3C WCAG Understanding pages. Citation links are retained only from successful URL-context retrieval metadata; see [the AI implementation notes](../apps/web/src/ai/README.md). The coordinator verified the hosted rules-only path and a real cloud plan under production reCAPTCHA Enterprise App Check (21.1 s, two W3C source links); this does not require the extension to download Nano or send raw captures to cloud.

The ticket page's `armReturn` message stores a single return target in `chrome.storage.session`, restricted to a 20-character alphanumeric ticket ID and the requesting allowlisted origin. This overrides the usual `/report` destination for the next capture only and expires after 30 minutes. It does not upload the capture or verify the repair.

Chrome internal pages, the Chrome Web Store, cross-origin frames, and browser/OS UI are not capturable page regions. The focused region and screenshot must remain in the active tab during capture. Browser shortcuts may be reserved by the OS. A newly installed extension cannot recover key history from before installation or page injection.

## Tests

```sh
npm --prefix extension run build
node tools/e2e/extension.e2e.mjs
cd apps/web && npx vitest run src/capture
```

The docs-pass local validation passed 46 Vitest tests and TypeScript; the coordinator verified the extension, integration, web, and real E2E scripts. The extension-only E2E below remains independent of Nano/Firebase; [the real hybrid receipt](../docs/evidence/real-results.json) separately records a completed offline on-device draft, cloud URL-context plan, and real Firestore ticket verification against a synthetic fixed fixture.

The E2E uses only its own temporary Chrome profile and cleans it up; no existing Chrome profiles/processes are touched. Chrome 158's branded build ignores legacy unpacked-loading flags, so the test uses `Extensions.loadUnpacked` with `--enable-unsafe-extension-debugging`. Synthetic keyboard shortcuts do not grant `activeTab`; `Extensions.triggerAction` invokes the real toolbar action on a **tab** target instead of a page target. The test verifies focus trapping/Escape, the unnamed payment button, replay refs, PNG dimensions, and one-time web-origin retrieval. Its local-only HTTP proxy serves the report stub at the authorized origin even when Vite is already listening, so it never depends on another worker's app UI.
