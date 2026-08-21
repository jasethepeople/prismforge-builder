import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { buildBundle, buildMigrationDocument, buildSchema, fallbackBlueprint, hashMcpToken, isMcpKeyActive, validateRollbackTarget } from "./appBuilder";
import { buildPreviewFixtures, createPreviewSession, escapeHtml, executeGeneratedSource, getPreviewSession, isPreviewSourceSafe, revokePreviewSession } from "./preview";

describe("PrismForge enhancement contracts", () => {
  it("creates deterministic, read-only schema-derived preview fixtures", () => {
    const entities = [{ name: "Task", fields: [{ name: "title", type: "text", required: true }, { name: "done", type: "boolean", required: false }, { name: "dueAt", type: "timestamp", required: false }] }];
    const first = buildPreviewFixtures(entities, "app-fixture");
    const second = buildPreviewFixtures(entities, "app-fixture");
    expect(first).toEqual(second);
    expect(first[0]?.rows).toHaveLength(3);
    expect(first[0]?.rows[0]).toMatchObject({ title: expect.any(String), done: false, dueAt: expect.stringContaining("2026-01-10") });
  });
  it("records an explicit forward migration between schema snapshots", () => {
    const migration = buildMigrationDocument(2, 3);
    expect(migration).toEqual({
      fromVersion: 2,
      toVersion: 3,
      operations: ["Regenerated schema from the latest natural-language application brief."],
      snapshotVersion: 3,
    });
  });

  it("keeps schema snapshots deterministic for a rollback target", () => {
    const blueprint = fallbackBlueprint("Build a private editorial planning room");
    const snapshot = buildSchema(blueprint, 2);
    expect(snapshot.version).toBe(2);
    expect(snapshot.entities.length).toBeGreaterThan(0);
    expect(snapshot.generatedAt).toMatch(/T/);
  });

  it("escapes preview content so generated metadata cannot become executable markup", () => {
    expect(escapeHtml("<script>alert('x')</script>")).toBe("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  });

  it("rejects current or future schema versions as rollback targets", () => {
    expect(validateRollbackTarget(3, 2)).toBe(true);
    expect(() => validateRollbackTarget(3, 3)).toThrow("Choose a previous schema version");
    expect(() => validateRollbackTarget(3, 0)).toThrow("Choose a previous schema version");
  });

  it("exposes migration history and MCP lifecycle procedures", () => {
    const procedures = Object.keys((appRouter as any)._def.procedures);
    expect(procedures).toEqual(expect.arrayContaining(["apps.schemaHistory", "apps.schemaMigrations", "apps.rollbackSchema"]));
    expect(procedures).toEqual(expect.arrayContaining(["mcp.createKey", "mcp.listKeys", "mcp.revokeKey", "mcp.rotateKey", "apps.runtimeLogs", "apps.assignWorkspace", "workspaces.list", "workspaces.create"]));
  });

  it("executes a generated React component inside the bounded renderer", async () => {
    const blueprint = fallbackBlueprint("Build a private editorial planning room");
    const source = buildBundle(blueprint, buildSchema(blueprint, 2)).files["src/App.jsx"];
    const markup = await executeGeneratedSource(source);
    expect(markup).toContain("GENERATED MICRO-APP");
    expect(markup).toContain("Studio");
    expect(isPreviewSourceSafe('import fs from "node:fs"')).toBe(false);
  });

  it("keeps preview sessions scoped, expiring, and revocable", () => {
    const session = createPreviewSession(7, "preview-app", 1_000);
    expect(getPreviewSession(session.token, 7, "preview-app", 1_000)?.appId).toBe("preview-app");
    expect(getPreviewSession(session.token, 8, "preview-app", 1_000)).toBeNull();
    expect(getPreviewSession(session.token, 7, "preview-app", session.expiresAt + 1)).toBeNull();
    const active = createPreviewSession(7, "preview-app", 2_000);
    expect(revokePreviewSession(active.token)).toBe(true);
    expect(getPreviewSession(active.token, 7, "preview-app", 2_000)).toBeNull();
  });

  it("hashes MCP secrets and distinguishes active from revoked keys", () => {
    expect(hashMcpToken("pf_mcp_example")).toHaveLength(64);
    expect(hashMcpToken("pf_mcp_example")).toBe(hashMcpToken("pf_mcp_example"));
    expect(isMcpKeyActive(null)).toBe(true);
    expect(isMcpKeyActive(new Date())).toBe(false);
  });
});
