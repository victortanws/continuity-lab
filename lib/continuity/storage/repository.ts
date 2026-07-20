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
    return project;
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

  async bumpProjectRevision(projectId: string): Promise<string> {
    const revision = `revision_${crypto.randomUUID()}`;
    await this.db.prepare(
      `UPDATE projects
       SET active_revision = ?2, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?1`,
    ).bind(projectId, revision).run();
    return revision;
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
