import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import {
  createGeneratedApp,
  createMcpApiKey,
  getGeneratedApp,
  listGeneratedApps,
  listMcpApiKeys,
  toPublicApp,
} from "./appBuilder";
import { getSessionCookieOptions } from "./_core/cookies";
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
      const app = await getGeneratedApp(ctx.user.id, input.appId);
      return app ? toPublicApp(app) : null;
    }),
    create: protectedProcedure.input(z.object({ prompt: z.string().min(12).max(4000) })).mutation(async ({ ctx, input }) => {
      const app = await createGeneratedApp(ctx.user.id, input.prompt);
      return toPublicApp(app);
    }),
  }),
  mcp: router({
    listKeys: protectedProcedure.query(({ ctx }) => listMcpApiKeys(ctx.user.id)),
    createKey: protectedProcedure.input(z.object({ label: z.string().min(2).max(80) })).mutation(({ ctx, input }) => createMcpApiKey(ctx.user.id, input.label)),
  }),
});

export type AppRouter = typeof appRouter;
