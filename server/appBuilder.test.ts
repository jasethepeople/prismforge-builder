import { describe, expect, it } from "vitest";
import { buildBundle, buildSchema, fallbackBlueprint, type AppBlueprint } from "./appBuilder";

const blueprint: AppBlueprint = {
  appName: "Signal Board",
  summary: "A lightweight project signal tracker.",
  accent: "#84f7d2",
  entities: [{
    name: "Signal",
    fields: [
      { name: "title", type: "text", required: true },
      { name: "isOpen", type: "boolean", required: false },
    ],
  }],
};

describe("app builder bundle contract", () => {
  it("turns a blueprint into a versioned schema document", () => {
    const schema = buildSchema(blueprint, 4);
    expect(schema.version).toBe(4);
    expect(schema.entities[0]).toEqual({
      name: "signal",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "isopen", type: "boolean", required: false },
      ],
    });
  });

  it("creates a portable React, Node, Docker, and SQLite-ready bundle", () => {
    const bundle = buildBundle(blueprint, buildSchema(blueprint));
    expect(bundle.files["Dockerfile"]).toContain("RUN npm install");
    expect(bundle.files["server/index.mjs"]).toContain("DatabaseSync");
    expect(bundle.files["server/index.mjs"]).toContain("res.json(rows)");
    expect(bundle.files["src/App.jsx"]).toContain("Signal Board");
    expect(bundle.files["schema.json"]).toContain('"version": 1');
  });

  it("provides a safe fallback blueprint when a structured model response is unavailable", () => {
    const fallback = fallbackBlueprint("Build a creative team planning board");
    expect(fallback.appName).toContain("Studio");
    expect(fallback.entities[0]?.fields).toHaveLength(3);
  });
});
