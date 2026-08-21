import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ArrowUpRight,
  Bot,
  Box,
  Check,
  ChevronRight,
  CircleDot,
  Code2,
  Copy,
  Database,
  Eye,
  History,
  RotateCcw,
  ShieldOff,
  Download,
  Fingerprint,
  KeyRound,
  Layers3,
  Loader2,
  LockKeyhole,
  Network,
  Plus,
  ScanFace,
  Sparkles,
  TerminalSquare,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type GeneratedApp = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  status: "queued" | "building" | "ready" | "failed";
  schemaVersion: number;
  model: string | null;
  sourceBundleUrl: string | null;
  sqliteArtifactUrl: string | null;
  exportArtifactUrl: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  errorMessage: string | null;
};

type SchemaDocument = { version: number; entities: Array<{ name: string; fields: Array<{ name: string; type: string; required: boolean }> }> };

const starterPrompt = "Build a client briefing workspace where teams can capture a brief, track review status, and keep a small list of deliverables.";

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

function AppStatus({ status }: { status: GeneratedApp["status"] }) {
  return <span className={cn("status-pill", `status-${status}`)}><i />{status}</span>;
}

function AuthPortal() {
  return (
    <main className="auth-stage">
      <div className="auth-light auth-light-one" />
      <div className="auth-light auth-light-two" />
      <header className="portal-brand"><span className="brand-mark"><Sparkles size={15} /></span><strong>PrismForge</strong><span className="brand-divider" /> <small>APP BUILDER</small></header>
      <section className="biometric-portal" aria-label="PrismForge secure sign in">
        <div className="portal-orbit orbit-a" /><div className="portal-orbit orbit-b" /><div className="portal-orbit orbit-c" />
        <div className="scan-core"><Fingerprint size={48} strokeWidth={1.2} /><span className="scan-line" /></div>
        <p className="eyebrow">SECURE BUILD ENVIRONMENT</p>
        <h1>Enter the<br /><em>build space.</em></h1>
        <p className="portal-copy">Authenticate to generate isolated micro-applications, retain durable artifacts, and grant controlled agent access.</p>
        <button className="biometric-button" onClick={() => startLogin()}><ScanFace size={20} /> Authenticate with Manus <ArrowUpRight size={16} /></button>
        <div className="portal-foot"><span><LockKeyhole size={12} /> encrypted session</span><span><CircleDot size={12} /> isolated runtime</span></div>
      </section>
      <p className="auth-caption">Natural language → durable micro-applications</p>
    </main>
  );
}

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const utils = trpc.useUtils();
  const appsQuery = trpc.apps.list.useQuery(undefined, { enabled: isAuthenticated });
  const createApp = trpc.apps.create.useMutation();
  const createKey = trpc.mcp.createKey.useMutation();
  const revokeKey = trpc.mcp.revokeKey.useMutation();
  const rotateKey = trpc.mcp.rotateKey.useMutation();
  const mcpKeys = trpc.mcp.listKeys.useQuery(undefined, { enabled: isAuthenticated });
  const [prompt, setPrompt] = useState("");
  const [activeApp, setActiveApp] = useState<GeneratedApp | null>(null);
  const [streamCode, setStreamCode] = useState("");
  const [schema, setSchema] = useState<SchemaDocument | null>(null);
  const [streamPhase, setStreamPhase] = useState("Ready for a new build");
  const [isBuilding, setIsBuilding] = useState(false);
  const [mcpToken, setMcpToken] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  useEffect(() => () => streamRef.current?.close(), []);
  const sortedApps = appsQuery.data ?? [];
  const displayApp = activeApp ?? sortedApps[0] ?? null;
  const schemaHistory = trpc.apps.schemaHistory.useQuery({ appId: displayApp?.id ?? "placeholder" }, { enabled: Boolean(isAuthenticated && displayApp?.id) });
  const schemaMigrations = trpc.apps.schemaMigrations.useQuery({ appId: displayApp?.id ?? "placeholder" }, { enabled: Boolean(isAuthenticated && displayApp?.id) });
  const rollbackSchema = trpc.apps.rollbackSchema.useMutation();
  const visibleSchema = schema ?? schemaHistory.data?.find(version => version.version === displayApp?.schemaVersion)?.schemaDocument ?? schemaHistory.data?.[0]?.schemaDocument ?? null;
  const outputLines = useMemo(() => streamCode.split("\n").map((line, index) => ({ line, number: index + 1 })), [streamCode]);

  function openApp(app: GeneratedApp) {
    setActiveApp(app);
    setSchema(null);
    setStreamCode("");
    setStreamPhase(app.status === "ready" ? "Artifact ready — select export or generate another build" : "Build status: " + app.status);
  }

  async function triggerBuild() {
    const request = prompt.trim();
    if (request.length < 12 || isBuilding) {
      toast.error("Describe the app in at least 12 characters.");
      return;
    }
    try {
      setIsBuilding(true);
      setStreamCode("");
      setSchema(null);
      setStreamPhase("Queuing your generation request");
      const created = await createApp.mutateAsync({ prompt: request });
      setActiveApp(created);
      setPrompt("");
      await utils.apps.list.invalidate();
      streamRef.current?.close();
      const stream = new EventSource(`/api/builder/${created.id}/stream`);
      streamRef.current = stream;
      stream.addEventListener("phase", event => {
        const data = JSON.parse((event as MessageEvent).data) as { label: string };
        setStreamPhase(data.label);
      });
      stream.addEventListener("token", event => {
        const data = JSON.parse((event as MessageEvent).data) as { value: string };
        setStreamCode(previous => previous + data.value);
      });
      stream.addEventListener("complete", event => {
        const data = JSON.parse((event as MessageEvent).data) as { app: GeneratedApp; schema: SchemaDocument };
        setActiveApp(data.app);
        setSchema(data.schema);
        setStreamPhase("Build complete — bundle, database, and ZIP export persisted");
        setIsBuilding(false);
        stream.close();
        void utils.apps.list.invalidate();
        toast.success("Micro-app bundle generated and stored.");
      });
      stream.addEventListener("error", event => {
        const message = event instanceof MessageEvent && event.data ? (JSON.parse(event.data) as { message?: string }).message : "The build stream closed unexpectedly.";
        setStreamPhase(message ?? "The build stream closed unexpectedly.");
        setIsBuilding(false);
        stream.close();
        void utils.apps.list.invalidate();
        toast.error(message ?? "Generation failed.");
      });
    } catch (error) {
      setIsBuilding(false);
      toast.error(error instanceof Error ? error.message : "Could not start the application build.");
    }
  }

  function reforgeActiveApp() {
    if (!displayApp || isBuilding) return;
    setIsBuilding(true);
    setStreamCode("");
    setSchema(null);
    setStreamPhase("Reforging source and advancing schema version");
    streamRef.current?.close();
    const stream = new EventSource(`/api/builder/${displayApp.id}/stream`);
    streamRef.current = stream;
    stream.addEventListener("phase", event => {
      const data = JSON.parse((event as MessageEvent).data) as { label: string };
      setStreamPhase(data.label);
    });
    stream.addEventListener("token", event => {
      const data = JSON.parse((event as MessageEvent).data) as { value: string };
      setStreamCode(previous => previous + data.value);
    });
    stream.addEventListener("complete", event => {
      const data = JSON.parse((event as MessageEvent).data) as { app: GeneratedApp; schema: SchemaDocument };
      setActiveApp(data.app);
      setSchema(data.schema);
      setStreamPhase(`Schema v${data.schema.version} persisted with refreshed artifacts`);
      setIsBuilding(false);
      stream.close();
      void utils.apps.list.invalidate();
      toast.success(`Reforged ${data.app.name} as schema v${data.schema.version}.`);
    });
    stream.addEventListener("error", event => {
      const message = event instanceof MessageEvent && event.data ? (JSON.parse(event.data) as { message?: string }).message : "The reforge stream closed unexpectedly.";
      setStreamPhase(message ?? "The reforge stream closed unexpectedly.");
      setIsBuilding(false);
      stream.close();
      void utils.apps.list.invalidate();
      toast.error(message ?? "Reforge failed.");
    });
  }

  async function createMcpKey() {
    try {
      const response = await createKey.mutateAsync({ label: "Builder agent" });
      setMcpToken(response.token);
      await mcpKeys.refetch();
      toast.success("A new agent key is ready. Copy it now; it is only shown once.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not issue the agent key.");
    }
  }

  async function rollbackToVersion(version: number) {
    if (!displayApp || rollbackSchema.isPending) return;
    const confirmed = window.confirm(`Restore ${displayApp.name} to schema v${version}? This will replace the current isolated SQLite artifact with the selected snapshot.`);
    if (!confirmed) return;
    setRollbackTarget(version);
    try {
      const result = await rollbackSchema.mutateAsync({ appId: displayApp.id, targetVersion: version });
      setActiveApp(result.app);
      setSchema(result.schema);
      await Promise.all([utils.apps.list.invalidate(), schemaHistory.refetch()]);
      toast.success(`SQLite sandbox restored to schema v${version}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Schema rollback failed.");
    } finally {
      setRollbackTarget(null);
    }
  }

  async function revokeAgentKey(keyId: string) {
    try {
      await revokeKey.mutateAsync({ keyId });
      await mcpKeys.refetch();
      toast.success("Agent key revoked.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke that key.");
    }
  }

  async function rotateAgentKey(keyId: string) {
    try {
      const result = await rotateKey.mutateAsync({ keyId, label: "Rotated builder agent" });
      setMcpToken(result.token);
      await mcpKeys.refetch();
      toast.success("Key rotated. Copy the new secret now; it is shown once.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rotate that key.");
    }
  }

  function copy(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  }

  if (!isAuthenticated) return <AuthPortal />;

  return (
    <main className="forge-shell">
      <div className="ambient ambient-left" /><div className="ambient ambient-right" /><div className="noise" />
      <aside className="rail glass-panel">
        <div className="rail-brand"><span className="brand-mark"><Sparkles size={15} /></span><span>PrismForge</span></div>
        <nav className="rail-nav" aria-label="Workspace navigation">
          <button className="nav-active"><Zap size={17} /> Build space</button>
          <button onClick={() => document.getElementById("app-library")?.scrollIntoView({ behavior: "smooth" })}><Layers3 size={17} /> App library <span>{sortedApps.length}</span></button>
          <button onClick={() => document.getElementById("agent-bridge")?.scrollIntoView({ behavior: "smooth" })}><Network size={17} /> Agent bridge</button>
        </nav>
        <div className="rail-bottom">
          <div className="secure-card"><LockKeyhole size={15} /><div><b>Sandbox boundary</b><span>isolated per app</span></div></div>
          <div className="account-chip"><span>{(user?.name ?? "P").slice(0, 1).toUpperCase()}</span><div><b>{user?.name ?? "PrismForge user"}</b><button onClick={() => logout()}>Sign out</button></div></div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">PRISMFORGE / STUDIO 01</p><h1>Shape an app from <em>thought.</em></h1></div>
          <div className="runtime-status"><span className="pulse-dot" /> generation fabric online</div>
        </header>

        <section className="hero-grid">
          <div className="composer glass-panel">
            <div className="composer-header"><div><p className="eyebrow">NEW MICRO-APPLICATION</p><h2>What will we build?</h2></div><span className="model-chip"><Bot size={14} /> {isBuilding ? "Synthesis active" : "gpt-5-mini"}</span></div>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Describe the workflow, people, data, and interactions you need…" aria-label="Micro-application request" />
            <div className="composer-footer"><button className="prompt-suggestion" onClick={() => setPrompt(starterPrompt)}><Sparkles size={13} /> Try an example</button><button className="build-button" onClick={triggerBuild} disabled={isBuilding}>{isBuilding ? <Loader2 className="spin" size={16} /> : <ArrowUpRight size={16} />} {isBuilding ? "Forging" : "Forge app"}</button></div>
          </div>
          <div className="metrics-stack">
            <div className="metric glass-panel"><span className="metric-icon cyan"><Box size={18} /></span><div><b>{sortedApps.length}</b><small>applications</small></div><span className="metric-orb" /></div>
            <div className="metric glass-panel"><span className="metric-icon violet"><Database size={18} /></span><div><b>{sortedApps.filter(app => app.status === "ready").length}</b><small>SQLite sandboxes</small></div><span className="metric-orb" /></div>
            <div className="micro-note"><span><Check size={12} /> artifact persistence enabled</span><span><Check size={12} /> container blueprint included</span></div>
          </div>
        </section>

        <section className="build-grid">
          <div className="code-workbench glass-panel">
            <div className="panel-bar"><div className="panel-title"><TerminalSquare size={16} /><span>LIVE SOURCE</span><em>{displayApp?.slug ? `src/App.jsx · ${displayApp.slug}` : "waiting for a build"}</em></div><div className="panel-actions"><span className={cn("build-state", isBuilding && "building")}><i /> {streamPhase}</span>{streamCode && <button onClick={() => copy(streamCode, "Source") }><Copy size={14} /></button>}</div></div>
            <div className="code-window">
              {streamCode ? <pre>{outputLines.map(({ line, number }) => <code key={number}><span>{String(number).padStart(2, "0")}</span>{line || " "}</code>)}</pre> : <div className="code-empty"><div className="empty-glyph"><Code2 size={28} /></div><h3>{displayApp ? displayApp.name : "Your generated source will materialize here."}</h3><p>{displayApp ? displayApp.summary : "Start with a plain-language brief. PrismForge will prepare a React and Node.js source bundle, isolated SQLite schema, and portable export."}</p></div>}
              {isBuilding && <div className="code-caret" />}
            </div>
          </div>

          <aside className="inspector-stack">
            <div className="app-card glass-panel">
              <div className="inspector-head"><span className="eyebrow">BUILD MATERIALS</span>{displayApp && <AppStatus status={displayApp.status} />}</div>
              {displayApp ? <><h3>{displayApp.name}</h3><p>{displayApp.summary}</p><div className="artifact-grid"><div><Database size={15} /><span>Schema</span><b>v{displayApp.schemaVersion}</b></div><div><Layers3 size={15} /><span>Runtime</span><b>Node / React</b></div></div><div className="app-actions"><button className="secondary-action" onClick={reforgeActiveApp} disabled={isBuilding}><Sparkles size={14} /> Reforge</button><a href={`/api/apps/${displayApp.id}/preview`} target="_blank" rel="noreferrer" className="secondary-action"><Eye size={14} /> Preview</a></div><div className="app-actions"><a href={displayApp.exportArtifactUrl ?? undefined} className="secondary-action" aria-disabled={!displayApp.exportArtifactUrl}><Download size={14} /> ZIP export</a></div><div className="app-actions solo-action">{displayApp.sqliteArtifactUrl && <a href={displayApp.sqliteArtifactUrl} className="secondary-action"><Database size={14} /> SQLite artifact</a>}</div></> : <p className="empty-copy">Artifact controls appear after your first successful build.</p>}
            </div>
            <div className="schema-card glass-panel">
              <div className="inspector-head"><span className="eyebrow">DYNAMIC SCHEMA REGISTRY</span><Database size={15} /></div>
              {visibleSchema ? <div className="schema-list">{visibleSchema.entities.map(entity => <div key={entity.name}><strong>{entity.name}</strong>{entity.fields.map(field => <span key={field.name}><i className={field.required ? "required" : ""} />{field.name}<em>{field.type}</em></span>)}</div>)}<div className="history-strip"><span><History size={12} /> {schemaHistory.data?.length ?? 1} snapshots</span>{(schemaHistory.data ?? []).filter(version => version.version < (displayApp?.schemaVersion ?? 1)).slice(0, 2).map(version => <button key={version.version} onClick={() => rollbackToVersion(version.version)} disabled={rollbackSchema.isPending}><RotateCcw size={11} /> Restore v{version.version}{rollbackTarget === version.version ? "…" : ""}</button>)}</div>{schemaMigrations.data?.length ? <div className="migration-log">{schemaMigrations.data.slice(0, 3).map(migration => <span key={migration.id}><History size={10} /> v{migration.fromVersion} → v{migration.toVersion} · {migration.status} · {migration.migrationDocument.operations[0]}{migration.rolledBackAt ? ` · rolled back ${formatDate(migration.rolledBackAt)}` : ""}</span>)}</div> : null}</div> : <p className="empty-copy">The versioned entity registry is derived from your app brief and stored with the bundle.</p>}
            </div>
          </aside>
        </section>

        <section id="app-library" className="library-section glass-panel">
          <div className="section-heading"><div><p className="eyebrow">PERSISTENT APP LIBRARY</p><h2>Created applications</h2></div><button className="text-action" onClick={() => void appsQuery.refetch()}>Refresh <ChevronRight size={15} /></button></div>
          {appsQuery.isLoading ? <div className="library-empty"><Loader2 className="spin" size={18} /> Loading your secured library</div> : sortedApps.length ? <div className="app-list">{sortedApps.map(app => <button className={cn("library-app", displayApp?.id === app.id && "selected")} key={app.id} onClick={() => openApp(app)}><span className="app-sigil">{app.name.slice(0, 1)}</span><span className="app-main"><b>{app.name}</b><small>{app.summary ?? "No description generated"}</small></span><span className="app-time">{formatDate(app.createdAt)}</span><AppStatus status={app.status} /><ChevronRight size={17} /></button>)}</div> : <div className="library-empty"><Plus size={17} /> No generated apps yet. Forge your first isolated workspace above.</div>}
        </section>

        <section id="agent-bridge" className="agent-bridge glass-panel">
          <div className="bridge-icon"><Network size={22} /></div><div className="bridge-copy"><p className="eyebrow">MODEL CONTEXT PROTOCOL</p><h2>Programmatic build bridge</h2><p>Issue a scoped agent key to call the protected MCP endpoint at <code>/api/mcp</code>. Tools include build, list apps, and app metadata retrieval.</p></div>
          <div className="bridge-control">{mcpToken ? <div className="token-reveal"><span>{mcpToken}</span><button onClick={() => copy(mcpToken, "Agent key")}><Copy size={15} /></button><button onClick={() => setMcpToken(null)}><X size={15} /></button></div> : <button className="secondary-action" onClick={createMcpKey} disabled={createKey.isPending}><KeyRound size={15} /> {createKey.isPending ? "Issuing key" : "Issue agent key"}</button>}<div className="mcp-key-list">{(mcpKeys.data ?? []).map(key => <div className={cn("mcp-key-row", key.revokedAt && "revoked")} key={key.id}><span><KeyRound size={11} /> {key.tokenPrefix}…</span>{key.revokedAt ? <small>revoked</small> : <><button onClick={() => rotateAgentKey(key.id)} disabled={rotateKey.isPending}><RotateCcw size={11} /> rotate</button><button onClick={() => revokeAgentKey(key.id)} disabled={revokeKey.isPending}><ShieldOff size={11} /> revoke</button></>}</div>)}</div><small>{(mcpKeys.data ?? []).filter(key => !key.revokedAt).length} active key{(mcpKeys.data ?? []).filter(key => !key.revokedAt).length === 1 ? "" : "s"}</small></div>
        </section>
      </section>
    </main>
  );
}
