import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";

const builderMocks = vi.hoisted(() => ({
  listSchemaHistory: vi.fn(),
  listSchemaMigrations: vi.fn(),
  rollbackGeneratedAppSchema: vi.fn(),
  toPublicApp: vi.fn((app: unknown) => app),
  listMcpApiKeys: vi.fn(),
  createMcpApiKey: vi.fn(),
  revokeMcpApiKey: vi.fn(),
  rotateMcpApiKey: vi.fn(),
  getGeneratedApp: vi.fn(),
  getAccessibleGeneratedApp: vi.fn(),
}));
const sdkMocks = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));
const storageMocks = vi.hoisted(() => ({ storageGetSignedUrl: vi.fn() }));

vi.mock("./appBuilder", () => builderMocks);
vi.mock("./_core/sdk", () => ({ sdk: sdkMocks }));
vi.mock("./storage", () => storageMocks);

import { appRouter } from "./routers";
import { createPreviewSession, registerPreviewRoutes, revokePreviewSession } from "./preview";

type TestUser = { id: number; openId: string; name: string; email: string; role: "user"; loginMethod: string; createdAt: Date; updatedAt: Date; lastSignedIn: Date };
const user: TestUser = { id: 42, openId: "integration-user", name: "Integration User", email: "integration@example.com", role: "user", loginMethod: "test", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
const ctx = { user, req: {} as never, res: {} as never };

function createPreviewServer() {
  const app = express();
  registerPreviewRoutes(app);
  return new Promise<{ server: http.Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

describe("enhancement API integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.authenticateRequest.mockResolvedValue(user);
    builderMocks.listSchemaHistory.mockResolvedValue([{ version: 2, schemaDocument: { version: 2, entities: [] }, createdAt: new Date() }]);
    builderMocks.listSchemaMigrations.mockResolvedValue([{ fromVersion: 1, toVersion: 2, status: "applied" }]);
    builderMocks.createMcpApiKey.mockResolvedValue({ token: "pf_mcp_integration", tokenPrefix: "pf_mcp_integrati" });
    builderMocks.listMcpApiKeys.mockResolvedValue([{ id: "key-integration", revokedAt: null }]);
    builderMocks.revokeMcpApiKey.mockResolvedValue({ affectedRows: 1 });
    builderMocks.rotateMcpApiKey.mockResolvedValue({ token: "pf_mcp_rotated", tokenPrefix: "pf_mcp_rotated" });
  });

  it("calls the real tRPC procedures for schema history and migration audit data", async () => {
    const caller = appRouter.createCaller(ctx as never);
    await expect(caller.apps.schemaHistory({ appId: "app-integration" })).resolves.toHaveLength(1);
    await expect(caller.apps.schemaMigrations({ appId: "app-integration" })).resolves.toEqual([{ fromVersion: 1, toVersion: 2, status: "applied" }]);
    expect(builderMocks.listSchemaHistory).toHaveBeenCalledWith(42, "app-integration");
    expect(builderMocks.listSchemaMigrations).toHaveBeenCalledWith(42, "app-integration");
  });

  it("enforces rollback input validation and forwards ownership-scoped mutations", async () => {
    const caller = appRouter.createCaller(ctx as never);
    await expect(caller.apps.rollbackSchema({ appId: "app-integration", targetVersion: 0 })).rejects.toThrow();
    builderMocks.rollbackGeneratedAppSchema.mockRejectedValueOnce(new Error("Application does not belong to this user"));
    await expect(caller.apps.rollbackSchema({ appId: "app-integration", targetVersion: 1 })).rejects.toThrow("does not belong");
    builderMocks.rollbackGeneratedAppSchema.mockResolvedValue({ app: { id: "app-integration" }, schema: { version: 1, entities: [] }, artifactUrl: "/artifact" });
    await expect(caller.apps.rollbackSchema({ appId: "app-integration", targetVersion: 1 })).resolves.toEqual({ app: { id: "app-integration" }, schema: { version: 1, entities: [] }, artifactUrl: "/artifact" });
    expect(builderMocks.rollbackGeneratedAppSchema).toHaveBeenCalledWith(42, "app-integration", 1);
  });

  it("calls MCP create, list, rotate, and revoke procedures through the protected router", async () => {
    const caller = appRouter.createCaller(ctx as never);
    await expect(caller.mcp.createKey({ label: "Integration key" })).resolves.toMatchObject({ token: "pf_mcp_integration" });
    await expect(caller.mcp.listKeys()).resolves.toHaveLength(1);
    await expect(caller.mcp.rotateKey({ keyId: "key-integration" })).resolves.toMatchObject({ token: "pf_mcp_rotated" });
    await expect(caller.mcp.revokeKey({ keyId: "key-integration" })).resolves.toMatchObject({ affectedRows: 1 });
    expect(builderMocks.createMcpApiKey).toHaveBeenCalledWith(42, "Integration key");
    expect(builderMocks.rotateMcpApiKey).toHaveBeenCalledWith(42, "key-integration", undefined);
    expect(builderMocks.revokeMcpApiKey).toHaveBeenCalledWith(42, "key-integration");
  });
});

describe("preview HTTP integration", () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("rejects an unauthenticated preview request at the HTTP boundary", async () => {
    sdkMocks.authenticateRequest.mockResolvedValue(null);
    ({ server, baseUrl } = await createPreviewServer());
    const response = await fetch(`${baseUrl}/api/apps/app-integration/preview`);
    expect(response.status).toBe(401);
  });

  it("does not expose another user’s app through the preview route", async () => {
    sdkMocks.authenticateRequest.mockResolvedValue(user);
    builderMocks.getAccessibleGeneratedApp.mockResolvedValue(null);
    ({ server, baseUrl } = await createPreviewServer());
    const response = await fetch(`${baseUrl}/api/apps/app-integration/preview`);
    expect(response.status).toBe(404);
  });

  it("rejects expired and revoked preview tokens by issuing a fresh session", async () => {
    sdkMocks.authenticateRequest.mockResolvedValue(user);
    builderMocks.getAccessibleGeneratedApp.mockResolvedValue({ id: "app-integration", userId: 42, prompt: "Build a brief workspace", schemaVersion: 1, status: "ready", name: "Integration app", summary: "A test app", updatedAt: new Date(), sourceBundleUrl: null });
    ({ server, baseUrl } = await createPreviewServer());
    const expired = createPreviewSession(42, "app-integration", Date.now() - 10 * 60 * 1000 - 1);
    const expiredResponse = await fetch(`${baseUrl}/api/apps/app-integration/preview?session=${expired.token}`, { redirect: "manual" });
    expect(expiredResponse.status).toBe(302);
    const revoked = createPreviewSession(42, "app-integration");
    revokePreviewSession(revoked.token);
    const revokedResponse = await fetch(`${baseUrl}/api/apps/app-integration/preview?session=${revoked.token}`, { redirect: "manual" });
    expect(revokedResponse.status).toBe(302);
    const otherUser = createPreviewSession(99, "app-integration");
    const otherUserResponse = await fetch(`${baseUrl}/api/apps/app-integration/preview?session=${otherUser.token}`, { redirect: "manual" });
    expect(otherUserResponse.status).toBe(302);
    const otherApp = createPreviewSession(42, "other-app");
    const otherAppResponse = await fetch(`${baseUrl}/api/apps/app-integration/preview?session=${otherApp.token}`, { redirect: "manual" });
    expect(otherAppResponse.status).toBe(302);
  });

  it("issues a scoped preview session through the HTTP route for an owned app", async () => {
    sdkMocks.authenticateRequest.mockResolvedValue(user);
    builderMocks.getAccessibleGeneratedApp.mockResolvedValue({ id: "app-integration", userId: 42, prompt: "Build a brief workspace", schemaVersion: 1, status: "ready", name: "Integration app", summary: "A test app", updatedAt: new Date(), sourceBundleUrl: null });
    ({ server, baseUrl } = await createPreviewServer());
    const response = await fetch(`${baseUrl}/api/apps/app-integration/preview`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/\/api\/apps\/app-integration\/preview\?session=pf_preview_/);
  });
});

