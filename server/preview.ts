import { randomBytes } from "node:crypto";
import vm from "node:vm";
import { transform } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Express } from "express";
import { z } from "zod";
import { getGeneratedApp, listSchemaHistory } from "./appBuilder";
import { sdk } from "./_core/sdk";
import { storageGetSignedUrl } from "./storage";

const appIdSchema = z.string().min(8).max(32);
const PREVIEW_TTL_MS = 10 * 60 * 1000;

type PreviewSession = { token: string; userId: number; appId: string; expiresAt: number };
const previewSessions = new Map<string, PreviewSession>();

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>\"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}

export function createPreviewSession(userId: number, appId: string, now = Date.now()) {
  const token = `pf_preview_${randomBytes(18).toString("base64url")}`;
  const session = { token, userId, appId, expiresAt: now + PREVIEW_TTL_MS };
  previewSessions.set(token, session);
  return session;
}

export function getPreviewSession(token: string, userId: number, appId: string, now = Date.now()) {
  const session = previewSessions.get(token);
  if (!session || session.expiresAt <= now || session.userId !== userId || session.appId !== appId) {
    if (session?.expiresAt && session.expiresAt <= now) previewSessions.delete(token);
    return null;
  }
  return session;
}

export function revokePreviewSession(token: string) {
  return previewSessions.delete(token);
}

export function isPreviewSourceSafe(source: string) {
  return source.length <= 40_000 && !/^\s*import\s*(?:[^;]*?from\s*)?["'](?!react["'])/m.test(source) && !/^\s*export\s+[^\n]*?from\s*["'](?!react["'])/m.test(source) && !/\bimport\s*\(/.test(source) && !/\b(?:eval|Function|WebSocket|XMLHttpRequest|localStorage|sessionStorage|document\.cookie)\b/.test(source);
}

export async function executeGeneratedSource(source: string) {
  if (!isPreviewSourceSafe(source)) return "<p>The stored component was blocked by the preview safety policy.</p>";
  try {
    const compiled = await transform(source, { loader: "jsx", format: "cjs", platform: "node", target: "es2020" });
    const module = { exports: {} as Record<string, unknown> };
    const sandbox = {
      module,
      exports: module.exports,
      React,
      require: (name: string) => name === "react" ? React : (() => { throw new Error("Preview import blocked"); })(),
      console: { log: () => undefined, warn: () => undefined, error: () => undefined },
    };
    vm.runInNewContext(compiled.code, sandbox, { timeout: 80 });
    const Component = module.exports.default as React.ComponentType | undefined;
    return Component ? renderToStaticMarkup(React.createElement(Component)) : "<p>Generated component did not expose a default App.</p>";
  } catch (error) {
    console.warn("[Preview] bounded component execution failed:", error instanceof Error ? error.message : error);
    return "<p>The generated component could not be rendered inside the bounded preview runtime.</p>";
  }
}

export function registerPreviewRoutes(app: Express) {
  app.get("/api/apps/:appId/preview", async (req, res) => {
    const parsed = appIdSchema.safeParse(req.params.appId);
    if (!parsed.success) {
      res.status(400).type("text/plain").send("Invalid application identifier.");
      return;
    }
    let user = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).type("text/plain").send("Authentication is required.");
      return;
    }
    const appRecord = await getGeneratedApp(user.id, parsed.data);
    if (!appRecord || appRecord.status !== "ready") {
      res.status(404).type("text/plain").send("A ready generated application is required for preview.");
      return;
    }
    const token = typeof req.query.session === "string" ? req.query.session : null;
    const session = token ? getPreviewSession(token, user.id, parsed.data) : null;
    if (!session) {
      const created = createPreviewSession(user.id, parsed.data);
      res.redirect(302, `/api/apps/${parsed.data}/preview?session=${encodeURIComponent(created.token)}`);
      return;
    }
    const versions = await listSchemaHistory(user.id, parsed.data);
    const latest = versions.find(version => version.version === appRecord.schemaVersion) ?? versions[0];
    const sourceKey = appRecord.sourceBundleUrl?.replace(/^\/manus-storage\//, "");
    const sourceUrl = sourceKey ? await storageGetSignedUrl(sourceKey) : null;
    const sourcePayload = sourceUrl ? await fetch(sourceUrl).then(response => response.ok ? response.json() as Promise<{ files?: Record<string, string> }> : null) : null;
    const persistedSource = sourcePayload?.files?.["src/App.jsx"];
    const executedMarkup = persistedSource ? await executeGeneratedSource(persistedSource) : "<p>No persisted source bundle is available for this app.</p>";
    const entities = latest?.schemaDocument.entities ?? [];
    const entityMarkup = entities.map(entity => `
      <section class="entity" data-entity="${escapeHtml(entity.name.toLowerCase())}">
        <div class="entity-heading"><span class="entity-index">${escapeHtml(entity.name.slice(0, 1).toUpperCase())}</span><div><h2>${escapeHtml(entity.name)}</h2><p>${entity.fields.length} schema fields</p></div></div>
        <div class="fields">${entity.fields.map(field => `<div class="field"><span>${escapeHtml(field.name)}</span><code>${escapeHtml(field.type)}</code>${field.required ? "<b>required</b>" : ""}</div>`).join("")}</div>
      </section>`).join("");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(appRecord.name)} · PrismForge Preview</title><style>
      :root{color-scheme:dark;font-family:Manrope,system-ui,sans-serif;background:#070b12;color:#effcf9}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 10%,#183b53 0,transparent 38%),radial-gradient(circle at 90% 90%,#124238 0,transparent 38%),#070b12}main{width:min(920px,calc(100% - 36px));margin:0 auto;padding:52px 0 72px}.topline{display:flex;justify-content:space-between;align-items:center;color:#9affe0;font:10px monospace;letter-spacing:.12em;text-transform:uppercase}.secure{border:1px solid #9affe055;border-radius:999px;padding:7px 10px;color:#a9ffe2;background:#a9ffe20e}.hero{margin:54px 0 28px;padding:34px;border:1px solid #ffffff1a;border-radius:24px;background:linear-gradient(135deg,#ffffff19,#ffffff06);backdrop-filter:blur(25px)}h1{margin:10px 0 12px;font-size:clamp(2.6rem,7vw,5rem);letter-spacing:-.08em;line-height:.95}h1 em{color:#9affe0;font-style:normal}.hero p{max-width:650px;color:#a6bdc5;font-size:14px;line-height:1.7}.eyebrow{color:#9affe0;font:10px monospace;letter-spacing:.16em}.preview-tools{display:flex;align-items:center;gap:10px;margin:16px 0 18px}.executed-preview{margin:0 0 24px;padding:16px;border:1px solid #9affe033;border-radius:18px;background:#9affe008}.executed-label{display:flex;justify-content:space-between;color:#9affe0;font:9px monospace;letter-spacing:.12em}.executed-label span:last-child{color:#6f8f90}.executed-canvas{margin-top:12px;min-height:140px;overflow:hidden;border:1px solid #ffffff13;border-radius:13px;background:#071016}.executed-canvas main{width:100%;padding:24px}.executed-canvas .hero{margin:0;border:0;background:transparent;backdrop-filter:none}.executed-canvas .panel{margin-top:16px}.executed-canvas form{display:flex;gap:8px}.executed-canvas input{min-width:0}.preview-tools input{flex:1;border:1px solid #ffffff20;border-radius:10px;padding:10px 12px;color:#e9fffb;background:#ffffff0b;outline:none}.preview-tools span{color:#77939c;font:10px monospace}.entity-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.entity{padding:18px;border:1px solid #ffffff17;border-radius:18px;background:#ffffff09;box-shadow:inset 0 1px 0 #ffffff12}.entity-heading{display:flex;align-items:center;gap:11px}.entity-index{display:grid;width:35px;height:35px;place-items:center;border-radius:11px;color:#08271f;background:#9affe0;font-weight:800}.entity h2{margin:0;font-size:16px;letter-spacing:-.04em}.entity p{margin:3px 0 0;color:#78919c;font:10px monospace}.fields{display:grid;gap:5px;margin-top:17px}.field{display:flex;align-items:center;gap:8px;padding:8px 9px;border-radius:9px;color:#bdd4d9;background:#ffffff07;font:11px monospace}.field code{margin-left:auto;color:#79a7a5}.field b{font-size:9px;color:#a5ffe0;font-weight:400}.foot{margin-top:28px;color:#6d8892;font:10px monospace}</style></head><body><main><div class="topline"><span>PrismForge / isolated preview</span><span class="secure">read-only · schema v${escapeHtml(appRecord.schemaVersion)}</span></div><section class="hero"><div class="eyebrow">GENERATED MICRO-APPLICATION</div><h1>${escapeHtml(appRecord.name)} <em>preview.</em></h1><p>${escapeHtml(appRecord.summary)} This session renders the persisted application registry and schema snapshot through a bounded read-only runtime; no generated write endpoints or arbitrary imports are available.</p></section><div class="preview-tools"><input id="filter" placeholder="Filter schema entities…" aria-label="Filter schema entities"><span>session expires in 10 min</span></div><section class="executed-preview"><div class="executed-label"><span>EXECUTED COMPONENT</span><span>VM budget · 80ms</span></div><div class="executed-canvas">${executedMarkup}</div></section><div class="entity-grid" id="entities">${entityMarkup || "<section class=\"entity\"><p>No schema entities are available.</p></section>"}</div><p class="foot">Runtime boundary: bounded read-only preview session · artifact ${escapeHtml(appRecord.id)} · generated ${escapeHtml(new Date(appRecord.updatedAt).toISOString())}</p></main><script>const input=document.getElementById('filter');const cards=[...document.querySelectorAll('[data-entity]')];input?.addEventListener('input',event=>{const value=event.target.value.toLowerCase();cards.forEach(card=>{card.hidden=!card.dataset.entity.includes(value)})});</script></body></html>`);
  });
}
