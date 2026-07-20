import type { CanonAuthority, QueryResult } from "../contracts";

export type SourceIndexStatus = "stored" | "indexing" | "indexed" | "failed";

export type StoredProject = {
  id: string;
  title: string;
  activeRevision: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredSource = {
  id: string;
  projectId: string;
  versionId: string;
  logicalName: string;
  filename: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  r2Key: string;
  authority: CanonAuthority;
  validFrom: string | null;
  supersedesSourceId: string | null;
  indexStatus: SourceIndexStatus;
  indexError: string | null;
  createdAt: string;
};

export type ProviderBinding = {
  id: string;
  projectId: string;
  internalId: string;
  provider: string;
  kind: string;
  externalId: string;
  metadataJson: string;
  invalidatedAt: string | null;
  createdAt: string;
};

export type RepositorySyncStatus = "idle" | "syncing" | "ready" | "failed";
export type RepositorySnapshotStatus = "candidate" | "ready" | "failed";

export type StoredRepositoryConnection = {
  id: string;
  projectId: string;
  provider: string;
  owner: string;
  repository: string;
  canonicalUrl: string;
  requestedRef: string | null;
  activeSnapshotId: string | null;
  syncStatus: RepositorySyncStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StoredRepositorySnapshot = {
  id: string;
  projectId: string;
  connectionId: string;
  commitSha: string;
  treeSha: string;
  requestedRef: string;
  status: RepositorySnapshotStatus;
  coverageComplete: number;
  treeTruncated: number;
  selectedFileCount: number;
  skippedFileCount: number;
  totalBytes: number;
  policyVersion: string;
  manifestR2Key: string | null;
  packetR2Key: string | null;
  packetSourceId: string | null;
  indexStatus: SourceIndexStatus;
  indexError: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type StoredRepositoryEntry = {
  id: string;
  snapshotId: string;
  path: string;
  blobSha: string;
  contentSha256: string;
  byteSize: number;
  contentType: string;
  r2Key: string;
  createdAt: string;
};

export type CreateRepositoryEntryInput = Omit<StoredRepositoryEntry, "id" | "createdAt">;

export type UsageDecision = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
};

export type UsageReservationRule = {
  id: string;
  scopeKey: string;
  operation: string;
  limit: number;
  windowSeconds: number;
  amount?: number;
};

export type UsageReservationDecision = {
  allowed: boolean;
  blockedRuleId: string | null;
  retryAfterSeconds: number;
  decisions: Array<UsageDecision & { ruleId: string }>;
};

type CreateSourceInput = Omit<StoredSource, "indexStatus" | "indexError" | "createdAt"> & {
  indexStatus?: SourceIndexStatus;
};

function first<T>(result: D1Result<T>): T | null {
  return result.results?.[0] ?? null;
}

/**
 * D1 access is deliberately kept behind a small repository. App routes and a
 * future MCP adapter can share these operations without importing Drizzle or
 * depending on the hosting provider's generated model types.
 */
export class ContinuityRepository {
  constructor(private readonly db: D1Database) {}

  async ensureProject(id: string, title = "Untitled continuity project"): Promise<StoredProject> {
    await this.db.prepare(
      `INSERT INTO projects (id, title, active_revision)
       VALUES (?1, ?2, 'rev-1')
       ON CONFLICT(id) DO NOTHING`,
    ).bind(id, title).run();

    const project = await this.getProject(id);
    if (!project) throw new Error("The project could not be created.");
    await this.db.prepare(
      `INSERT OR IGNORE INTO project_revisions (
         project_id, revision_id, parent_revision_id, reason
       ) VALUES (?1, ?2, NULL, 'project-created')`,
    ).bind(project.id, project.activeRevision).run();
    return project;
  }

  async consumeUsage(
    scopeKey: string,
    operation: string,
    limit: number,
    windowSeconds: number,
    nowMs = Date.now(),
    amount = 1,
  ): Promise<UsageDecision> {
    if (!scopeKey.trim() || !operation.trim()) throw new TypeError("Usage scope and operation are required.");
    if (!Number.isSafeInteger(limit) || limit < 1
      || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1
      || !Number.isSafeInteger(amount) || amount < 1 || amount > limit) {
      throw new TypeError("Usage limit, window, and amount must be positive bounded integers.");
    }
    const nowSeconds = Math.floor(nowMs / 1000);
    const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
    const result = await this.db.prepare(
      `INSERT INTO usage_windows (
         scope_key, operation, window_start, window_seconds, count, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?6, CURRENT_TIMESTAMP)
       ON CONFLICT(scope_key, operation, window_start, window_seconds) DO UPDATE SET
         count = usage_windows.count + ?6,
         updated_at = CURRENT_TIMESTAMP
       WHERE usage_windows.count + ?6 <= ?5`,
    ).bind(scopeKey, operation, windowStart, windowSeconds, limit, amount).run();
    const row = first(await this.db.prepare(
      `SELECT count FROM usage_windows
       WHERE scope_key = ?1 AND operation = ?2 AND window_start = ?3 AND window_seconds = ?4
       LIMIT 1`,
    ).bind(scopeKey, operation, windowStart, windowSeconds).all<{ count: number }>());
    const count = row?.count ?? limit;
    return {
      allowed: Number(result.meta?.changes ?? 0) > 0,
      count,
      limit,
      retryAfterSeconds: Math.max(1, windowStart + windowSeconds - nowSeconds),
    };
  }

  /**
   * Reserve a bounded operation against several durable usage dimensions.
   * Every rule is an atomic conditional D1 upsert. Rules are evaluated from
   * narrowest to broadest and stop at the first denial. Earlier successful
   * reservations are deliberately not refunded: a provider failure or a later
   * global denial may consume capacity, but races can never oversubscribe it.
   */
  async reserveUsageBudget(
    rules: readonly UsageReservationRule[],
    nowMs = Date.now(),
  ): Promise<UsageReservationDecision> {
    if (!rules.length || rules.length > 8) {
      throw new TypeError("A usage reservation requires between one and eight rules.");
    }
    const seen = new Set<string>();
    const decisions: UsageReservationDecision["decisions"] = [];
    for (const rule of rules) {
      if (!rule.id.trim()) throw new TypeError("Every usage reservation rule requires an ID.");
      const key = `${rule.scopeKey}\u0000${rule.operation}\u0000${rule.windowSeconds}`;
      if (seen.has(key)) throw new TypeError("A usage reservation cannot charge the same window twice.");
      seen.add(key);
      const decision = await this.consumeUsage(
        rule.scopeKey,
        rule.operation,
        rule.limit,
        rule.windowSeconds,
        nowMs,
        rule.amount ?? 1,
      );
      decisions.push({ ruleId: rule.id, ...decision });
      if (!decision.allowed) {
        return {
          allowed: false,
          blockedRuleId: rule.id,
          retryAfterSeconds: decision.retryAfterSeconds,
          decisions,
        };
      }
    }
    return {
      allowed: true,
      blockedRuleId: null,
      retryAfterSeconds: 0,
      decisions,
    };
  }

  async getProject(id: string): Promise<StoredProject | null> {
    const result = await this.db.prepare(
      `SELECT id, title, active_revision AS activeRevision,
              created_at AS createdAt, updated_at AS updatedAt
       FROM projects WHERE id = ?1 LIMIT 1`,
    ).bind(id).all<StoredProject>();
    return first(result);
  }

  async listSources(projectId: string, limit = 100): Promise<StoredSource[]> {
    const safeLimit = Math.max(1, Math.min(limit, 250));
    const result = await this.db.prepare(
      `SELECT id, project_id AS projectId, version_id AS versionId,
              logical_name AS logicalName, filename, content_type AS contentType,
              byte_size AS byteSize, sha256, r2_key AS r2Key, authority,
              valid_from AS validFrom, supersedes_source_id AS supersedesSourceId,
              index_status AS indexStatus, index_error AS indexError,
              created_at AS createdAt
       FROM sources WHERE project_id = ?1
       ORDER BY created_at DESC, id DESC LIMIT ?2`,
    ).bind(projectId, safeLimit).all<StoredSource>();
    return result.results ?? [];
  }

  async getProjectSourceUsage(projectId: string): Promise<{ sourceCount: number; totalBytes: number }> {
    const row = first(await this.db.prepare(
      `SELECT COUNT(*) AS sourceCount, COALESCE(SUM(byte_size), 0) AS totalBytes
       FROM sources WHERE project_id = ?1`,
    ).bind(projectId).all<{ sourceCount: number; totalBytes: number }>());
    return { sourceCount: Number(row?.sourceCount ?? 0), totalBytes: Number(row?.totalBytes ?? 0) };
  }

  async getSource(projectId: string, sourceId: string): Promise<StoredSource | null> {
    const result = await this.db.prepare(
      `SELECT id, project_id AS projectId, version_id AS versionId,
              logical_name AS logicalName, filename, content_type AS contentType,
              byte_size AS byteSize, sha256, r2_key AS r2Key, authority,
              valid_from AS validFrom, supersedes_source_id AS supersedesSourceId,
              index_status AS indexStatus, index_error AS indexError,
              created_at AS createdAt
       FROM sources WHERE project_id = ?1 AND id = ?2 LIMIT 1`,
    ).bind(projectId, sourceId).all<StoredSource>();
    return first(result);
  }

  async findSourceByChecksum(projectId: string, sha256: string): Promise<StoredSource | null> {
    const result = await this.db.prepare(
      `SELECT id, project_id AS projectId, version_id AS versionId,
              logical_name AS logicalName, filename, content_type AS contentType,
              byte_size AS byteSize, sha256, r2_key AS r2Key, authority,
              valid_from AS validFrom, supersedes_source_id AS supersedesSourceId,
              index_status AS indexStatus, index_error AS indexError,
              created_at AS createdAt
       FROM sources WHERE project_id = ?1 AND sha256 = ?2 LIMIT 1`,
    ).bind(projectId, sha256).all<StoredSource>();
    return first(result);
  }

  async createSource(input: CreateSourceInput): Promise<StoredSource> {
    await this.db.prepare(
      `INSERT INTO sources (
         id, project_id, version_id, logical_name, filename, content_type,
         byte_size, sha256, r2_key, authority, valid_from,
         supersedes_source_id, index_status
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    ).bind(
      input.id,
      input.projectId,
      input.versionId,
      input.logicalName,
      input.filename,
      input.contentType,
      input.byteSize,
      input.sha256,
      input.r2Key,
      input.authority,
      input.validFrom,
      input.supersedesSourceId,
      input.indexStatus ?? "stored",
    ).run();

    const source = await this.findSourceByChecksum(input.projectId, input.sha256);
    if (!source) throw new Error("The source metadata could not be stored.");
    return source;
  }

  async updateSourceIndexStatus(
    sourceId: string,
    status: SourceIndexStatus,
    error: string | null = null,
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE sources SET index_status = ?2, index_error = ?3 WHERE id = ?1`,
    ).bind(sourceId, status, error).run();
  }

  async listRevisionSourceVersionIds(projectId: string, revisionId: string): Promise<string[]> {
    const result = await this.db.prepare(
      `SELECT source_version_id AS sourceVersionId
       FROM revision_source_versions
       WHERE project_id = ?1 AND revision_id = ?2
       ORDER BY source_version_id`,
    ).bind(projectId, revisionId).all<{ sourceVersionId: string }>();
    return (result.results ?? []).map((row) => row.sourceVersionId);
  }

  async hasProjectRevision(projectId: string, revisionId: string): Promise<boolean> {
    const result = await this.db.prepare(
      `SELECT 1 AS present FROM project_revisions
       WHERE project_id = ?1 AND revision_id = ?2 LIMIT 1`,
    ).bind(projectId, revisionId).all<{ present: number }>();
    return Boolean(first(result)?.present);
  }

  async bumpProjectRevision(
    projectId: string,
    addedSourceVersionId: string,
    reason = "source-upload",
  ): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const project = await this.getProject(projectId);
      if (!project) throw new Error("Project not found while creating a revision.");
      const revision = `revision_${crypto.randomUUID()}`;
      const results = await this.db.batch([
        this.db.prepare(
          `INSERT INTO project_revisions (
             project_id, revision_id, parent_revision_id, reason
           ) VALUES (?1, ?2, ?3, ?4)`,
        ).bind(projectId, revision, project.activeRevision, reason.slice(0, 120)),
        this.db.prepare(
          `INSERT OR IGNORE INTO revision_source_versions (
             project_id, revision_id, source_id, source_version_id
           )
           SELECT project_id, ?2, source_id, source_version_id
           FROM revision_source_versions
           WHERE project_id = ?1 AND revision_id = ?3`,
        ).bind(projectId, revision, project.activeRevision),
        this.db.prepare(
          `INSERT OR IGNORE INTO revision_source_versions (
             project_id, revision_id, source_id, source_version_id
           )
           SELECT project_id, ?2, id, version_id FROM sources
           WHERE project_id = ?1 AND version_id = ?3`,
        ).bind(projectId, revision, addedSourceVersionId),
        this.db.prepare(
          `UPDATE projects SET active_revision = ?2, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?1 AND active_revision = ?3`,
        ).bind(projectId, revision, project.activeRevision),
      ]);
      if (Number(results.at(-1)?.meta?.changes ?? 0) > 0) return revision;
    }
    throw new Error("The project revision changed concurrently; retry the upload.");
  }

  async ensureRepositoryConnection(input: {
    projectId: string;
    provider: string;
    owner: string;
    repository: string;
    canonicalUrl: string;
    requestedRef: string;
  }): Promise<StoredRepositoryConnection> {
    const existing = await this.getRepositoryConnection(
      input.projectId,
      input.provider,
      input.owner,
      input.repository,
    );
    const id = existing?.id ?? `repository_${crypto.randomUUID()}`;
    await this.db.prepare(
      `INSERT INTO repository_connections (
         id, project_id, provider, owner, repository, canonical_url,
         requested_ref, sync_status, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'syncing', CURRENT_TIMESTAMP)
       ON CONFLICT(project_id, provider, owner, repository) DO UPDATE SET
         canonical_url = excluded.canonical_url,
         requested_ref = excluded.requested_ref,
         sync_status = 'syncing',
         last_error = NULL,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      id,
      input.projectId,
      input.provider,
      input.owner,
      input.repository,
      input.canonicalUrl,
      input.requestedRef,
    ).run();
    const connection = await this.getRepositoryConnection(
      input.projectId,
      input.provider,
      input.owner,
      input.repository,
    );
    if (!connection) throw new Error("The repository connection could not be stored.");
    return connection;
  }

  async getRepositoryConnection(
    projectId: string,
    provider: string,
    owner: string,
    repository: string,
  ): Promise<StoredRepositoryConnection | null> {
    const result = await this.db.prepare(
      `SELECT id, project_id AS projectId, provider, owner, repository,
              canonical_url AS canonicalUrl, requested_ref AS requestedRef,
              active_snapshot_id AS activeSnapshotId, sync_status AS syncStatus,
              last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt
       FROM repository_connections
       WHERE project_id = ?1 AND provider = ?2 AND owner = ?3 AND repository = ?4
       LIMIT 1`,
    ).bind(projectId, provider, owner, repository).all<StoredRepositoryConnection>();
    return first(result);
  }

  async listRepositoryConnections(projectId: string, limit = 20): Promise<StoredRepositoryConnection[]> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const result = await this.db.prepare(
      `SELECT id, project_id AS projectId, provider, owner, repository,
              canonical_url AS canonicalUrl, requested_ref AS requestedRef,
              active_snapshot_id AS activeSnapshotId, sync_status AS syncStatus,
              last_error AS lastError, created_at AS createdAt, updated_at AS updatedAt
       FROM repository_connections WHERE project_id = ?1
       ORDER BY updated_at DESC, id DESC LIMIT ?2`,
    ).bind(projectId, safeLimit).all<StoredRepositoryConnection>();
    return result.results ?? [];
  }

  async findRepositorySnapshot(
    connectionId: string,
    commitSha: string,
    policyVersion: string,
  ): Promise<StoredRepositorySnapshot | null> {
    const result = await this.db.prepare(
      `${repositorySnapshotSelect()}
       WHERE connection_id = ?1 AND commit_sha = ?2 AND policy_version = ?3 LIMIT 1`,
    ).bind(connectionId, commitSha, policyVersion).all<StoredRepositorySnapshot>();
    return first(result);
  }

  async getRepositorySnapshot(snapshotId: string): Promise<StoredRepositorySnapshot | null> {
    const result = await this.db.prepare(
      `${repositorySnapshotSelect()} WHERE id = ?1 LIMIT 1`,
    ).bind(snapshotId).all<StoredRepositorySnapshot>();
    return first(result);
  }

  async getActiveRepositorySnapshot(projectId: string): Promise<StoredRepositorySnapshot | null> {
    const result = await this.db.prepare(
      `${repositorySnapshotSelect("s")}
       JOIN repository_connections c ON c.active_snapshot_id = s.id
       WHERE c.project_id = ?1 AND s.status = 'ready'
       ORDER BY c.updated_at DESC LIMIT 1`,
    ).bind(projectId).all<StoredRepositorySnapshot>();
    return first(result);
  }

  async prepareRepositorySnapshot(input: {
    id?: string;
    projectId: string;
    connectionId: string;
    commitSha: string;
    treeSha: string;
    requestedRef: string;
    policyVersion: string;
  }): Promise<StoredRepositorySnapshot> {
    const id = input.id ?? `snapshot_${crypto.randomUUID()}`;
    await this.db.prepare(
      `INSERT INTO repository_snapshots (
         id, project_id, connection_id, commit_sha, tree_sha, requested_ref,
         status, policy_version, index_status
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'candidate', ?7, 'stored')
       ON CONFLICT(connection_id, commit_sha, policy_version) DO UPDATE SET
         tree_sha = excluded.tree_sha,
         requested_ref = excluded.requested_ref,
         status = 'candidate',
         failure_code = NULL,
         failure_message = NULL,
         completed_at = NULL`,
    ).bind(
      id,
      input.projectId,
      input.connectionId,
      input.commitSha,
      input.treeSha,
      input.requestedRef,
      input.policyVersion,
    ).run();
    const snapshot = await this.findRepositorySnapshot(
      input.connectionId,
      input.commitSha,
      input.policyVersion,
    );
    if (!snapshot) throw new Error("The repository snapshot could not be prepared.");
    await this.db.prepare(`DELETE FROM repository_entries WHERE snapshot_id = ?1`).bind(snapshot.id).run();
    return snapshot;
  }

  async saveRepositoryEntries(entries: CreateRepositoryEntryInput[]): Promise<void> {
    for (let start = 0; start < entries.length; start += 50) {
      const statements = entries.slice(start, start + 50).map((entry) => this.db.prepare(
        `INSERT INTO repository_entries (
           id, snapshot_id, path, blob_sha, content_sha256, byte_size, content_type, r2_key
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        `repository-entry_${crypto.randomUUID()}`,
        entry.snapshotId,
        entry.path,
        entry.blobSha,
        entry.contentSha256,
        entry.byteSize,
        entry.contentType,
        entry.r2Key,
      ));
      if (statements.length) await this.db.batch(statements);
    }
  }

  async promoteRepositorySnapshot(input: {
    snapshotId: string;
    connectionId: string;
    projectId: string;
    coverageComplete: boolean;
    treeTruncated: boolean;
    selectedFileCount: number;
    skippedFileCount: number;
    totalBytes: number;
    manifestR2Key: string;
    packetR2Key: string;
    packetSourceId: string;
    indexStatus: SourceIndexStatus;
    indexError?: string | null;
  }): Promise<string> {
    const revision = `repository:${input.snapshotId}`;
    await this.db.batch([
      this.db.prepare(
        `UPDATE repository_snapshots SET
           status = 'ready', coverage_complete = ?2, tree_truncated = ?3,
           selected_file_count = ?4, skipped_file_count = ?5, total_bytes = ?6,
           manifest_r2_key = ?7, packet_r2_key = ?8, packet_source_id = ?9,
           index_status = ?10, index_error = ?11, completed_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND status = 'candidate'`,
      ).bind(
        input.snapshotId,
        input.coverageComplete ? 1 : 0,
        input.treeTruncated ? 1 : 0,
        input.selectedFileCount,
        input.skippedFileCount,
        input.totalBytes,
        input.manifestR2Key,
        input.packetR2Key,
        input.packetSourceId,
        input.indexStatus,
        input.indexError ?? null,
      ),
      this.db.prepare(
        `UPDATE repository_connections SET
           active_snapshot_id = ?2, sync_status = 'ready', last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1`,
      ).bind(input.connectionId, input.snapshotId),
      this.db.prepare(
        `INSERT INTO project_revisions (
           project_id, revision_id, parent_revision_id, reason
         )
         SELECT id, ?2, active_revision, 'repository-snapshot'
         FROM projects WHERE id = ?1`,
      ).bind(input.projectId, revision),
      this.db.prepare(
        `INSERT OR IGNORE INTO revision_source_versions (
           project_id, revision_id, source_id, source_version_id
         )
         SELECT memberships.project_id, ?2, memberships.source_id, memberships.source_version_id
         FROM revision_source_versions memberships
         JOIN projects project ON project.id = memberships.project_id
         WHERE memberships.project_id = ?1
           AND memberships.revision_id = project.active_revision`,
      ).bind(input.projectId, revision),
      this.db.prepare(
        `INSERT OR IGNORE INTO revision_source_versions (
           project_id, revision_id, source_id, source_version_id
         )
         SELECT project_id, ?2, id, version_id FROM sources
         WHERE project_id = ?1 AND id = ?3`,
      ).bind(input.projectId, revision, input.packetSourceId),
      this.db.prepare(
        `UPDATE projects SET active_revision = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1`,
      ).bind(input.projectId, revision),
    ]);
    return revision;
  }

  async updateRepositorySnapshotIndexStatus(
    snapshotId: string,
    status: SourceIndexStatus,
    error: string | null = null,
  ): Promise<void> {
    await this.db.prepare(
      `UPDATE repository_snapshots SET index_status = ?2, index_error = ?3 WHERE id = ?1`,
    ).bind(snapshotId, status, error).run();
  }

  async activateRepositorySnapshot(connectionId: string, snapshotId: string, projectId: string): Promise<string> {
    const revision = `repository:${snapshotId}`;
    if (!(await this.hasProjectRevision(projectId, revision))) {
      throw new Error("The repository snapshot predates revision membership and cannot be replayed safely.");
    }
    await this.db.batch([
      this.db.prepare(
        `UPDATE repository_connections SET active_snapshot_id = ?2, sync_status = 'ready',
           last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?1`,
      ).bind(connectionId, snapshotId),
      this.db.prepare(
        `UPDATE projects SET active_revision = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1`,
      ).bind(projectId, revision),
    ]);
    return revision;
  }

  async failRepositorySnapshot(input: {
    snapshotId: string;
    connectionId: string;
    code: string;
    message: string;
  }): Promise<void> {
    const safeMessage = input.message.slice(0, 1000);
    await this.db.batch([
      this.db.prepare(
        `UPDATE repository_snapshots SET status = 'failed', failure_code = ?2,
           failure_message = ?3, completed_at = CURRENT_TIMESTAMP WHERE id = ?1`,
      ).bind(input.snapshotId, input.code, safeMessage),
      this.db.prepare(
        `UPDATE repository_connections SET sync_status = 'failed', last_error = ?2,
           updated_at = CURRENT_TIMESTAMP WHERE id = ?1`,
      ).bind(input.connectionId, safeMessage),
    ]);
  }

  async failRepositoryConnection(connectionId: string, message: string): Promise<void> {
    await this.db.prepare(
      `UPDATE repository_connections SET sync_status = 'failed', last_error = ?2,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?1`,
    ).bind(connectionId, message.slice(0, 1000)).run();
  }

  async getProviderBinding(
    projectId: string,
    internalId: string,
    kind: string,
    provider = "openai",
  ): Promise<ProviderBinding | null> {
    const result = await this.db.prepare(
      `SELECT id, project_id AS projectId, internal_id AS internalId,
              provider, kind, external_id AS externalId,
              metadata_json AS metadataJson, invalidated_at AS invalidatedAt,
              created_at AS createdAt
       FROM provider_bindings
       WHERE project_id = ?1 AND internal_id = ?2 AND provider = ?3
         AND kind = ?4 AND invalidated_at IS NULL
       LIMIT 1`,
    ).bind(projectId, internalId, provider, kind).all<ProviderBinding>();
    return first(result);
  }

  async setProviderBinding(input: {
    projectId: string;
    internalId: string;
    provider?: string;
    kind: string;
    externalId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const provider = input.provider ?? "openai";
    await this.db.prepare(
      `INSERT INTO provider_bindings (
         id, project_id, internal_id, provider, kind, external_id, metadata_json
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(project_id, internal_id, provider, kind) DO UPDATE SET
         external_id = excluded.external_id,
         metadata_json = excluded.metadata_json,
         invalidated_at = NULL`,
    ).bind(
      crypto.randomUUID(),
      input.projectId,
      input.internalId,
      provider,
      input.kind,
      input.externalId,
      JSON.stringify(input.metadata ?? {}),
    ).run();
  }

  async saveAnalysis(projectId: string, result: QueryResult): Promise<string> {
    const id = `analysis_${crypto.randomUUID()}`;
    await this.db.prepare(
      `INSERT INTO analyses (
         id, project_id, project_revision, question, answer_json, mode, model
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
    ).bind(
      id,
      projectId,
      result.answer.projectRevision,
      result.answer.question,
      JSON.stringify(result),
      result.mode,
      result.model,
    ).run();
    return id;
  }
}

function repositorySnapshotSelect(alias = ""): string {
  const prefix = alias ? `${alias}.` : "";
  const from = alias ? `repository_snapshots ${alias}` : "repository_snapshots";
  return `SELECT ${prefix}id, ${prefix}project_id AS projectId,
                 ${prefix}connection_id AS connectionId, ${prefix}commit_sha AS commitSha,
                 ${prefix}tree_sha AS treeSha, ${prefix}requested_ref AS requestedRef,
                 ${prefix}status, ${prefix}coverage_complete AS coverageComplete,
                 ${prefix}tree_truncated AS treeTruncated,
                 ${prefix}selected_file_count AS selectedFileCount,
                 ${prefix}skipped_file_count AS skippedFileCount,
                 ${prefix}total_bytes AS totalBytes, ${prefix}policy_version AS policyVersion,
                 ${prefix}manifest_r2_key AS manifestR2Key,
                 ${prefix}packet_r2_key AS packetR2Key,
                 ${prefix}packet_source_id AS packetSourceId,
                 ${prefix}index_status AS indexStatus, ${prefix}index_error AS indexError,
                 ${prefix}failure_code AS failureCode,
                 ${prefix}failure_message AS failureMessage,
                 ${prefix}created_at AS createdAt, ${prefix}completed_at AS completedAt
          FROM ${from}`;
}
