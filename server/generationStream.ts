import type { Express } from "express";
import { z } from "zod";
import { buildGeneratedApp } from "./appBuilder";
import { sdk } from "./_core/sdk";

const appIdSchema = z.string().min(8).max(32);
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Streams the compiled micro-app source in small chunks after the model has
 * produced its validated blueprint. The model gateway exposes structured
 * completions, so this route performs the transport-level progressive delivery
 * needed by the editor without exposing credentials or unsafe generated code.
 */
export function registerGenerationStreamRoutes(app: Express) {
  app.get("/api/builder/:appId/stream", async (req, res) => {
    const parsed = appIdSchema.safeParse(req.params.appId);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid application identifier." });
      return;
    }
    let user = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ error: "Authentication is required." });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let responseClosed = false;
    res.on("close", () => {
      responseClosed = true;
    });
    const emit = (event: string, payload: unknown) => {
      if (!responseClosed) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    emit("phase", { label: "Interpreting your application brief" });
    try {
      const built = await buildGeneratedApp(user.id, parsed.data);
      emit("phase", { label: "Provisioning isolated SQLite and export bundle" });
      const code = built.previewCode;
      const chunkSize = 26;
      for (let start = 0; start < code.length; start += chunkSize) {
        if (responseClosed) break;
        emit("token", { value: code.slice(start, start + chunkSize) });
        await sleep(8);
      }
      emit("complete", {
        app: built.app,
        schema: built.schema,
        sourceBundleUrl: built.app.sourceBundleUrl,
        exportArtifactUrl: built.app.exportArtifactUrl,
      });
    } catch (error) {
      emit("error", { message: error instanceof Error ? error.message : "Generation did not complete." });
    } finally {
      if (!responseClosed) res.end();
    }
  });
}
