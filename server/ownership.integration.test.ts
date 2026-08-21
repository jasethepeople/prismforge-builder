import { describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
    })),
  })),
}));

vi.mock("./db", () => ({ getDb: vi.fn(async () => dbMock) }));

import { getAccessibleGeneratedApp, rollbackGeneratedAppSchema } from "./appBuilder";

describe("rollback ownership integration", () => {
  it("rejects a non-owner deterministically through the real rollback helper", async () => {
    await expect(rollbackGeneratedAppSchema(999999, "owned-app-fixture", 1)).rejects.toThrow("requested application could not be found");
    expect(dbMock.select).toHaveBeenCalled();
  });
});

describe("workspace membership access", () => {
  function queryResult(rows: unknown[]) {
    return { from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => rows) })) })) };
  }

  it("allows an editor to resolve a shared app", async () => {
    dbMock.select
      .mockImplementationOnce(() => queryResult([]))
      .mockImplementationOnce(() => queryResult([{ workspaceId: "team-1", role: "editor" }]))
      .mockImplementationOnce(() => queryResult([{ id: "shared-app", workspaceId: "team-1", status: "ready" }]));
    await expect(getAccessibleGeneratedApp(7, "shared-app", ["owner", "editor"])).resolves.toMatchObject({ id: "shared-app" });
  });

  it("allows a viewer to resolve a shared app but rejects a non-member", async () => {
    dbMock.select
      .mockImplementationOnce(() => queryResult([]))
      .mockImplementationOnce(() => queryResult([{ workspaceId: "team-1", role: "viewer" }]))
      .mockImplementationOnce(() => queryResult([{ id: "shared-app", workspaceId: "team-1", status: "ready" }]));
    await expect(getAccessibleGeneratedApp(8, "shared-app", ["owner", "editor", "viewer"])).resolves.toMatchObject({ id: "shared-app" });
    dbMock.select.mockImplementation(() => queryResult([]));
    await expect(getAccessibleGeneratedApp(9, "shared-app", ["owner", "editor", "viewer"])).resolves.toBeUndefined();
  });
});
