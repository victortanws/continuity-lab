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

/** Fixed-window counters are billing/safety controls, not product analytics.
 * Scope keys are already pseudonymous project/user/IP digests. */
export const usageWindows = sqliteTable("usage_windows", {
  scopeKey: text("scope_key").notNull(),
  operation: text("operation").notNull(),
  windowStart: integer("window_start").notNull(),
  windowSeconds: integer("window_seconds").notNull(),
  count: integer("count").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("usage_windows_scope_operation_window_unique").on(
    table.scopeKey,
    table.operation,
    table.windowStart,
    table.windowSeconds,
  ),
  index("usage_windows_updated_idx").on(table.updatedAt),
]);

export const projectRevisions = sqliteTable("project_revisions", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionId: text("revision_id").notNull(),
  parentRevisionId: text("parent_revision_id"),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("project_revisions_project_revision_unique").on(table.projectId, table.revisionId),
  index("project_revisions_project_created_idx").on(table.projectId, table.createdAt),
]);

export const revisionSourceVersions = sqliteTable("revision_source_versions", {
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionId: text("revision_id").notNull(),
  sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  sourceVersionId: text("source_version_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("revision_sources_membership_unique").on(table.projectId, table.revisionId, table.sourceVersionId),
  index("revision_sources_revision_idx").on(table.projectId, table.revisionId),
]);

/**
 * Repository records are provider-neutral snapshots. A mutable branch name is
 * resolved once, while the immutable commit and selected blob identities are
 * retained for replay. Repository content is never executed by the Site.
 */
export const repositoryConnections = sqliteTable("repository_connections", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  owner: text("owner").notNull(),
  repository: text("repository").notNull(),
  canonicalUrl: text("canonical_url").notNull(),
  requestedRef: text("requested_ref"),
  activeSnapshotId: text("active_snapshot_id"),
  syncStatus: text("sync_status", {
    enum: ["idle", "syncing", "ready", "failed"],
  }).notNull().default("idle"),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("repository_connections_project_repo_unique").on(
    table.projectId,
    table.provider,
    table.owner,
    table.repository,
  ),
  index("repository_connections_project_idx").on(table.projectId, table.updatedAt),
]);

export const repositorySnapshots = sqliteTable("repository_snapshots", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  connectionId: text("connection_id").notNull().references(() => repositoryConnections.id, { onDelete: "cascade" }),
  commitSha: text("commit_sha").notNull(),
  treeSha: text("tree_sha").notNull(),
  requestedRef: text("requested_ref").notNull(),
  status: text("status", {
    enum: ["candidate", "ready", "failed"],
  }).notNull().default("candidate"),
  coverageComplete: integer("coverage_complete", { mode: "boolean" }).notNull().default(false),
  treeTruncated: integer("tree_truncated", { mode: "boolean" }).notNull().default(false),
  selectedFileCount: integer("selected_file_count").notNull().default(0),
  skippedFileCount: integer("skipped_file_count").notNull().default(0),
  totalBytes: integer("total_bytes").notNull().default(0),
  policyVersion: text("policy_version").notNull(),
  manifestR2Key: text("manifest_r2_key"),
  packetR2Key: text("packet_r2_key"),
  packetSourceId: text("packet_source_id"),
  indexStatus: text("index_status", {
    enum: ["stored", "indexing", "indexed", "failed"],
  }).notNull().default("stored"),
  indexError: text("index_error"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  completedAt: text("completed_at"),
}, (table) => [
  uniqueIndex("repository_snapshots_commit_policy_unique").on(
    table.connectionId,
    table.commitSha,
    table.policyVersion,
  ),
  index("repository_snapshots_project_created_idx").on(table.projectId, table.createdAt),
]);

export const repositoryEntries = sqliteTable("repository_entries", {
  id: text("id").primaryKey(),
  snapshotId: text("snapshot_id").notNull().references(() => repositorySnapshots.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  blobSha: text("blob_sha").notNull(),
  contentSha256: text("content_sha256").notNull(),
  byteSize: integer("byte_size").notNull(),
  contentType: text("content_type").notNull(),
  r2Key: text("r2_key").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("repository_entries_snapshot_path_unique").on(table.snapshotId, table.path),
  uniqueIndex("repository_entries_r2_key_unique").on(table.r2Key),
  index("repository_entries_snapshot_idx").on(table.snapshotId, table.path),
]);
