import type { Express, Request } from "express";
import { z } from "zod";
import {
  buildGeneratedApp,
  createGeneratedApp,
  getGeneratedApp,
  getUserForMcpToken,
  listGeneratedApps,
  toPublicApp,
} from "./appBuilder";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };

const buildInput = z.object({ prompt: z.string().min(12).max(4000) });
const appInput = z.object({ appId: z.string().min(8).max(32) });

function reply(res: Parameters<Express["post"]>[1] extends (req: infer _Req, response: infer Res) => unknown ? Res : never, id: JsonRpcRequest["id"], result?: unknown, error?: { code: number; message: string }) {
  res.status(error ? 400 : 200).json(error
    ? { jsonrpc: "2.0", id: id ?? null, error }
    : { jsonrpc: "2.0", id: id ?? null, result });
}

function bearerToken(req: Request) {
  const value = req.header("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

export function getMcpToolCatalog() {
  return [
    {
      name: "prismforge_build_app",
      description: "Create and build a container-ready React and Node.js micro-application from a natural-language prompt.",
      inputSchema: { type: "object", properties: { prompt: { type: "string", description: "The requested application behavior and data needs." } }, required: ["prompt"], additionalProperties: false },
    },
    {
      name: "prismforge_list_apps",
      description: "List applications belonging to the authenticated PrismForge account.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "prismforge_get_app",
      description: "Get an application's lifecycle status, schema version, and durable artifact URLs.",
      inputSchema: { type: "object", properties: { appId: { type: "string" } }, required: ["appId"], additionalProperties: false },
    },
  ];
}

export function registerMcpRoutes(app: Express) {
  app.post("/api/mcp", async (req, res) => {
    const request = (req.body ?? {}) as JsonRpcRequest;
    if (request.jsonrpc !== "2.0" || !request.method) {
      reply(res, request.id, undefined, { code: -32600, message: "Invalid JSON-RPC request." });
      return;
    }
    if (request.method === "initialize") {
      res.setHeader("MCP-Protocol-Version", "2025-03-26");
      reply(res, request.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "prismforge-builder", version: "1.0.0" },
      });
      return;
    }
    if (request.method === "notifications/initialized") {
      res.status(202).end();
      return;
    }

    const token = bearerToken(req);
    if (!token) {
      reply(res, request.id, undefined, { code: -32001, message: "Bearer token required." });
      return;
    }
    const userId = await getUserForMcpToken(token);
    if (!userId) {
      reply(res, request.id, undefined, { code: -32001, message: "Invalid bearer token." });
      return;
    }
    try {
      if (request.method === "tools/list") {
        reply(res, request.id, { tools: getMcpToolCatalog() });
        return;
      }
      if (request.method === "tools/call") {
        const params = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }).parse(request.params ?? {});
        const input = params.arguments ?? {};
        if (params.name === "prismforge_build_app") {
          const { prompt } = buildInput.parse(input);
          const created = await createGeneratedApp(userId, prompt);
          const built = await buildGeneratedApp(userId, created.id);
          reply(res, request.id, { content: [{ type: "text", text: JSON.stringify(toPublicApp(built.app), null, 2) }] });
          return;
        }
        if (params.name === "prismforge_list_apps") {
          const apps = await listGeneratedApps(userId);
          reply(res, request.id, { content: [{ type: "text", text: JSON.stringify(apps.map(toPublicApp), null, 2) }] });
          return;
        }
        if (params.name === "prismforge_get_app") {
          const { appId } = appInput.parse(input);
          const built = await getGeneratedApp(userId, appId);
          if (!built) throw new Error("Application not found.");
          reply(res, request.id, { content: [{ type: "text", text: JSON.stringify(toPublicApp(built), null, 2) }] });
          return;
        }
        reply(res, request.id, { content: [{ type: "text", text: `Unknown tool: ${params.name}` }], isError: true });
        return;
      }
      reply(res, request.id, undefined, { code: -32601, message: "Method not found." });
    } catch (error) {
      reply(res, request.id, { content: [{ type: "text", text: error instanceof Error ? error.message : "Request failed." }], isError: true });
    }
  });
}
