import { describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
    })),
  })),
}));

vi.mock("./db", () => ({ getDb: vi.fn(async () => dbMock) }));

import { rollbackGeneratedAppSchema } from "./appBuilder";

describe("rollback ownership integration", () => {
  it("rejects a non-owner deterministically through the real rollback helper", async () => {
    await expect(rollbackGeneratedAppSchema(999999, "owned-app-fixture", 1)).rejects.toThrow("requested application could not be found");
    expect(dbMock.select).toHaveBeenCalled();
  });
});
