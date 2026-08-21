import { describe, expect, it } from "vitest";
import { getMcpToolCatalog } from "./mcp";

describe("MCP tool contract", () => {
  it("exposes scoped build, list, and metadata tools", () => {
    const tools = getMcpToolCatalog();
    expect(tools.map(tool => tool.name)).toEqual([
      "prismforge_build_app",
      "prismforge_list_apps",
      "prismforge_get_app",
    ]);
  });

  it("requires a prompt only for the programmatic build trigger", () => {
    const build = getMcpToolCatalog()[0];
    const list = getMcpToolCatalog()[1];
    const metadata = getMcpToolCatalog()[2];
    expect(build?.inputSchema.required).toEqual(["prompt"]);
    expect(list?.inputSchema.required).toBeUndefined();
    expect(metadata?.inputSchema.required).toEqual(["appId"]);
  });
});
