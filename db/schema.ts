import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * These tables contain Continuity Lab's provider-neutral record. OpenAI file,
 * vector-store, and response IDs live only in provider_bindings so that a
 * project can be re-indexed or moved to another retrieval provider without
 * changing its durable source IDs or citations.
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  activeRevision: text("active_revision").notNull().default("rev-1"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  versionId: text("version_id").notNull(),
  logicalName: text("logical_name").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: text("sha256").notNull(),
  r2Key: text("r2_key").notNull(),
  authority: text("authority", {
    enum: ["immutable", "canon", "retcon", "production", "proposal", "reference"],
  }).notNull().default("reference"),
  validFrom: text("valid_from"),
  supersedesSourceId: text("supersedes_source_id"),
  indexStatus: text("index_status", {
    enum: ["stored", "indexing", "indexed", "failed"],
  }).notNull().default("stored"),
  indexError: text("index_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("sources_version_id_unique").on(table.versionId),
  uniqueIndex("sources_project_sha256_unique").on(table.projectId, table.sha256),
  uniqueIndex("sources_r2_key_unique").on(table.r2Key),
  index("sources_project_created_idx").on(table.projectId, table.createdAt),
]);

export const providerBindings = sqliteTable("provider_bindings", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  internalId: text("internal_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  externalId: text("external_id").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  invalidatedAt: text("invalidated_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("provider_bindings_internal_unique").on(
    table.projectId,
    table.internalId,
    table.provider,
    table.kind,
  ),
  uniqueIndex("provider_bindings_external_unique").on(table.provider, table.kind, table.externalId),
  index("provider_bindings_project_idx").on(table.projectId, table.provider, table.kind),
]);

export const analyses = sqliteTable("analyses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  projectRevision: text("project_revision").notNull(),
  question: text("question").notNull(),
  answerJson: text("answer_json").notNull(),
  mode: text("mode").notNull(),
  model: text("model"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("analyses_project_created_idx").on(table.projectId, table.createdAt),
]);
