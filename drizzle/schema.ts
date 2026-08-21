import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type SchemaField = {
  name: string;
  type: "text" | "integer" | "boolean" | "timestamp";
  required: boolean;
};

export type AppSchemaDocument = {
  version: number;
  generatedAt: string;
  entities: Array<{ name: string; fields: SchemaField[] }>;
};

export type SchemaMigrationDocument = {
  fromVersion: number;
  toVersion: number;
  operations: string[];
  snapshotVersion: number;
};

export const generatedApps = mysqlTable(
  "generatedApps",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    workspaceId: varchar("workspaceId", { length: 32 }).references(() => workspaces.id),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    prompt: text("prompt").notNull(),
    summary: text("summary"),
    status: mysqlEnum("status", ["queued", "building", "ready", "failed"]).default("queued").notNull(),
    model: varchar("model", { length: 80 }),
    schemaVersion: int("schemaVersion").default(1).notNull(),
    sourceBundleKey: text("sourceBundleKey"),
    sourceBundleUrl: text("sourceBundleUrl"),
    sqliteArtifactKey: text("sqliteArtifactKey"),
    sqliteArtifactUrl: text("sqliteArtifactUrl"),
    exportArtifactKey: text("exportArtifactKey"),
    exportArtifactUrl: text("exportArtifactUrl"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("generatedApps_user_created_idx").on(table.userId, table.createdAt), index("generatedApps_workspace_idx").on(table.workspaceId)]
);

export const appSchemaVersions = mysqlTable(
  "appSchemaVersions",
  {
    id: int("id").autoincrement().primaryKey(),
    appId: varchar("appId", { length: 32 }).notNull().references(() => generatedApps.id),
    version: int("version").notNull(),
    schemaDocument: json("schemaDocument").$type<AppSchemaDocument>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("appSchemaVersions_app_version_idx").on(table.appId, table.version)]
);

export const appSchemaMigrations = mysqlTable(
  "appSchemaMigrations",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    appId: varchar("appId", { length: 32 }).notNull().references(() => generatedApps.id),
    fromVersion: int("fromVersion").notNull(),
    toVersion: int("toVersion").notNull(),
    migrationDocument: json("migrationDocument").$type<SchemaMigrationDocument>().notNull(),
    status: mysqlEnum("status", ["applied", "rolled_back"]).default("applied").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    rolledBackAt: timestamp("rolledBackAt"),
  },
  table => [index("appSchemaMigrations_app_created_idx").on(table.appId, table.createdAt)]
);

export const appArtifacts = mysqlTable(
  "appArtifacts",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    appId: varchar("appId", { length: 32 }).notNull().references(() => generatedApps.id),
    artifactType: mysqlEnum("artifactType", ["source_bundle", "sqlite_database", "zip_export"]).notNull(),
    objectKey: text("objectKey").notNull(),
    objectUrl: text("objectUrl").notNull(),
    byteSize: int("byteSize").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("appArtifacts_app_type_idx").on(table.appId, table.artifactType)]
);

export const workspaces = mysqlTable(
  "workspaces",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("workspaces_owner_idx").on(table.ownerId)]
);

export const workspaceInvites = mysqlTable(
  "workspaceInvites",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    workspaceId: varchar("workspaceId", { length: 32 }).notNull().references(() => workspaces.id),
    invitedBy: int("invitedBy").notNull().references(() => users.id),
    email: varchar("email", { length: 320 }).notNull(),
    role: mysqlEnum("role", ["editor", "viewer"]).default("viewer").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("workspaceInvites_workspace_idx").on(table.workspaceId), index("workspaceInvites_email_idx").on(table.email)]
);

export const workspaceMembers = mysqlTable(
  "workspaceMembers",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: varchar("workspaceId", { length: 32 }).notNull().references(() => workspaces.id),
    userId: int("userId").notNull().references(() => users.id),
    role: mysqlEnum("role", ["owner", "editor", "viewer"]).default("viewer").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("workspaceMembers_workspace_user_idx").on(table.workspaceId, table.userId), index("workspaceMembers_user_idx").on(table.userId)]
);

export const appRuntimeLogs = mysqlTable(
  "appRuntimeLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    appId: varchar("appId", { length: 32 }).references(() => generatedApps.id),
    userId: int("userId").notNull().references(() => users.id),
    event: varchar("event", { length: 64 }).notNull(),
    level: mysqlEnum("level", ["info", "warn", "error"]).default("info").notNull(),
    message: text("message").notNull(),
    metadata: json("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("appRuntimeLogs_app_created_idx").on(table.appId, table.createdAt), index("appRuntimeLogs_user_idx").on(table.userId)]
);

export const mcpApiKeys = mysqlTable(
  "mcpApiKeys",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    label: varchar("label", { length: 80 }).notNull(),
    tokenPrefix: varchar("tokenPrefix", { length: 18 }).notNull(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [index("mcpApiKeys_hash_idx").on(table.tokenHash), index("mcpApiKeys_user_idx").on(table.userId)]
);

export type GeneratedApp = typeof generatedApps.$inferSelect;
export type AppSchemaVersion = typeof appSchemaVersions.$inferSelect;
export type AppSchemaMigration = typeof appSchemaMigrations.$inferSelect;
export type AppArtifact = typeof appArtifacts.$inferSelect;
export type McpApiKey = typeof mcpApiKeys.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type AppRuntimeLog = typeof appRuntimeLogs.$inferSelect;
