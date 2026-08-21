import { describe, expect, it } from "vitest";
import { filterRuntimeLogs, formatRuntimeLogFilterHint } from "../shared/runtimeLogs";

describe("runtime log filtering", () => {
  const logs = [
    { event: "build.completed", message: "Build completed", level: "info" },
    { event: "mcp.request", message: "MCP tools/list request", level: "warn" },
    { event: "export.downloaded", message: "ZIP export download requested", level: "info" },
  ];

  it("returns all logs for an empty filter", () => {
    expect(filterRuntimeLogs(logs, "  ")).toEqual(logs);
  });

  it("matches event, message, and level case-insensitively", () => {
    expect(filterRuntimeLogs(logs, "MCP")).toHaveLength(1);
    expect(filterRuntimeLogs(logs, "WARN")).toHaveLength(1);
    expect(filterRuntimeLogs(logs, "zip export")).toHaveLength(1);
  });

  it("provides a stable filter status hint", () => {
    expect(formatRuntimeLogFilterHint("")).toBe("Showing all runtime events");
    expect(formatRuntimeLogFilterHint(" build ")).toContain("build");
  });
});
