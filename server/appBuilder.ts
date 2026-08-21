import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { transform } from "esbuild";
import { nanoid } from "nanoid";
import {
  appArtifacts,
  appSchemaMigrations,
  appSchemaVersions,
  generatedApps,
  mcpApiKeys,
  workspaceMembers,
  type AppSchemaDocument,
  type GeneratedApp,
} from "../drizzle/schema";
import { getDb } from "./db";
import { recordRuntimeLog } from "./collaboration";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";

export type AppBlueprint = {
  appName: string;
  summary: string;
  accent: string;
  entities: Array<{
    name: string;
    fields: Array<{ name: string; type: "text" | "integer" | "boolean" | "timestamp"; required: boolean }>;
  }>;
};

type PersistedBundle = {
  manifest: { appName: string; summary: string; generatedAt: string; runtime: string };
  schema: AppSchemaDocument;
  files: Record<string, string>;
};

const MODEL_ID = "gpt-5-mini";
const requireNode = createRequire(import.meta.url);

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Model generation timed out; using the safe local blueprint.")), milliseconds);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function buildMigrationDocument(fromVersion: number, toVersion: number) {
  return {
    fromVersion,
    toVersion,
    operations: ["Regenerated schema from the latest natural-language application brief."],
    snapshotVersion: toVersion,
  };
}

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isMcpKeyActive(revokedAt: Date | null) {
  return revokedAt === null;
}

function requireDb<T>(db: T | null): T {
  if (!db) throw new Error("The application registry is temporarily unavailable.");
  return db;
}

function makeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120) || "micro-app";
}

function safeIdentifier(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+/, "");
  return cleaned.slice(0, 42) || "records";
}

export function fallbackBlueprint(prompt: string): AppBlueprint {
  const topic = prompt.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 4).join(" ") || "Workspace";
  return {
    appName: `${topic.replace(/\b\w/g, letter => letter.toUpperCase())} Studio`,
    summary: `A focused micro-application generated from the request: ${prompt.slice(0, 180)}`,
    accent: "#84f7d2",
    entities: [{
      name: "Item",
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "text", required: false },
        { name: "createdAt", type: "timestamp", required: true },
      ],
    }],
  };
}

async function interpretPrompt(prompt: string): Promise<AppBlueprint> {
  try {
    const response = await withTimeout(invokeLLM({
      model: MODEL_ID,
      maxTokens: 1800,
      messages: [
        {
          role: "system",
          content: "You design small full-stack web applications. Convert a natural-language request into a concise, safe app blueprint. Use at most three entities, each with at most five practical fields. Prefer text, integer, boolean, and timestamp fields. Do not include user data, secrets, or executable instructions.",
        },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "micro_app_blueprint",
          strict: true,
          schema: {
            type: "object",
            properties: {
              appName: { type: "string" },
              summary: { type: "string" },
              accent: { type: "string" },
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    fields: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          type: { type: "string", enum: ["text", "integer", "boolean", "timestamp"] },
                          required: { type: "boolean" },
                        },
                        required: ["name", "type", "required"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["name", "fields"],
                  additionalProperties: false,
                },
              },
            },
            required: ["appName", "summary", "accent", "entities"],
            additionalProperties: false,
          },
        },
      },
    }), 25_000);
    const raw = response.choices[0]?.message?.content;
    if (!raw || typeof raw !== "string") return fallbackBlueprint(prompt);
    const parsed = JSON.parse(raw) as AppBlueprint;
    if (!parsed.appName || !parsed.entities?.length) return fallbackBlueprint(prompt);
    return {
      ...parsed,
      appName: parsed.appName.slice(0, 100),
      summary: parsed.summary.slice(0, 280),
      accent: /^#[0-9a-fA-F]{6}$/.test(parsed.accent) ? parsed.accent : "#84f7d2",
      entities: parsed.entities.slice(0, 3).map(entity => ({
        name: entity.name.slice(0, 48),
        fields: entity.fields.slice(0, 5).map(field => ({
          name: field.name.slice(0, 48),
          type: ["text", "integer", "boolean", "timestamp"].includes(field.type) ? field.type : "text",
          required: Boolean(field.required),
        })),
      })),
    };
  } catch (error) {
    console.warn("[PrismForge] LLM blueprint fallback:", error instanceof Error ? error.message : error);
    return fallbackBlueprint(prompt);
  }
}

export function buildSchema(blueprint: AppBlueprint, version = 1): AppSchemaDocument {
  return {
    version,
    generatedAt: new Date().toISOString(),
    entities: blueprint.entities.map(entity => ({
      name: safeIdentifier(entity.name),
      fields: entity.fields.map(field => ({
        name: safeIdentifier(field.name),
        type: field.type,
        required: field.required,
      })),
    })),
  };
}

export function buildBundle(blueprint: AppBlueprint, schema: AppSchemaDocument, generatedSource?: string): PersistedBundle {
  const appJson = JSON.stringify(blueprint, null, 2);
  const schemaJson = JSON.stringify(schema, null, 2);
  const entity = schema.entities[0] ?? { name: "records", fields: [] };
  const tableName = safeIdentifier(entity.name);
  const displayName = blueprint.appName.replace(/`/g, "'");
  const files: Record<string, string> = {
    "package.json": JSON.stringify({
      name: makeSlug(blueprint.appName),
      private: true,
      version: "1.0.0",
      type: "module",
      scripts: { dev: "concurrently \"npm:server\" \"npm:client\"", server: "node server/index.mjs", client: "vite", build: "vite build", start: "node server/index.mjs" },
      engines: { node: ">=22.5.0" },
      dependencies: { express: "^4.21.2", react: "^19.2.0", "react-dom": "^19.2.0" },
      devDependencies: { "@vitejs/plugin-react": "^5.0.4", concurrently: "^9.1.2", vite: "^7.1.7" },
    }, null, 2),
    "Dockerfile": `FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nRUN npm run build\nENV PORT=8080\nEXPOSE 8080\nCMD [\"npm\", \"start\"]\n`,
    "README.md": `# ${displayName}\n\n${blueprint.summary}\n\nThis generated micro-app has a dedicated SQLite file at data/app.sqlite. The database is initialized by the Node server and is isolated from every other generated app.\n\n## Run locally\n\n    npm install\n    npm run dev\n\n## Container run\n\n    docker build -t ${makeSlug(blueprint.appName)} .\n    docker run -p 8080:8080 ${makeSlug(blueprint.appName)}\n`,
    "schema.json": schemaJson,
    "server/index.mjs": `import express from "express";\nimport { DatabaseSync } from "node:sqlite";\nimport { mkdirSync } from "node:fs";\nimport { join } from "node:path";\n\nconst app = express();\napp.use(express.json());\nmkdirSync("data", { recursive: true });\nconst db = new DatabaseSync(join("data", "app.sqlite"));\ndb.exec(\`CREATE TABLE IF NOT EXISTS ${tableName} (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, createdAt TEXT NOT NULL)\`);\napp.get("/api/${tableName}", (_req, res) => { const rows = db.prepare("SELECT * FROM ${tableName} ORDER BY id DESC").all(); res.json(rows); });\napp.post("/api/${tableName}", (req, res) => { const title = String(req.body?.title || "Untitled"); const createdAt = new Date().toISOString(); db.prepare("INSERT INTO ${tableName} (title, createdAt) VALUES (?, ?)").run(title, createdAt); res.status(201).json({ title, createdAt }); });\napp.use(express.static("dist"));\napp.get("*", (_req, res) => res.sendFile(join(process.cwd(), "dist", "index.html")));\napp.listen(process.env.PORT || 8080);\n`,
    "index.html": `<div id="root"></div><script type="module" src="/src/main.jsx"></script>`,
    "src/main.jsx": `import { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\nimport "./styles.css";\ncreateRoot(document.getElementById("root")).render(<App />);\n`,
    "src/App.jsx": generatedSource || `import { useEffect, useState } from "react";\n\nconst blueprint = ${appJson};\nconst resource = "${tableName}";\n\nexport default function App() {\n  const [records, setRecords] = useState([]);\n  const [title, setTitle] = useState("");\n  const load = () => fetch("/api/" + resource).then(r => r.json()).then(setRecords);\n  useEffect(load, []);\n  async function addRecord(event) {\n    event.preventDefault();\n    if (!title.trim()) return;\n    await fetch("/api/" + resource, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });\n    setTitle("");\n    load();\n  }\n  return <main style={{ "--accent": blueprint.accent }}><section className="hero"><span>GENERATED MICRO-APP</span><h1>{blueprint.appName}</h1><p>{blueprint.summary}</p></section><section className="panel"><h2>{blueprint.entities[0].name} workspace</h2><form onSubmit={addRecord}><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a new item"/><button>Create</button></form><div className="records">{records.map(row => <article key={row.id}><strong>{row.title}</strong><small>{new Date(row.createdAt).toLocaleString()}</small></article>)}</div></section></main>;\n}\n`,
    "src/styles.css": `:root{font-family:Inter,system-ui;background:#0b1011;color:#eaf7f4}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 10%,color-mix(in srgb,var(--accent) 30%,transparent),transparent 30%),#0b1011}main{max-width:760px;margin:auto;padding:72px 24px}.hero span{font-size:11px;letter-spacing:.18em;color:var(--accent)}h1{font-size:clamp(2.4rem,6vw,4.8rem);margin:.5rem 0}p{max-width:600px;color:#a9c1bc;line-height:1.7}.panel{margin-top:48px;padding:28px;border:1px solid #ffffff1c;border-radius:24px;background:#ffffff0a;backdrop-filter:blur(24px)}form{display:flex;gap:10px;margin:22px 0}input{flex:1;padding:13px 15px;border-radius:12px;border:1px solid #ffffff22;background:#061010;color:white}button{border:0;border-radius:12px;padding:0 18px;background:var(--accent);color:#06221c;font-weight:800}.records{display:grid;gap:10px}article{display:flex;justify-content:space-between;align-items:center;padding:14px;border-radius:12px;background:#ffffff08}small{color:#8ea8a2}\n`,
  };
  return { manifest: { appName: blueprint.appName, summary: blueprint.summary, generatedAt: new Date().toISOString(), runtime: "React 19 + Express + Node SQLite" }, schema, files };
}

async function generateAppSource(blueprint: AppBlueprint, tableName: string) {
  try {
    const response = await invokeLLM({
      model: MODEL_ID,
      maxTokens: 1800,
      messages: [
        {
          role: "system",
          content: "Write a concise, valid React JSX component. Return source only, with no markdown fences. Use only React useEffect/useState imports and export default function App. Do not use external packages, user-provided executable code, eval, dynamic imports, browser storage, cookies, or external network services.",
        },
        {
          role: "user",
          content: `Build the front end for ${blueprint.appName}. Summary: ${blueprint.summary}. The server offers GET /api/${tableName} returning records with id,title,createdAt and POST /api/${tableName} accepting {title}. Use this exact endpoint. Include a friendly empty state and a creation form. Accent color: ${blueprint.accent}.`,
        },
      ],
    });
    const candidate = String(response.choices[0]?.message?.content ?? "")
      .trim()
      .replace(/^```(?:jsx|javascript)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const isSafe = candidate.length > 180 && candidate.length < 12000
      && candidate.includes("export default function App")
      && candidate.includes("useState")
      && candidate.includes(`/api/${tableName}`)
      && !/(eval\s*\(|import\s*\(|localStorage|sessionStorage|document\.cookie|https?:\/\/)/i.test(candidate);
    if (!isSafe) return undefined;
    await transform(candidate, { loader: "jsx", format: "cjs", platform: "node", target: "es2020" });
    return candidate;
  } catch (error) {
    console.warn("[PrismForge] source generation fallback:", error instanceof Error ? error.message : error);
    return undefined;
  }
}

function provisionSQLite(appId: string, schema: AppSchemaDocument) {
  const directory = join(tmpdir(), "prismforge-sandboxes", appId);
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, "app.sqlite");
  const { DatabaseSync } = requireNode("node:sqlite") as typeof import("node:sqlite");
  const sqlite = new DatabaseSync(filePath);
  for (const entity of schema.entities) {
    const columns = entity.fields.map(field => `"${safeIdentifier(field.name)}" ${field.type === "integer" ? "INTEGER" : field.type === "boolean" ? "INTEGER" : "TEXT"}${field.required ? " NOT NULL" : ""}`);
    sqlite.exec(`CREATE TABLE IF NOT EXISTS "${safeIdentifier(entity.name)}" (id INTEGER PRIMARY KEY AUTOINCREMENT${columns.length ? `, ${columns.join(", ")}` : ""})`);
  }
  sqlite.close();
  return readFileSync(filePath);
}

export async function createGeneratedApp(userId: number, prompt: string) {
  const db = requireDb(await getDb());
  const id = nanoid(16);
  const initial = fallbackBlueprint(prompt);
  await db.insert(generatedApps).values({
    id,
    userId,
    name: initial.appName,
    slug: makeSlug(initial.appName),
    prompt,
    summary: "Interpreting the generation request.",
    status: "queued",
    model: MODEL_ID,
  });
  const [app] = await db.select().from(generatedApps).where(eq(generatedApps.id, id)).limit(1);
  void recordRuntimeLog(userId, id, "app.created", "Application generation queued.").catch(() => undefined);
  return app;
}

export async function listGeneratedApps(userId: number) {
  const db = requireDb(await getDb());
  const owned = await db.select().from(generatedApps).where(eq(generatedApps.userId, userId)).orderBy(desc(generatedApps.createdAt));
  const shared = await db.select({ app: generatedApps }).from(generatedApps).innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, generatedApps.workspaceId)).where(eq(workspaceMembers.userId, userId)).orderBy(desc(generatedApps.createdAt));
  const seen = new Set(owned.map(app => app.id));
  return [...owned, ...shared.map(row => row.app).filter(app => !seen.has(app.id))].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export async function getGeneratedApp(userId: number, appId: string) {
  const db = requireDb(await getDb());
  const [app] = await db.select().from(generatedApps).where(and(eq(generatedApps.id, appId), eq(generatedApps.userId, userId))).limit(1);
  return app;
}

export async function getAccessibleGeneratedApp(userId: number, appId: string, roles: Array<"owner" | "editor" | "viewer"> = ["owner", "editor", "viewer"]) {
  const owned = await getGeneratedApp(userId, appId);
  if (owned) return owned;
  const db = requireDb(await getDb());
  const [membership] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, userId), inArray(workspaceMembers.role, roles))).limit(1);
  if (!membership) return undefined;
  const [shared] = await db.select().from(generatedApps).where(and(eq(generatedApps.id, appId), eq(generatedApps.workspaceId, membership.workspaceId))).limit(1);
  return shared;
}

export async function buildGeneratedApp(userId: number, appId: string) {
  const db = requireDb(await getDb());
  const app = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor"]);
  if (!app) throw new Error("The requested application could not be found or you do not have editor access.");
  await db.update(generatedApps).set({ status: "building", errorMessage: null }).where(eq(generatedApps.id, appId));
  void recordRuntimeLog(userId, appId, "build.started", "Application build started.").catch(() => undefined);
  try {
    const blueprint = await interpretPrompt(app.prompt);
    const schema = buildSchema(blueprint, app.status === "ready" ? app.schemaVersion + 1 : 1);
    const generatedSource = await generateAppSource(blueprint, safeIdentifier(schema.entities[0]?.name ?? "records"));
    const bundle = buildBundle(blueprint, schema, generatedSource);
    const sourceText = JSON.stringify(bundle, null, 2);
    const sqliteBytes = provisionSQLite(appId, schema);
    const zip = new JSZip();
    Object.entries(bundle.files).forEach(([path, content]) => zip.file(path, content));
    zip.file("data/app.sqlite", sqliteBytes);
    const zipBytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const prefix = `prismforge/users/${userId}/apps/${appId}`;
    const [sourceArtifact, sqliteArtifact, exportArtifact] = await Promise.all([
      storagePut(`${prefix}/source-bundle-v${schema.version}.json`, sourceText, "application/json"),
      storagePut(`${prefix}/isolated-app-v${schema.version}.sqlite`, sqliteBytes, "application/vnd.sqlite3"),
      storagePut(`${prefix}/${makeSlug(blueprint.appName)}-v${schema.version}.zip`, zipBytes, "application/zip"),
    ]);
    await db.insert(appSchemaVersions).values({ appId, version: schema.version, schemaDocument: schema });
    if (schema.version > 1) {
      await db.insert(appSchemaMigrations).values({
        id: nanoid(16),
        appId,
        fromVersion: schema.version - 1,
        toVersion: schema.version,
        migrationDocument: buildMigrationDocument(schema.version - 1, schema.version),
      });
    }
    await db.insert(appArtifacts).values([
      { id: nanoid(16), appId, artifactType: "source_bundle", objectKey: sourceArtifact.key, objectUrl: sourceArtifact.url, byteSize: Buffer.byteLength(sourceText) },
      { id: nanoid(16), appId, artifactType: "sqlite_database", objectKey: sqliteArtifact.key, objectUrl: sqliteArtifact.url, byteSize: sqliteBytes.byteLength },
      { id: nanoid(16), appId, artifactType: "zip_export", objectKey: exportArtifact.key, objectUrl: exportArtifact.url, byteSize: zipBytes.byteLength },
    ]);
    await db.update(generatedApps).set({
      name: blueprint.appName,
      slug: makeSlug(blueprint.appName),
      summary: blueprint.summary,
      status: "ready",
      schemaVersion: schema.version,
      model: MODEL_ID,
      sourceBundleKey: sourceArtifact.key,
      sourceBundleUrl: sourceArtifact.url,
      sqliteArtifactKey: sqliteArtifact.key,
      sqliteArtifactUrl: sqliteArtifact.url,
      exportArtifactKey: exportArtifact.key,
      exportArtifactUrl: exportArtifact.url,
      updatedAt: new Date(),
    }).where(eq(generatedApps.id, appId));
    const built = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor"]);
    void recordRuntimeLog(userId, appId, "build.completed", `Application build completed at schema v${schema.version}.`, "info", { schemaVersion: schema.version }).catch(() => undefined);
    return { app: built!, previewCode: bundle.files["src/App.jsx"], schema, bundle };
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected generation error occurred.";
    await db.update(generatedApps).set({ status: "failed", errorMessage: message, updatedAt: new Date() }).where(eq(generatedApps.id, appId));
    void recordRuntimeLog(userId, appId, "build.failed", message, "error").catch(() => undefined);
    throw error;
  }
}

export async function listSchemaHistory(userId: number, appId: string) {
  const db = requireDb(await getDb());
  const app = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor", "viewer"]);
  if (!app) throw new Error("The requested application could not be found.");
  return db.select().from(appSchemaVersions).where(eq(appSchemaVersions.appId, appId)).orderBy(desc(appSchemaVersions.version));
}

export async function listSchemaMigrations(userId: number, appId: string) {
  const db = requireDb(await getDb());
  const app = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor", "viewer"]);
  if (!app) throw new Error("The requested application could not be found.");
  return db.select().from(appSchemaMigrations).where(eq(appSchemaMigrations.appId, appId)).orderBy(desc(appSchemaMigrations.createdAt));
}

export function validateRollbackTarget(currentVersion: number, targetVersion: number) {
  if (!Number.isInteger(targetVersion) || targetVersion < 1 || targetVersion >= currentVersion) {
    throw new Error("Choose a previous schema version to roll back to.");
  }
  return true;
}

export async function rollbackGeneratedAppSchema(userId: number, appId: string, targetVersion: number) {
  const db = requireDb(await getDb());
  const app = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor"]);
  if (!app) throw new Error("The requested application could not be found or you do not have editor access.");
  validateRollbackTarget(app.schemaVersion, targetVersion);
  const [target] = await db.select().from(appSchemaVersions).where(and(eq(appSchemaVersions.appId, appId), eq(appSchemaVersions.version, targetVersion))).limit(1);
  if (!target) throw new Error("The requested schema version does not exist.");
  const sqliteBytes = provisionSQLite(`${appId}-rollback-${targetVersion}`, target.schemaDocument);
  const prefix = `prismforge/users/${userId}/apps/${appId}`;
  const artifact = await storagePut(`${prefix}/isolated-app-v${targetVersion}-rollback.sqlite`, sqliteBytes, "application/vnd.sqlite3");
  await db.update(appSchemaMigrations).set({ status: "rolled_back", rolledBackAt: new Date() }).where(and(eq(appSchemaMigrations.appId, appId), eq(appSchemaMigrations.toVersion, app.schemaVersion), eq(appSchemaMigrations.status, "applied")));
  await db.update(generatedApps).set({ schemaVersion: targetVersion, sqliteArtifactKey: artifact.key, sqliteArtifactUrl: artifact.url, updatedAt: new Date() }).where(eq(generatedApps.id, appId));
  const updated = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor"]);
  void recordRuntimeLog(userId, appId, "schema.rolled_back", `Schema rolled back to v${targetVersion}.`, "warn", { targetVersion }).catch(() => undefined);
  return { app: updated!, schema: target.schemaDocument, artifactUrl: artifact.url };
}

export async function getSourceBundle(userId: number, appId: string) {
  const app = await getAccessibleGeneratedApp(userId, appId, ["owner", "editor", "viewer"]);
  if (!app?.sourceBundleUrl) return null;
  return app.sourceBundleUrl;
}

export async function createMcpApiKey(userId: number, label: string) {
  const db = requireDb(await getDb());
  const secret = `pf_mcp_${randomBytes(24).toString("base64url")}`;
  const tokenHash = hashMcpToken(secret);
  await db.insert(mcpApiKeys).values({ id: nanoid(16), userId, label: label.slice(0, 80), tokenPrefix: secret.slice(0, 16), tokenHash });
  void recordRuntimeLog(userId, null, "mcp.key_created", "MCP key issued.", "info", { label: label.slice(0, 80) }).catch(() => undefined);
  return { token: secret, tokenPrefix: secret.slice(0, 16) };
}

export async function listMcpApiKeys(userId: number) {
  const db = requireDb(await getDb());
  return db.select({ id: mcpApiKeys.id, label: mcpApiKeys.label, tokenPrefix: mcpApiKeys.tokenPrefix, lastUsedAt: mcpApiKeys.lastUsedAt, createdAt: mcpApiKeys.createdAt, revokedAt: mcpApiKeys.revokedAt }).from(mcpApiKeys).where(eq(mcpApiKeys.userId, userId)).orderBy(desc(mcpApiKeys.createdAt));
}

export async function revokeMcpApiKey(userId: number, keyId: string) {
  const db = requireDb(await getDb());
  const result = await db.update(mcpApiKeys).set({ revokedAt: new Date() }).where(and(eq(mcpApiKeys.id, keyId), eq(mcpApiKeys.userId, userId), isNull(mcpApiKeys.revokedAt)));
  void recordRuntimeLog(userId, null, "mcp.key_revoked", "MCP key revoked.", "warn", { keyId }).catch(() => undefined);
  return result;
}

export async function rotateMcpApiKey(userId: number, keyId: string, label?: string) {
  await revokeMcpApiKey(userId, keyId);
  void recordRuntimeLog(userId, null, "mcp.key_rotated", "MCP key rotated.", "warn", { keyId }).catch(() => undefined);
  return createMcpApiKey(userId, label ?? "Rotated builder agent");
}

export async function getUserForMcpToken(token: string) {
  const db = requireDb(await getDb());
  const tokenHash = hashMcpToken(token);
  const [key] = await db.select().from(mcpApiKeys).where(and(eq(mcpApiKeys.tokenHash, tokenHash), isNull(mcpApiKeys.revokedAt))).limit(1);
  if (!key) return null;
  await db.update(mcpApiKeys).set({ lastUsedAt: new Date() }).where(eq(mcpApiKeys.id, key.id));
  return key.userId;
}

export function toPublicApp(app: GeneratedApp) {
  return {
    id: app.id,
    name: app.name,
    slug: app.slug,
    summary: app.summary,
    status: app.status,
    schemaVersion: app.schemaVersion,
    model: app.model,
    sourceBundleUrl: app.sourceBundleUrl,
    sqliteArtifactUrl: app.sqliteArtifactUrl,
    exportArtifactUrl: app.exportArtifactUrl,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    errorMessage: app.errorMessage,
  };
}
