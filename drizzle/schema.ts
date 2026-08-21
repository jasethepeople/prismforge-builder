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
