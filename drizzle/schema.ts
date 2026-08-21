import { index, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
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

export const generatedApps = mysqlTable(
  "generatedApps",
  {
    id: varchar("id", { length: 32 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
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
  table => [index("generatedApps_user_created_idx").on(table.userId, table.createdAt)]
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
  },
  table => [index("mcpApiKeys_hash_idx").on(table.tokenHash), index("mcpApiKeys_user_idx").on(table.userId)]
);

export type GeneratedApp = typeof generatedApps.$inferSelect;
export type AppArtifact = typeof appArtifacts.$inferSelect;
