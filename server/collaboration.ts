import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { appRuntimeLogs, generatedApps, workspaceInvites, workspaceMembers, workspaces } from "../drizzle/schema";
import { getDb } from "./db";

export type WorkspaceRole = "owner" | "editor" | "viewer";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db;
}

export async function listUserWorkspaces(userId: number) {
  const db = await requireDb();
  return db.select({ workspace: workspaces, role: workspaceMembers.role }).from(workspaceMembers).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id)).where(eq(workspaceMembers.userId, userId)).orderBy(desc(workspaces.updatedAt));
}

export async function listWorkspaceMembers(userId: number, workspaceId: string) {
  await assertWorkspaceRole(userId, workspaceId);
  const db = await requireDb();
  return db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)).orderBy(desc(workspaceMembers.createdAt));
}

export async function listWorkspaceInvites(userId: number, workspaceId: string) {
  await assertWorkspaceRole(userId, workspaceId);
  const db = await requireDb();
  return db.select().from(workspaceInvites).where(eq(workspaceInvites.workspaceId, workspaceId)).orderBy(desc(workspaceInvites.createdAt));
}

export async function createWorkspaceInvite(userId: number, workspaceId: string, email: string, role: "editor" | "viewer") {
  await assertWorkspaceRole(userId, workspaceId, ["owner"]);
  const db = await requireDb();
  const id = nanoid(16);
  await db.insert(workspaceInvites).values({ id, workspaceId, invitedBy: userId, email: email.toLowerCase(), role });
  return { id, workspaceId, email: email.toLowerCase(), role };
}

export async function setWorkspaceMemberRole(userId: number, workspaceId: string, memberId: number, role: "editor" | "viewer") {
  await assertWorkspaceRole(userId, workspaceId, ["owner"]);
  const db = await requireDb();
  await db.update(workspaceMembers).set({ role }).where(and(eq(workspaceMembers.id, memberId), eq(workspaceMembers.workspaceId, workspaceId)));
  return { memberId, role };
}

export async function createWorkspace(userId: number, name: string) {
  const db = await requireDb();
  const id = nanoid(16);
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"}-${id.slice(0, 6).toLowerCase()}`;
  await db.insert(workspaces).values({ id, ownerId: userId, name, slug });
  await db.insert(workspaceMembers).values({ workspaceId: id, userId, role: "owner" });
  return { id, name, slug, role: "owner" as const };
}

export async function getWorkspaceRole(userId: number, workspaceId: string): Promise<WorkspaceRole | null> {
  const db = await requireDb();
  const [member] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId))).limit(1);
  return member?.role ?? null;
}

export async function assertWorkspaceRole(userId: number, workspaceId: string, allowed: WorkspaceRole[] = ["owner", "editor", "viewer"]) {
  const role = await getWorkspaceRole(userId, workspaceId);
  if (!role || !allowed.includes(role)) throw new Error("You do not have permission to access this workspace.");
  return role;
}

export async function recordRuntimeLog(userId: number, appId: string | null, event: string, message: string, level: "info" | "warn" | "error" = "info", metadata: Record<string, unknown> | null = null) {
  const db = await requireDb();
  await db.insert(appRuntimeLogs).values({ appId, userId, event, message, level, metadata });
}

export async function listRuntimeLogs(userId: number, appId: string) {
  const db = await requireDb();
  const [app] = await db.select({ userId: generatedApps.userId, workspaceId: generatedApps.workspaceId }).from(generatedApps).where(eq(generatedApps.id, appId)).limit(1);
  if (!app) return [];
  if (app.userId !== userId && (!app.workspaceId || !(await getWorkspaceRole(userId, app.workspaceId)))) throw new Error("The requested app is outside your workspace.");
  return db.select().from(appRuntimeLogs).where(eq(appRuntimeLogs.appId, appId)).orderBy(desc(appRuntimeLogs.createdAt)).limit(100);
}

export async function assignAppToWorkspace(userId: number, appId: string, workspaceId: string) {
  await assertWorkspaceRole(userId, workspaceId, ["owner", "editor"]);
  const db = await requireDb();
  await db.update(generatedApps).set({ workspaceId, updatedAt: new Date() }).where(and(eq(generatedApps.id, appId), eq(generatedApps.userId, userId)));
  return { appId, workspaceId };
}
