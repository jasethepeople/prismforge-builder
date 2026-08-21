# Preview Validation Notes

The repaired preview now renders a visible state without a blank intermediary. The managed preview session displays the authenticated PrismForge dashboard with the builder composer, source panel, app-library area, and agent bridge. A direct signed-out browser visit renders the floating biometric authentication portal and its Manus sign-in action immediately.

The blank-looking loading surface was removed from the authentication transition. Compilation and all six existing automated tests pass after this correction.

The signed-in browser session was exercised with a real launch-tracker prompt. The UI progressed from queued synthesis to a ready application, displayed generated React source in the live source panel, showed schema v1, and surfaced both ZIP and SQLite artifact links. The ZIP action was clicked and Chrome download history confirmed `calmlaunch-tracker-v1_1a70400e.zip` was downloaded.

The visible authenticated dashboard and generated app library rendered correctly throughout the flow. No browser-console errors were reported during the build.

This validates the authenticated generation, source display, ready-state metadata, and ZIP download path. The SQLite link is present in the ready inspector; direct click verification remains optional because the download route is the same durable storage proxy path.

Validation date: 2026-08-21.

Key artifacts:
- App: CalmLaunch Tracker
- App ID: VrLaykinwBSdhqaa
- ZIP: calmlaunch-tracker-v1_1a70400e.zip
- Schema: v1
- Runtime: Node / React
- Durable SQLite artifact: present in inspector

Build progress observed:
- Queued → Synthesis active → Build complete
- Source panel populated with generated React JSX
- Library updated from 0 to 1 application
- SQLite sandbox metric updated from 0 to 1
- ZIP download confirmed in browser history

This result is the end-to-end validation evidence for the remaining TODO item.

Source: browser preview and download history.

Additional signed-in validation:

The authenticated dashboard was captured at a 375px mobile viewport. The composer, metrics, source panel, build inspector, schema registry, app library, and MCP bridge all remained visible and usable in a single-column responsive layout. The ready app inspector exposed the SQLite artifact link, and the link was clicked from the authenticated UI. The browser remained on the workspace because the artifact download was handled by the browser download surface; the durable artifact URL was confirmed in the ready-state inspector as `/manus-storage/prismforge/users/1/apps/VrLaykinwBSdhqaa/isolated-app-v1_73ceb4ae.sqlite`.

Error-path validation:

With the authenticated session active, the builder stream endpoint was opened using an invalid app identifier. It returned a structured SSE sequence rather than a blank response: `event: phase` with `Interpreting your application brief`, followed by `event: error` with `The requested application could not be found.` The browser was then returned to the ready authenticated dashboard, which remained intact and visible.

Responsive evidence:

An authenticated 768x1024 tablet capture was reviewed. The workspace rail, generation composer, metrics, live source panel, ready build inspector, schema registry, app library, and MCP bridge all remain visible and usable. The inspector actions stay within the card, the library is readable, and the tablet composition preserves the spatial-glass hierarchy without horizontal clipping.

Artifact download evidence:

The authenticated SQLite artifact action was clicked again and Chrome download history now shows two successful entries: `isolated-app-v1_73ceb4ae.sqlite` and `isolated-app-v1_73ceb4ae (1).sqlite`. The ZIP entry `calmlaunch-tracker-v1_1a70400e.zip` is also present in the same history. This confirms both durable artifact actions download successfully.

In-app error-state evidence:

On the signed-in ready workspace, a temporary browser-only EventSource interruption was injected without modifying persisted project data. Clicking the existing Reforge action produced the user-facing toast and source-panel message `Controlled stream interruption for validation`. The dashboard, ready inspector, artifact links, schema panel, and app library remained visible. The browser’s native EventSource was restored immediately afterward.

## Enhancement pass

Schema migration history is now exposed through a dedicated authenticated query, including version transitions, operation summaries, status, and rollback timestamps. Rollback is guarded by ownership checks, target-version validation, and an explicit browser confirmation.

Preview sessions now use expiring scoped tokens. The preview loads the persisted `src/App.jsx` from object storage, validates imports and restricted APIs, transpiles it, and executes it in a Node VM with an 80 ms budget. The page also renders a read-only schema data view and denies non-React imports and browser persistence/network primitives.

MCP credentials remain hashed at rest and now support create, rotate, list, and revoke operations through the authenticated UI/API. Final automated validation passed: 4 test files, 14 tests, plus TypeScript compilation. The executable preview route was rechecked in the authenticated browser and rendered the executed component region with the bounded-runtime label.

The current source-generation flow also validates model-authored JSX with esbuild before persisting it, and model calls are bounded with a 25-second timeout so the dashboard exits active generation states reliably.

## Final persisted-source and MCP evidence

The dashboard was re-opened after the persisted-source fix. The existing app is now schema v2 with an applied v1 → v2 migration record, a visible Restore v1 control, and operation/timestamp audit metadata. The visible Agent Bridge issued a fresh key and rendered it with rotate/revoke controls; the previous validation keys remain visibly revoked. The authenticated preview was opened from the dashboard and now renders the v2 persisted `src/App.jsx` in the `EXECUTED COMPONENT` section under the 80 ms VM budget, with the read-only schema data controls and 10-minute scoped session label.

The final automated suite passes 14 tests across 4 files, and TypeScript compilation passes.
