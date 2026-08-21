# Project TODO

- [x] Create a floating biometric-style authentication portal with clear sign-in state handling.
- [x] Build the authenticated app-builder dashboard and natural-language generation composer.
- [x] Implement streaming LLM-driven React/Node.js source generation with live token-by-token code preview.
- [x] Define application, generation, schema-registry, file-artifact, and isolation metadata models.
- [x] Persist per-app versioned dynamic schema registries and app status metadata.
- [x] Provision and track an isolated SQLite database artifact for every generated micro-app.
- [x] Persist generated source bundles to S3-compatible storage so they survive restarts.
- [x] Generate and persist downloadable ZIP codebase exports to S3-compatible storage.
- [x] Expose an HTTP MCP-compatible endpoint for authorized build requests and app metadata queries.
- [x] Build the authenticated app library/gallery with lifecycle status, timestamps, previews, and quick actions.
- [x] Apply the Invisible Glassmorphism visual system: translucent layers, deep blur, liquid transitions, and spatial depth.
- [x] Add automated tests for generator contracts, app registry operations, export handling, and MCP request validation.
- [x] Validate responsive rendering, authenticated states, generation flow, export actions, and errors in a signed-in end-to-end session.
- [x] Diagnose and fix the reported blank interface in the user-facing preview.
- [x] Verify that the repaired authentication transition renders the portal or dashboard rather than a blank surface in both signed-out and managed-preview authenticated states.

- [x] Validate authenticated dashboard, library, and inspector at mobile/tablet breakpoints.
- [x] Exercise a signed-in stream or generation failure and verify the visible error state.
- [x] Confirm the authenticated SQLite artifact action downloads successfully.


- [x] Capture explicit authenticated mobile and tablet evidence for the workspace, library, and inspector.
- [x] Trigger and verify a user-facing in-app generation failure state from the signed-in UI.
- [x] Confirm the SQLite artifact in browser download history, matching the ZIP confirmation.

# Enhancement TODO

- [x] Add schema migration history records for each generated app and expose version-aware migration metadata.
- [x] Add safe schema rollback controls with confirmation, ownership checks, and SQLite artifact regeneration.
- [x] Add isolated generated-app preview execution with a bounded preview lifecycle and read-only artifact access.
- [x] Add MCP key rotation, hashed-at-rest credential handling, revocation, and active-key management UI.
- [x] Add automated tests for migration history, rollback ownership, preview isolation, and MCP key lifecycle.
- [x] Validate all three enhancements in the authenticated dashboard and update the project checkpoint.

- [x] Expose migration records with from/to versions, operation summaries, status, and rollback timestamps in the API and schema panel.
- [x] Add automated tests for migration metadata exposure and rollback target/ownership safeguards.
- [x] Add an explicit rollback confirmation dialog before mutating the app schema state.

- [x] Add a bounded preview-session lifecycle and an executable generated-app preview contract with read-only capabilities.
- [x] Add integration tests for migration persistence/exposure, rollback safeguards, preview isolation, and MCP key create/rotate/revoke flows.
- [x] Render migration operation summaries and rollback timestamps in the schema history panel.

- [x] Add a bounded executable preview runner for the generated React source with read-only API capabilities.
- [x] Add actual API-surface integration tests for migration persistence, rollback ownership/target rejection, preview session isolation, and MCP key create/rotate/revoke.

- [x] Validate MCP create, rotate, and revoke through the visible authenticated dashboard controls.
- [x] Re-open the authenticated preview after persisted-source execution fixes and confirm the executed component renders.
- [x] Add actual API-level tests for migration exposure, rollback ownership/target rejection, preview session isolation, and MCP lifecycle operations.

- [x] Add real tRPC caller integration tests for schema history, rollback ownership/invalid targets, and MCP key lifecycle.
- [x] Add HTTP route tests for preview session issuance, expiry, revocation, owner scoping, and unauthorized access.

- [x] Click and verify visible MCP rotate and revoke controls in the authenticated dashboard.
- [x] Add a tRPC caller test proving rollback rejects a non-owner or forbidden app.
- [x] Add HTTP preview tests for expiry, explicit revocation, and cross-user app/session isolation.

- [x] Exercise the real rollback persistence helper with a non-owner app and verify it rejects ownership without mocking the failure.
- [x] Add HTTP preview coverage proving a valid token cannot be reused for another user or another app.
