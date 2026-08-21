import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import {
  createGeneratedApp,
  createMcpApiKey,
  getAccessibleGeneratedApp,
  listSchemaHistory,
  listSchemaMigrations,
  revokeMcpApiKey,
  rollbackGeneratedAppSchema,
  rotateMcpApiKey,
  listGeneratedApps,
  listMcpApiKeys,
  toPublicApp,
} from "./appBuilder";
import { getSessionCookieOptions } from "./_core/cookies";
import { assignAppToWorkspace, createWorkspace, createWorkspaceInvite, listRuntimeLogs, listUserWorkspaces, listWorkspaceInvites, listWorkspaceMembers, recordRuntimeLog, setWorkspaceMemberRole } from "./collaboration";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  apps: router({
    list: protectedProcedure.query(async ({ ctx }) => (await listGeneratedApps(ctx.user.id)).map(toPublicApp)),
    get: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32) })).query(async ({ ctx, input }) => {
      const app = await getAccessibleGeneratedApp(ctx.user.id, input.appId, ["owner", "editor", "viewer"]);
      return app ? toPublicApp(app) : null;
    }),
    create: protectedProcedure.input(z.object({ prompt: z.string().min(12).max(4000) })).mutation(async ({ ctx, input }) => {
      const app = await createGeneratedApp(ctx.user.id, input.prompt);
      return toPublicApp(app);
    }),
    schemaHistory: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32) })).query(({ ctx, input }) => listSchemaHistory(ctx.user.id, input.appId)),
    schemaMigrations: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32) })).query(({ ctx, input }) => listSchemaMigrations(ctx.user.id, input.appId)),
    rollbackSchema: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32), targetVersion: z.number().int().min(1) })).mutation(async ({ ctx, input }) => {
      const result = await rollbackGeneratedAppSchema(ctx.user.id, input.appId, input.targetVersion);
      return { app: toPublicApp(result.app), schema: result.schema, artifactUrl: result.artifactUrl };
    }),
    runtimeLogs: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32) })).query(({ ctx, input }) => listRuntimeLogs(ctx.user.id, input.appId)),
    log: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32), event: z.enum(["export.downloaded", "sqlite.downloaded", "preview.opened"]), message: z.string().min(1).max(240) })).mutation(async ({ ctx, input }) => { await recordRuntimeLog(ctx.user.id, input.appId, input.event, input.message); return { success: true } as const; }),
    assignWorkspace: protectedProcedure.input(z.object({ appId: z.string().min(8).max(32), workspaceId: z.string().min(8).max(32) })).mutation(({ ctx, input }) => assignAppToWorkspace(ctx.user.id, input.appId, input.workspaceId)),
  }),
  workspaces: router({
    list: protectedProcedure.query(({ ctx }) => listUserWorkspaces(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(120) })).mutation(({ ctx, input }) => createWorkspace(ctx.user.id, input.name)),
    members: protectedProcedure.input(z.object({ workspaceId: z.string().min(8).max(32) })).query(({ ctx, input }) => listWorkspaceMembers(ctx.user.id, input.workspaceId)),
    invites: protectedProcedure.input(z.object({ workspaceId: z.string().min(8).max(32) })).query(({ ctx, input }) => listWorkspaceInvites(ctx.user.id, input.workspaceId)),
    invite: protectedProcedure.input(z.object({ workspaceId: z.string().min(8).max(32), email: z.string().email(), role: z.enum(["editor", "viewer"]) })).mutation(({ ctx, input }) => createWorkspaceInvite(ctx.user.id, input.workspaceId, input.email, input.role)),
    setMemberRole: protectedProcedure.input(z.object({ workspaceId: z.string().min(8).max(32), memberId: z.number().int().positive(), role: z.enum(["editor", "viewer"]) })).mutation(({ ctx, input }) => setWorkspaceMemberRole(ctx.user.id, input.workspaceId, input.memberId, input.role)),
  }),
  mcp: router({
    listKeys: protectedProcedure.query(({ ctx }) => listMcpApiKeys(ctx.user.id)),
    createKey: protectedProcedure.input(z.object({ label: z.string().min(2).max(80) })).mutation(({ ctx, input }) => createMcpApiKey(ctx.user.id, input.label)),
    revokeKey: protectedProcedure.input(z.object({ keyId: z.string().min(8).max(32) })).mutation(({ ctx, input }) => revokeMcpApiKey(ctx.user.id, input.keyId)),
    rotateKey: protectedProcedure.input(z.object({ keyId: z.string().min(8).max(32), label: z.string().min(2).max(80).optional() })).mutation(({ ctx, input }) => rotateMcpApiKey(ctx.user.id, input.keyId, input.label)),
  }),
});

export type AppRouter = typeof appRouter;
